use async_trait::async_trait;
use job_core::{ExecutionBackend, RemoteStatus, SubmissionRejected};
use project_core::Result;
use serde_json::{Value, json};
pub struct RunningHub {
    client: reqwest::Client,
    key: String,
    deployment: String,
    family: String,
    endpoint: String,
}
impl RunningHub {
    pub fn new(key: String, deployment: &str, family: &str) -> Result<Self> {
        Self::at(key, deployment, family, "https://www.runninghub.ai")
    }
    pub fn at(key: String, deployment: &str, family: &str, endpoint: &str) -> Result<Self> {
        let url = reqwest::Url::parse(endpoint)?;
        if url.scheme() != "https"
            || !matches!(
                url.host_str(),
                Some("www.runninghub.ai" | "www.runninghub.cn")
            )
            || url.path() != "/"
            || url.query().is_some()
            || url.fragment().is_some()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.port().is_some()
        {
            return Err(
                "Use https://www.runninghub.ai or https://www.runninghub.cn for RunningHub".into(),
            );
        }
        if key.is_empty()
            || (!deployment.is_empty() && !deployment.bytes().all(|b| b.is_ascii_digit()))
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
            endpoint: endpoint.trim_end_matches('/').into(),
        })
    }
    async fn post(&self, path: &str, body: Value) -> Result<Value> {
        let response = self
            .client
            .post(format!("{}{path}", self.endpoint))
            .bearer_auth(&self.key)
            .json(&body)
            .send()
            .await
            .map_err(
                |_| "RunningHub network request failed; reconcile before retrying submission",
            )?;
        let status = response.status();
        if !status.is_success() {
            let message = format!(
                "RunningHub HTTP {}. Check account access, deployment and inputs.",
                status.as_u16()
            );
            if matches!(status.as_u16(), 400 | 401 | 403 | 404 | 422 | 429) {
                return Err(SubmissionRejected(message).into());
            }
            return Err(message.into());
        }
        let v: Value = response
            .json()
            .await
            .map_err(|_| "RunningHub returned an unreadable response")?;
        check_response(&v)?;
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
        if self.deployment.is_empty() {
            return Err(SubmissionRejected(
                "Set the hosted deployment ID in Workflows before submission".into(),
            )
            .into());
        }
        // Only explicitly bound fields travel to the existing provider deployment.
        let info = graph["_mymovieNodeInfo"]
            .as_array()
            .ok_or("Verified provider bindings required")?;
        let v = if self.family == "ai-app" {
            self.post(
                &format!("/openapi/v2/run/ai-app/{}", self.deployment),
                json!({"nodeInfoList":info,"instanceType":"default","usePersonalQueue":false}),
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
            let state = task_state(v["status"].as_str());
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
        let state = task_state(v["data"].as_str());
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
            .or_else(|| output["outputUrl"].as_str())
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
            .post(format!("{}/openapi/v2/media/upload/binary", self.endpoint))
            .bearer_auth(&self.key)
            .multipart(reqwest::multipart::Form::new().part("file", part))
            .send()
            .await
            .map_err(|_| "RunningHub upload failed")?
            .error_for_status()?
            .json()
            .await?;
        check_response(&v)?;
        v["data"]["fileName"]
            .as_str()
            .map(str::to_owned)
            .ok_or_else(|| "Upload has no file name".into())
    }
}
fn check_response(v: &Value) -> Result<()> {
    if let Some(code) = v.get("code") {
        let code = code
            .as_i64()
            .or_else(|| code.as_str().and_then(|s| s.parse().ok()))
            .ok_or("RunningHub returned an invalid response code")?;
        if code != 0 {
            // Never expose provider free text, which may echo API keys or submitted prompts.
            let message = format!(
                "RunningHub API code {code}. Check the provider’s account, deployment, input schema and balance."
            );
            if v["taskId"].is_null() && v["data"]["taskId"].is_null() && !(500..600).contains(&code)
            {
                return Err(SubmissionRejected(message).into());
            }
            return Err(message.into());
        }
    }
    Ok(())
}
fn task_state(state: Option<&str>) -> &'static str {
    match state {
        Some("CREATE" | "QUEUED") => "queued",
        Some("RUNNING") => "running",
        Some("SUCCESS") => "collecting",
        Some("FAILED") => "failed",
        Some("CANCEL" | "CANCELED" | "CANCELLED") => "canceled",
        _ => "unknown",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };
    async fn mock(
        family: &str,
        status: u16,
        reply: Value,
    ) -> (RunningHub, tokio::task::JoinHandle<(String, Value)>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let task = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut bytes = vec![];
            let (head, body) = loop {
                let mut buf = [0; 4096];
                let n = stream.read(&mut buf).await.unwrap();
                assert!(n > 0);
                bytes.extend_from_slice(&buf[..n]);
                if let Some(end) = bytes.windows(4).position(|b| b == b"\r\n\r\n") {
                    let head = String::from_utf8(bytes[..end].to_vec()).unwrap();
                    let len: usize = head
                        .lines()
                        .find_map(|l| {
                            l.to_lowercase()
                                .strip_prefix("content-length: ")
                                .map(str::to_owned)
                        })
                        .unwrap()
                        .parse()
                        .unwrap();
                    if bytes.len() >= end + 4 + len {
                        break (
                            head,
                            serde_json::from_slice::<Value>(&bytes[end + 4..end + 4 + len])
                                .unwrap(),
                        );
                    }
                }
            };
            let data = reply.to_string();
            let response = format!(
                "HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{data}",
                data.len()
            );
            stream.write_all(response.as_bytes()).await.unwrap();
            (head, body)
        });
        let mut provider = RunningHub::new("test-only-key".into(), "123456789", family).unwrap();
        provider.endpoint = format!("http://{addr}");
        (provider, task)
    }
    #[tokio::test]
    async fn ai_app_submission_uses_v2_boolean_and_preserves_typed_fields() {
        let (p, request) = mock("ai-app", 200, json!({"taskId":"987"})).await;
        let info = json!([{"nodeId":"3","fieldName":"seed","fieldValue":42}]);
        assert_eq!(
            p.submit("local", &json!({"_mymovieNodeInfo":info}))
                .await
                .unwrap(),
            "987"
        );
        let (head, body) = request.await.unwrap();
        assert!(head.starts_with("POST /openapi/v2/run/ai-app/123456789 "));
        assert!(
            head.to_lowercase()
                .contains("authorization: bearer test-only-key")
        );
        assert_eq!(body["usePersonalQueue"], false);
        assert_eq!(body["nodeInfoList"], info);
        assert!(body.get("apiKey").is_none());
    }
    #[tokio::test]
    async fn workflow_submission_uses_selected_deployment() {
        let (p, request) = mock("workflow", 200, json!({"code":0,"data":{"taskId":"988"}})).await;
        assert_eq!(
            p.submit("local", &json!({"_mymovieNodeInfo":[]}))
                .await
                .unwrap(),
            "988"
        );
        let (head, body) = request.await.unwrap();
        assert!(head.starts_with("POST /task/openapi/create "));
        assert_eq!(body["workflowId"], "123456789");
        assert_eq!(body["apiKey"], "test-only-key");
    }
    #[tokio::test]
    async fn explicit_rejection_is_safe_and_missing_task_id_is_ambiguous() {
        let (p, request) = mock(
            "workflow",
            200,
            json!({"code":421,"msg":"test-only-key secret prompt"}),
        )
        .await;
        let e = p
            .submit("local", &json!({"_mymovieNodeInfo":[]}))
            .await
            .unwrap_err();
        assert!(e.downcast_ref::<SubmissionRejected>().is_some());
        assert!(e.to_string().contains("421"));
        assert!(!e.to_string().contains("test-only-key"));
        request.await.unwrap();
        let (p, request) = mock("ai-app", 200, json!({"status":"CREATE"})).await;
        let e = p
            .submit("local", &json!({"_mymovieNodeInfo":[]}))
            .await
            .unwrap_err();
        assert!(e.downcast_ref::<SubmissionRejected>().is_none());
        request.await.unwrap();
    }
    #[tokio::test]
    async fn http_rejections_free_admission_but_server_errors_remain_ambiguous() {
        for (status, rejected) in [(401, true), (500, false)] {
            let (p, request) = mock("workflow", status, json!({})).await;
            let e = p
                .submit("local", &json!({"_mymovieNodeInfo":[]}))
                .await
                .unwrap_err();
            assert_eq!(e.downcast_ref::<SubmissionRejected>().is_some(), rejected);
            request.await.unwrap();
        }
    }
    #[tokio::test]
    async fn status_handles_created_and_canceled_tasks() {
        for (remote, state) in [
            ("CREATE", "queued"),
            ("CANCEL", "canceled"),
            ("SUCCESS", "collecting"),
        ] {
            let (p, request) = mock("ai-app", 200, json!({"status":remote,"results":[{"outputUrl":"https://example.test/result.mp4"}]})).await;
            let status = p.status("987").await.unwrap();
            assert_eq!(status.state, state);
            assert_eq!(status.outputs.len(), 1);
            request.await.unwrap();
        }
    }
    #[test]
    fn account_can_be_checked_before_mapping_and_credentials_cannot_go_to_other_hosts() {
        assert!(RunningHub::at("test".into(), "", "workflow", "https://www.runninghub.ai").is_ok());
        assert!(RunningHub::at("test".into(), "123", "workflow", "https://example.com").is_err());
        assert!(check_response(&json!({"code":"0"})).is_ok());
        assert!(check_response(&json!({"code":"secret"})).is_err());
    }
}
