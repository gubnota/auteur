use project_core::Result;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::Path;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Object {
    pub name: String,
    pub sha256: String,
    pub size: u64,
    pub url: String,
    pub architecture: Option<String>,
    pub license: Option<String>,
}
pub fn validate_url(raw: &str) -> Result<reqwest::Url> {
    let u = reqwest::Url::parse(raw)?;
    if u.scheme() != "https"
        && !(u.scheme() == "http"
            && matches!(u.host_str(), Some("localhost" | "127.0.0.1" | "minio")))
    {
        return Err("Transfer requires HTTPS (loopback Docker test excepted)".into());
    }
    if !u.username().is_empty() || u.password().is_some() {
        return Err("URL user credentials forbidden".into());
    }
    Ok(u)
}
fn client() -> Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(600))
        .build()?)
}
pub async fn manifest(url: &str) -> Result<Vec<Object>> {
    Ok(client()?
        .get(validate_url(url)?)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?)
}
pub async fn download(o: &Object, dest: &Path) -> Result<()> {
    download_with_progress(o, dest, |_, _| {}).await
}
pub async fn download_with_progress(
    o: &Object,
    dest: &Path,
    mut progress: impl FnMut(u64, u64),
) -> Result<()> {
    if o.sha256.len() != 64
        || !o.sha256.bytes().all(|b| b.is_ascii_hexdigit())
        || o.size > 32 * 1024 * 1024 * 1024
    {
        return Err("Invalid object integrity metadata".into());
    }
    let tmp = dest.with_file_name(format!("{}.partial", o.sha256));
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    // Resume is allowed only for this immutable hash; a server ignoring Range restarts safely.
    let mut offset = tokio::fs::metadata(&tmp)
        .await
        .map(|m| m.len())
        .unwrap_or(0);
    if offset > o.size {
        tokio::fs::remove_file(&tmp).await?;
        offset = 0;
    }
    progress(offset, o.size);
    if offset < o.size {
        let mut res = client()?
            .get(validate_url(&o.url)?)
            .header("Range", format!("bytes={offset}-"))
            .send()
            .await?
            .error_for_status()?;
        if res.status() == reqwest::StatusCode::PARTIAL_CONTENT {
            let expected = format!("bytes {offset}-");
            if !res
                .headers()
                .get("content-range")
                .and_then(|v| v.to_str().ok())
                .is_some_and(|v| v.starts_with(&expected))
            {
                return Err("Invalid resumed range".into());
            }
        } else {
            offset = 0;
        }
        let mut f = tokio::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .append(offset > 0)
            .truncate(offset == 0)
            .open(&tmp)
            .await?;
        use tokio::io::AsyncWriteExt;
        while let Some(bytes) = res.chunk().await? {
            offset += bytes.len() as u64;
            if offset > o.size {
                return Err("Object exceeds declared size".into());
            }
            f.write_all(&bytes).await?;
            progress(offset, o.size);
        }
        f.sync_all().await?;
    }
    use tokio::io::AsyncReadExt;
    let mut f = tokio::fs::File::open(&tmp).await?;
    let mut hash = Sha256::new();
    let mut count = 0u64;
    let mut buf = [0u8; 65536];
    loop {
        let n = f.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        count += n as u64;
        hash.update(&buf[..n]);
    }
    if count != o.size || format!("{:x}", hash.finalize()) != o.sha256 {
        tokio::fs::remove_file(&tmp).await?;
        return Err("Object hash/size mismatch".into());
    }
    tokio::fs::rename(&tmp, dest).await?;
    Ok(())
}
pub async fn upload(o: &Object, path: &Path) -> Result<()> {
    use tokio::io::AsyncReadExt;
    let mut file = tokio::fs::File::open(path).await?;
    let mut hash = Sha256::new();
    let mut size = 0u64;
    let mut buffer = [0u8; 65536];
    loop {
        let n = file.read(&mut buffer).await?;
        if n == 0 {
            break;
        }
        size += n as u64;
        hash.update(&buffer[..n]);
    }
    if size != o.size || format!("{:x}", hash.finalize()) != o.sha256 {
        return Err("Upload integrity mismatch".into());
    }
    let stream = tokio_util::io::ReaderStream::new(tokio::fs::File::open(path).await?);
    client()?
        .put(validate_url(&o.url)?)
        .header(reqwest::header::CONTENT_LENGTH, size)
        .body(reqwest::Body::wrap_stream(stream))
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}
