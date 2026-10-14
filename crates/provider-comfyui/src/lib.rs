use async_trait::async_trait;
use job_core::{ExecutionBackend, RemoteStatus};
use project_core::Result;
use reqwest::{Client, multipart};
use serde_json::{Value, json};
use std::time::Duration;
pub struct ComfyUi {
    pub url: String,
    client: Client,
}
impl ComfyUi {
    pub fn new(url: &str) -> Result<Self> {
        let url = url.trim_end_matches('/');
        let parsed = reqwest::Url::parse(url)?;
        if !["http", "https"].contains(&parsed.scheme())
            || parsed.host_str().is_none()
            || !parsed.username().is_empty()
            || parsed.password().is_some()
        {
            return Err("Invalid ComfyUI URL".into());
        }
        Ok(Self {
            url: url.into(),
            client: Client::builder().timeout(Duration::from_secs(45)).build()?,
        })
    }
    async fn get(&self, path: &str) -> Result<Value> {
        Ok(self
            .client
            .get(format!("{}{path}", self.url))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?)
    }
    pub async fn websocket_event(&self, client_id: &str) -> Result<Value> {
        use futures_util::StreamExt;
        let base = self.url.replacen("http", "ws", 1);
        let (mut socket, _) =
            tokio_tungstenite::connect_async(format!("{base}/ws?clientId={client_id}")).await?;
        let message = tokio::time::timeout(Duration::from_secs(30), socket.next())
            .await?
            .ok_or("WebSocket closed")??;
        Ok(serde_json::from_str(message.to_text()?)?)
    }
}
#[async_trait]
impl ExecutionBackend for ComfyUi {
    async fn health(&self) -> Result<Value> {
        let stats = self.get("/system_stats").await?;
        let registry = self.get("/object_info").await?;
        Ok(
            json!({"connected":true,"stats":stats,"nodeTypes":registry.as_object().map(|o|o.keys().collect::<Vec<_>>()),"transport":"HTTP + WebSocket; history recovery","initialization":"Requires private runner; direct ComfyUI has no remote shell"}),
        )
    }
    async fn validate_compatibility(&self, compatibility: &str) -> Result<()> {
        let stats = self.get("/system_stats").await?;
        if !job_core::compatible(compatibility, &stats["devices"]) {
            return Err(
                format!("Workflow requires {compatibility}; select a compatible node").into(),
            );
        }
        Ok(())
    }
    async fn validate_job(&self, graph: &Value) -> Result<()> {
        let registry = self.get("/object_info").await?;
        for (id, n) in graph.as_object().ok_or("Graph is not an object")? {
            let ty = n["class_type"].as_str().ok_or("Node has no type")?;
            let definition = registry
                .get(ty)
                .ok_or_else(|| format!("Missing node type {ty} ({id})"))?;
            for (key, v) in n["inputs"].as_object().ok_or("Missing inputs")? {
                let spec = definition["input"]["required"]
                    .get(key)
                    .or_else(|| definition["input"]["optional"].get(key));
                let Some(spec) = spec else { continue };
                if v.is_array() {
                    continue;
                }
                if let Some(options) = spec[0].as_array() {
                    if !options.contains(v) {
                        return Err(format!("Unavailable {ty}.{key}").into());
                    }
                }
                match spec[0].as_str() {
                    Some("INT") if !v.is_i64() && !v.is_u64() => {
                        return Err(format!("{ty}.{key} requires integer").into());
                    }
                    Some("FLOAT") if !v.is_number() => return Err("Expected number".into()),
                    Some("BOOLEAN") if !v.is_boolean() => return Err("Expected Boolean".into()),
                    Some("STRING") if !v.is_string() => return Err("Expected text".into()),
                    _ => {}
                }
            }
        }
        Ok(())
    }
    async fn validate_media(
        &self,
        graph: &Value,
        bindings: &[studio_contracts::Binding],
    ) -> Result<()> {
        let registry = self.get("/object_info").await?;
        for b in bindings.iter().filter(|b| {
            b.media.is_some()
                || matches!(b.semantic.as_str(), "image" | "mask")
                || b.semantic.starts_with("characterReference")
        }) {
            let ty = graph[&b.node_id]["class_type"]
                .as_str()
                .ok_or("Media loader missing")?;
            let definition = &registry[ty];
            let spec = definition["input"]["required"]
                .get(&b.input)
                .or_else(|| definition["input"]["optional"].get(&b.input));
            let kind = b.media.as_ref().map(|m| m.kind.as_str()).unwrap_or("image");
            let flag = format!("{kind}_upload");
            let advertised = spec.is_some_and(|s| s[1][&flag] == true);
            let supported = match (kind, ty, b.input.as_str()) {
                ("image", "LoadImage" | "LoadImageMask", "image") => true,
                ("audio", "LoadAudio", "audio") => true,
                ("video", "VHS_LoadVideo", "video") => true,
                _ => advertised,
            };
            if !supported {
                return Err(format!("Unsupported {kind} loader {ty}.{}: map an upload-capable file input instead of a folder or batch loader", b.input).into());
            }
        }
        Ok(())
    }
    async fn submit(&self, attempt: &str, graph: &Value) -> Result<String> {
        let res:Value=self.client.post(format!("{}/prompt",self.url)).json(&json!({"prompt":graph,"client_id":attempt,"extra_data":{"mymovie_attempt":attempt}})).send().await?.error_for_status()?.json().await?;
        Ok(res["prompt_id"]
            .as_str()
            .ok_or("Submission has no prompt ID")?
            .into())
    }
    async fn status(&self, remote: &str) -> Result<RemoteStatus> {
        let history = self.get(&format!("/history/{remote}")).await?;
        if let Some(record) = history.get(remote) {
            if record["status"]["status_str"] == "error" {
                return Ok(RemoteStatus {
                    state: "failed".into(),
                    outputs: vec![],
                    error: Some("ComfyUI execution failed; inspect server diagnostics".into()),
                });
            }
            let outputs = record["outputs"]
                .as_object()
                .into_iter()
                .flat_map(|o| o.values())
                .flat_map(|n| {
                    ["images", "gifs", "videos", "audio"]
                        .into_iter()
                        .flat_map(move |k| n[k].as_array().into_iter().flatten().cloned())
                })
                .collect();
            return Ok(RemoteStatus {
                state: if record["status"]["completed"].as_bool().unwrap_or(false) {
                    "collecting"
                } else {
                    "running"
                }
                .into(),
                outputs,
                error: None,
            });
        }
        let queue = self.get("/queue").await?;
        for (k, state) in [("queue_running", "running"), ("queue_pending", "queued")] {
            if queue[k]
                .as_array()
                .is_some_and(|v| v.iter().any(|x| x[1].as_str() == Some(remote)))
            {
                return Ok(RemoteStatus {
                    state: state.into(),
                    outputs: vec![],
                    error: None,
                });
            }
        }
        Ok(RemoteStatus {
            state: "unknown".into(),
            outputs: vec![],
            error: Some("Task absent from queue/history; do not resubmit automatically".into()),
        })
    }
    async fn cancel(&self, remote: &str) -> Result<()> {
        let queue = self.get("/queue").await?;
        if !queue["queue_pending"]
            .as_array()
            .is_some_and(|v| v.iter().any(|x| x[1].as_str() == Some(remote)))
        {
            return Err("Running cancellation is unavailable on this server version; global interrupt is deliberately blocked".into());
        }
        self.client
            .post(format!("{}/queue", self.url))
            .json(&json!({"delete":[remote]}))
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }
    async fn collect(&self, output: &Value) -> Result<(String, Vec<u8>)> {
        let filename = output["filename"]
            .as_str()
            .ok_or("Output filename missing")?;
        let mut response = self
            .client
            .get(format!("{}/view", self.url))
            .query(&[
                ("filename", filename),
                ("subfolder", output["subfolder"].as_str().unwrap_or("")),
                ("type", output["type"].as_str().unwrap_or("output")),
            ])
            .send()
            .await?
            .error_for_status()?;
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await? {
            if bytes.len() + chunk.len() > 1024 * 1024 * 1024 {
                return Err("Result exceeds collection limit".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok((filename.into(), bytes))
    }
    async fn stage_asset(&self, asset: &studio_contracts::Asset, bytes: Vec<u8>) -> Result<String> {
        let name = job_core::staging_name(asset)?;
        let form = multipart::Form::new()
            .part(
                "image",
                multipart::Part::bytes(bytes).file_name(name.to_owned()),
            )
            .text("overwrite", "false");
        let response: Value = self
            .client
            .post(format!("{}/upload/image", self.url))
            .multipart(form)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        let name = response["name"]
            .as_str()
            .ok_or("Upload returned no filename")?;
        let sub = response["subfolder"].as_str().unwrap_or("");
        Ok(if sub.is_empty() {
            name.into()
        } else {
            format!("{sub}/{name}")
        })
    }
}
