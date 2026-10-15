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
    progress: impl FnMut(u64, u64),
) -> Result<()> {
    download_authenticated(o, dest, None, progress).await
}
/// Optional node-local Hugging Face credentials never follow a cross-origin redirect.
pub async fn download_authenticated(
    o: &Object,
    dest: &Path,
    bearer: Option<&str>,
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
        let client = client()?;
        let original = validate_url(&o.url)?;
        let mut url = original.clone();
        let mut redirects = 0;
        let mut res = loop {
            let mut request = client
                .get(url.clone())
                .header("Range", format!("bytes={offset}-"));
            if credentials_allowed(&original, &url)
                && let Some(token) = bearer
            {
                request = request.bearer_auth(token);
            }
            let response = request.send().await?;
            if response.status().is_redirection() {
                if redirects >= 5 {
                    return Err("Too many download redirects".into());
                }
                let location = response
                    .headers()
                    .get(reqwest::header::LOCATION)
                    .ok_or("Missing redirect destination")?
                    .to_str()?;
                url = redirect_destination(&url, location)?;
                redirects += 1;
                continue;
            }
            if matches!(response.status().as_u16(), 401 | 403) {
                return Err("Model access denied: accept the upstream model terms and sign in with hf auth login on this node".into());
            }
            if !response.status().is_success() {
                return Err(format!("Model download HTTP {}", response.status().as_u16()).into());
            }
            break response;
        };
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

fn credentials_allowed(original: &reqwest::Url, current: &reqwest::Url) -> bool {
    original.scheme() == "https"
        && original.host_str() == Some("huggingface.co")
        && original.origin() == current.origin()
}
fn redirect_destination(current: &reqwest::Url, location: &str) -> Result<reqwest::Url> {
    let next = validate_url(current.join(location)?.as_str())?;
    if current.scheme() == "https" && next.scheme() != "https" {
        return Err("Download redirect cannot downgrade HTTPS".into());
    }
    Ok(next)
}
#[cfg(test)]
mod redirect_tests {
    use super::*;
    #[test]
    fn credentials_only_go_to_original_huggingface_origin() {
        let source = validate_url("https://huggingface.co/model/resolve/pinned/model").unwrap();
        assert!(credentials_allowed(
            &source,
            &redirect_destination(&source, "/other").unwrap()
        ));
        assert!(!credentials_allowed(
            &source,
            &redirect_destination(&source, "https://cdn.example/model").unwrap()
        ));
        assert!(!credentials_allowed(
            &source,
            &redirect_destination(&source, "https://huggingface.co:8443/model").unwrap()
        ));
        assert!(redirect_destination(&source, "http://127.0.0.1/model").is_err());
        assert!(redirect_destination(&source, "https://token@cdn.example/model").is_err());
    }
}
