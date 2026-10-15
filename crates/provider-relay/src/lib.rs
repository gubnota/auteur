use async_trait::async_trait;
use job_core::{ExecutionBackend, RemoteStatus};
use project_core::Result;
use serde_json::{Value, json};
pub struct Relay {
    pub url: String,
    pub token: String,
    pub node: String,
    client: reqwest::Client,
    profile: std::sync::Mutex<Value>,
}
impl Relay {
    pub fn new(url: &str, token: String, node: &str) -> Result<Self> {
        storage_s3::validate_url(url)?;
        if node.is_empty() {
            return Err("Configure runner node ID as deployment ID".into());
        }
        Ok(Self {
            url: url.trim_end_matches('/').into(),
            token,
            node: node.into(),
            profile: std::sync::Mutex::new(Value::Null),
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .redirect(reqwest::redirect::Policy::none())
                .build()?,
        })
    }
    pub async fn get(&self, path: &str) -> Result<Value> {
        Ok(self
            .client
            .get(format!("{}{path}", self.url))
            .bearer_auth(&self.token)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?)
    }
    pub async fn post(&self, path: &str, payload: Value) -> Result<Value> {
        let response = self
            .client
            .post(format!("{}{path}", self.url))
            .bearer_auth(&self.token)
            .json(&payload)
            .send()
            .await?;
        if !response.status().is_success() {
            return Err(response
                .text()
                .await?
                .chars()
                .take(1000)
                .collect::<String>()
                .into());
        }
        Ok(response.json().await?)
    }
    pub async fn command(&self, action: &str, payload: Value) -> Result<Value> {
        if ![
            "initialize",
            "runtime-restart",
            "doctor",
            "inventory",
            "drain",
            "bootstrap",
            "provision",
            "workflow-inspect",
            "workflow-install",
            "workflow-compile",
        ]
        .contains(&action)
        {
            return Err("Unknown runner action".into());
        }
        let attempt = project_core::id();
        self.post(
            "/v1/jobs",
            json!({"id":attempt,"nodeId":self.node,"kind":action,"payload":payload}),
        )
        .await
    }
    pub async fn events(&self, after: u64) -> Result<reqwest::Response> {
        Ok(self
            .client
            .get(format!("{}/v1/events", self.url))
            .bearer_auth(&self.token)
            .header("Last-Event-ID", after.to_string())
            .send()
            .await?
            .error_for_status()?)
    }
}
#[async_trait]
impl ExecutionBackend for Relay {
    async fn health(&self) -> Result<Value> {
        self.get(&format!("/v1/nodes/{}", self.node)).await
    }
    async fn validate_compatibility(&self, compatibility: &str) -> Result<()> {
        let health = self.health().await?;
        if !job_core::compatible(compatibility, &health["comfy"]["stats"]["devices"]) {
            return Err(format!(
                "Workflow requires {compatibility}; this node does not report compatible hardware"
            )
            .into());
        }
        Ok(())
    }
    async fn validate_profile(&self, profile: &Value) -> Result<()> {
        *self.profile.lock().map_err(|_| "Profile lock failed")? = profile.clone();
        Ok(())
    }
    async fn validate_job(&self, graph: &Value) -> Result<()> {
        workflow_core_validate(graph)
    }
    async fn submit(&self, attempt: &str, graph: &Value) -> Result<String> {
        let profile = self
            .profile
            .lock()
            .map_err(|_| "Profile lock failed")?
            .clone();
        let payload = if profile.is_null() {
            graph.clone()
        } else {
            json!({"graph":graph,"compiledProfile":profile})
        };
        self.client
            .post(format!("{}/v1/jobs", self.url))
            .bearer_auth(&self.token)
            .json(&json!({"id":attempt,"nodeId":self.node,"kind":"generation","payload":payload}))
            .send()
            .await?
            .error_for_status()?;
        Ok(attempt.into())
    }
    async fn status(&self, remote: &str) -> Result<RemoteStatus> {
        let v = self.get(&format!("/v1/jobs/{remote}")).await?;
        Ok(RemoteStatus {
            state: if v["state"] == "completed" {
                "collecting"
            } else {
                v["state"].as_str().unwrap_or("unknown")
            }
            .into(),
            outputs: v["outputs"].as_array().cloned().unwrap_or_default(),
            error: v["error"].as_str().map(str::to_owned),
        })
    }
    async fn cancel(&self, remote: &str) -> Result<()> {
        self.client
            .post(format!("{}/v1/jobs/{remote}/cancel", self.url))
            .bearer_auth(&self.token)
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }
    async fn collect(&self, output: &Value) -> Result<(String, Vec<u8>)> {
        let id = output["id"]
            .as_str()
            .ok_or("Missing relay output identity")?;
        uuid_check(id)?;
        let mut res = self
            .client
            .get(format!("{}/v1/assets/{id}", self.url))
            .bearer_auth(&self.token)
            .send()
            .await?
            .error_for_status()?;
        let mut bytes = vec![];
        while let Some(c) = res.chunk().await? {
            if bytes.len() + c.len() > 1024 * 1024 * 1024 {
                return Err("Output exceeds limit".into());
            }
            bytes.extend_from_slice(&c);
        }
        Ok((
            output["name"].as_str().unwrap_or("result.png").into(),
            bytes,
        ))
    }
    async fn stage_asset(&self, asset: &studio_contracts::Asset, bytes: Vec<u8>) -> Result<String> {
        let v: Value = self
            .client
            .post(format!("{}/v1/assets", self.url))
            .bearer_auth(&self.token)
            .header("x-asset-name", job_core::staging_name(asset)?)
            .header("x-asset-kind", &asset.kind)
            .body(bytes)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        Ok(format!(
            "relay-asset:{}",
            v["id"].as_str().ok_or("Missing relay asset ID")?
        ))
    }
}
fn uuid_check(s: &str) -> Result<()> {
    if s.len() != 36 || !s.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-') {
        return Err("Invalid output ID".into());
    }
    Ok(())
}
fn workflow_core_validate(v: &Value) -> Result<()> {
    if !v.is_object() {
        return Err("Missing graph".into());
    }
    Ok(())
}
