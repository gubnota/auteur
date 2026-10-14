use super::*;
use sha2::{Digest, Sha256};

const LIMIT: usize = 16 * 1024 * 1024;
fn publication(name: &str, source: &Value) -> Result<(String, String, Vec<u8>)> {
    if source["nodes"].as_array().is_none() || source["links"].as_array().is_none() {
        return Err("Install requires the original editor workflow, with nodes and links".into());
    }
    let body = serde_json::to_vec(source)?;
    if body.len() > LIMIT || name.len() > 200 {
        return Err("Workflow exceeds 16 MiB or its name exceeds 200 bytes".into());
    }
    let hash = format!("{:x}", Sha256::digest(&body));
    let slug: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' {
                c
            } else {
                '_'
            }
        })
        .take(80)
        .collect();
    let path = format!(
        "workflows/MyMovie/{}-{}.json",
        if slug.is_empty() { "workflow" } else { &slug },
        &hash[..16]
    );
    Ok((path, hash, body))
}
async fn bounded(mut response: reqwest::Response) -> Result<Value> {
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        if bytes.len() + chunk.len() > LIMIT {
            return Err("Workflow readback exceeds 16 MiB".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(serde_json::from_slice(&bytes)?)
}
impl ComfyUi {
    /// Save in the selected instance's workflow library; never touch its active canvas.
    pub async fn install_workflow(&self, name: &str, source: &Value) -> Result<Value> {
        let (path, hash, body) = publication(name, source)?;
        let encoded: String = reqwest::Url::parse("http://unused")?
            .query_pairs_mut()
            .append_pair("file", &path)
            .finish()
            .query()
            .unwrap()
            .trim_start_matches("file=")
            .to_string();
        let url = format!("{}/userdata/{encoded}", self.url);
        let existing = self.client.get(&url).send().await?;
        let reused = if existing.status() == reqwest::StatusCode::NOT_FOUND {
            let result = self
                .client
                .post(format!("{url}?overwrite=false&full_info=true"))
                .header("Content-Type", "application/json")
                .body(body)
                .send()
                .await?;
            if result.status() != reqwest::StatusCode::CONFLICT {
                result.error_for_status()?;
            }
            false
        } else {
            if bounded(existing.error_for_status()?).await? != *source {
                return Err("Saved workflow conflict; existing content was not overwritten".into());
            }
            true
        };
        let readback = bounded(self.client.get(&url).send().await?.error_for_status()?).await?;
        if readback != *source {
            return Err("Workflow publication readback differs; inspect the selected node".into());
        }
        Ok(
            json!({"libraryPath":path,"sourceHash":hash,"installed":true,"reused":reused,"loadedCanvas":false}),
        )
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn server(responses: Vec<(u16, Value)>) -> (String, std::thread::JoinHandle<Vec<String>>) {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let worker = std::thread::spawn(move || {
            let mut requests = vec![];
            for (status, body) in responses {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut header = vec![];
                while !header.ends_with(b"\r\n\r\n") {
                    let mut byte = [0];
                    stream.read_exact(&mut byte).unwrap();
                    header.push(byte[0]);
                }
                let header = String::from_utf8(header).unwrap();
                let length = header
                    .lines()
                    .find_map(|line| {
                        line.to_lowercase()
                            .strip_prefix("content-length:")
                            .and_then(|v| v.trim().parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                let mut request_body = vec![0; length];
                stream.read_exact(&mut request_body).unwrap();
                requests.push(header);
                let bytes = serde_json::to_vec(&body).unwrap();
                write!(stream, "HTTP/1.1 {status} Fixture\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", bytes.len()).unwrap();
                stream.write_all(&bytes).unwrap();
            }
            requests
        });
        (url, worker)
    }
    #[tokio::test]
    async fn existing_content_is_reused_without_a_write() {
        let source = json!({"nodes":[],"links":[]});
        let (url, worker) = server(vec![(200, source.clone()), (200, source.clone())]);
        let receipt = ComfyUi::new(&url)
            .unwrap()
            .install_workflow("Test", &source)
            .await
            .unwrap();
        assert_eq!(receipt["reused"], true);
        assert_eq!(receipt["loadedCanvas"], false);
        assert!(worker.join().unwrap().iter().all(|r| r.starts_with("GET ")));
    }
    #[tokio::test]
    async fn conflicting_content_is_never_overwritten() {
        let (url, worker) = server(vec![(200, json!({"nodes":[1],"links":[]}))]);
        let error = ComfyUi::new(&url)
            .unwrap()
            .install_workflow("Test", &json!({"nodes":[],"links":[]}))
            .await
            .unwrap_err();
        assert!(error.to_string().contains("not overwritten"));
        assert!(worker.join().unwrap()[0].starts_with("GET "));
    }
    #[tokio::test]
    async fn publication_requires_verified_readback_even_after_a_conflict_race() {
        for status in [200, 409] {
            let (url, worker) = server(vec![
                (404, json!({})),
                (status, json!({})),
                (200, json!({"nodes":[1],"links":[]})),
            ]);
            let error = ComfyUi::new(&url)
                .unwrap()
                .install_workflow("Test", &json!({"nodes":[],"links":[]}))
                .await
                .unwrap_err();
            assert!(error.to_string().contains("readback differs"));
            let requests = worker.join().unwrap();
            assert!(requests[1].starts_with("POST "));
            assert!(requests[1].contains("overwrite=false"));
        }
    }
    #[test]
    fn publication_is_confined_and_versioned() {
        let source = json!({"nodes":[],"links":[]});
        let (path, hash, _) = publication("../../a/b", &source).unwrap();
        assert!(path.starts_with("workflows/MyMovie/"));
        assert!(!path.contains(".."));
        assert_eq!(publication("../../a/b", &source).unwrap().0, path);
        assert_ne!(
            publication("../../a/b", &json!({"nodes":[],"links":[],"extra":1}))
                .unwrap()
                .1,
            hash
        );
        assert!(publication("API", &json!({"1":{"class_type":"LoadImage"}})).is_err());
    }
}
