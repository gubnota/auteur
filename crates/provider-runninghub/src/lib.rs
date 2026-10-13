use async_trait::async_trait;
use job_core::{ExecutionBackend, RemoteStatus};
use project_core::Result;
use serde_json::{Value, json};
pub struct RunningHub {
    client: reqwest::Client,
    key: String,
    deployment: String,
    family: String,
}
impl RunningHub {
    pub fn new(key: String, deployment: &str, family: &str) -> Result<Self> {
        if key.is_empty()
            || deployment.is_empty()
            || !deployment.bytes().all(|b| b.is_ascii_digit())
            || !["workflow", "ai-app"].contains(&family)
        {
            return Err("Configure an authorized deployment and API family".into());
        }
        Ok(Self {
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(60))
                .build()?,
            key,
            deployment: deployment.into(),
            family: family.into(),
        })
    }
    async fn post(&self, path: &str, body: Value) -> Result<Value> {
        let response = self
            .client
            .post(format!("https://www.runninghub.ai{path}"))
            .bearer_auth(&self.key)
            .json(&body)
            .send()
            .await
            .map_err(
                |_| "RunningHub network request failed; reconcile before retrying submission",
            )?;
        if !response.status().is_success() {
            return Err(format!("RunningHub HTTP {}", response.status()).into());
        }
        let v: Value = response.json().await?;
        if v.get("code").is_some_and(|c| c != 0) {
            return Err(format!("RunningHub API code {}", v["code"]).into());
        }
        Ok(v)
    }
}
#[async_trait]
impl ExecutionBackend for RunningHub {
    async fn health(&self) -> Result<Value> {
        let v = self
            .post("/uc/openapi/accountStatus", json!({"apiKey":self.key}))
            .await?;
        Ok(json!({"connected":true,"account":v["data"]}))
    }
    async fn validate_job(&self, graph: &Value) -> Result<()> {
        workflow_core::validate_graph(graph)
    }
    async fn submit(&self, _attempt: &str, graph: &Value) -> Result<String> {
        // Only explicitly bound fields travel to the existing provider deployment.
        let info = graph["_mymovieNodeInfo"]
            .as_array()
            .ok_or("Verified provider bindings required")?;
        let v = if self.family == "ai-app" {
            self.post(
                &format!("/openapi/v2/run/ai-app/{}", self.deployment),
                json!({"nodeInfoList":info,"instanceType":"default","usePersonalQueue":"false"}),
            )
            .await?
        } else {
            self.post("/task/openapi/create",json!({"apiKey":self.key,"workflowId":self.deployment,"nodeInfoList":info,"addMetadata":true})).await?
        };
        v["taskId"]
            .as_str()
            .or_else(|| v["data"]["taskId"].as_str())
            .map(str::to_owned)
            .ok_or_else(|| "RunningHub omitted task ID; reconcile this attempt".into())
    }
    async fn status(&self, remote: &str) -> Result<RemoteStatus> {
        if self.family == "ai-app" {
            let v = self
                .post("/openapi/v2/query", json!({"taskId":remote}))
                .await?;
            let state = match v["status"].as_str() {
                Some("QUEUED") => "queued",
                Some("RUNNING") => "running",
                Some("SUCCESS") => "collecting",
                Some("FAILED") => "failed",
                _ => "unknown",
            };
            return Ok(RemoteStatus {
                state: state.into(),
                outputs: v["results"].as_array().cloned().unwrap_or_default(),
                error: (state == "failed").then(|| "RunningHub execution failed".into()),
            });
        }
        let v = self
            .post(
                "/task/openapi/status",
                json!({"apiKey":self.key,"taskId":remote}),
            )
            .await?;
        let state = match v["data"].as_str() {
            Some("QUEUED") => "queued",
            Some("RUNNING") => "running",
            Some("SUCCESS") => "collecting",
            Some("FAILED") => "failed",
            _ => "unknown",
        };
        let outputs = if state == "collecting" {
            self.post(
                "/task/openapi/outputs",
                json!({"apiKey":self.key,"taskId":remote}),
            )
            .await?["data"]
                .as_array()
                .cloned()
                .unwrap_or_default()
        } else {
            vec![]
        };
        Ok(RemoteStatus {
            state: state.into(),
            outputs,
            error: (state == "failed").then(|| "RunningHub execution failed".into()),
        })
    }
    async fn cancel(&self, remote: &str) -> Result<()> {
        self.post(
            "/task/openapi/cancel",
            json!({"apiKey":self.key,"taskId":remote}),
        )
        .await?;
        Ok(())
    }
    async fn collect(&self, output: &Value) -> Result<(String, Vec<u8>)> {
        let url = output["url"]
            .as_str()
            .or_else(|| output["fileUrl"].as_str())
            .ok_or("Missing output URL")?;
        let u = reqwest::Url::parse(url)?;
        if u.scheme() != "https" {
            return Err("Provider output requires HTTPS".into());
        }
        let name = u
            .path_segments()
            .and_then(|mut s| s.next_back())
            .unwrap_or("result.mp4")
            .to_string();
        let mut response = self
            .client
            .get(u)
            .send()
            .await
            .map_err(|_| "Provider result download failed")?
            .error_for_status()?;
        let mut bytes = vec![];
        while let Some(chunk) = response.chunk().await? {
            if bytes.len() + chunk.len() > 1024 * 1024 * 1024 {
                return Err("Output exceeds 1 GiB desktop limit".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok((name, bytes))
    }
    async fn stage_asset(&self, name: &str, bytes: Vec<u8>) -> Result<String> {
        let part = reqwest::multipart::Part::bytes(bytes).file_name(name.to_string());
        let v: Value = self
            .client
            .post("https://www.runninghub.ai/openapi/v2/media/upload/binary")
            .bearer_auth(&self.key)
            .multipart(reqwest::multipart::Form::new().part("file", part))
            .send()
            .await
            .map_err(|_| "RunningHub upload failed")?
            .error_for_status()?
            .json()
            .await?;
        v["data"]["fileName"]
            .as_str()
            .map(str::to_owned)
            .ok_or_else(|| "Upload has no file name".into())
    }
}
