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
                "RunningHub HTTP {} at {path}. Check account access, deployment and inputs.",
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
        let mut private_values = vec![self.key.as_str()];
        collect_private_strings(&body, &mut private_values);
        check_response(&v, path, &private_values)?;
        Ok(v)
    }
}
#[async_trait]
impl ExecutionBackend for RunningHub {
    async fn validate_compatibility(&self, compatibility: &str) -> Result<()> {
        // Hosted deployments run on RunningHub's GPU fleet, not a discoverable
        // ComfyUI /system_stats endpoint. The provider validates the deployment.
        if matches!(compatibility, "unspecified" | "universal" | "cuda") {
            return Ok(());
        }
        Err(format!(
            "RunningHub uses hosted GPU deployments and cannot verify {compatibility} compatibility; select a compatible ComfyUI node"
        ).into())
    }
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
    async fn stage_asset(&self, asset: &studio_contracts::Asset, bytes: Vec<u8>) -> Result<String> {
        if asset.kind != "image" {
            return Err(
                "RunningHub media staging currently supports verified image inputs only".into(),
            );
        }
        let part = reqwest::multipart::Part::bytes(bytes).file_name(job_core::staging_name(asset)?);
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
        check_response(&v, "/openapi/v2/media/upload/binary", &[self.key.as_str()])?;
        v["data"]["fileName"]
            .as_str()
            .map(str::to_owned)
            .ok_or_else(|| "Upload has no file name".into())
    }
}
fn collect_private_strings<'a>(v: &'a Value, strings: &mut Vec<&'a str>) {
    match v {
        Value::String(s) => strings.push(s),
        Value::Array(a) => a.iter().for_each(|v| collect_private_strings(v, strings)),
        Value::Object(o) => o.values().for_each(|v| collect_private_strings(v, strings)),
        _ => {}
    }
}
fn check_response(v: &Value, operation: &str, private_values: &[&str]) -> Result<()> {
    if let Some(code) = v.get("code") {
        let code = code
            .as_i64()
            .or_else(|| code.as_str().and_then(|s| s.parse().ok()))
            .ok_or("RunningHub returned an invalid response code")?;
        if code != 0 {
            // Translate only documented codes/exact identifiers; never echo provider free text.
            let message = format!(
                "RunningHub API code {code} at {operation}. {}",
                response_reason(v, code, private_values)
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
fn response_reason(v: &Value, code: i64, private_values: &[&str]) -> String {
    // Official error table: runninghub-api-doc-en/doc-8287467. Unknown codes,
    // including 605, cannot be diagnosed from a number alone.
    const REASONS: &[(i64, &str, &str)] = &[
        (
            301,
            "PARAMS_INVALID",
            "Required parameters are missing or invalid.",
        ),
        (
            380,
            "WORKFLOW_NOT_EXISTS",
            "The hosted workflow ID does not exist. Check its saved deployment.",
        ),
        (
            412,
            "TOKEN_INVALID",
            "The API token or request URL is invalid. Check Connections.",
        ),
        (
            416,
            "TASK_CREATE_FAILED_BY_NOT_ENOUGH_WALLET",
            "RunningHub reports insufficient wallet balance.",
        ),
        (
            421,
            "TASK_QUEUE_MAXED",
            "RunningHub reports that the account concurrency limit is reached.",
        ),
        (
            433,
            "VALIDATE_PROMPT_FAILED",
            "RunningHub rejected the workflow's nodes or connections. Check its validation details in API call history.",
        ),
        (
            801,
            "APIKEY_UNSUPPORTED_FREE_USER",
            "This account needs an API-enabled membership.",
        ),
        (
            802,
            "APIKEY_UNAUTHORIZED",
            "The API key is invalid or disabled. Update it securely in Connections.",
        ),
        (
            803,
            "APIKEY_INVALID_NODE_INFO",
            "The saved input node IDs or field names do not match the hosted workflow. Check Workflows bindings.",
        ),
        (
            808,
            "APIKEY_UPLOAD_FAILED",
            "RunningHub could not store the uploaded input.",
        ),
        (
            809,
            "APIKEY_FILE_SIZE_EXCEEDED",
            "The input exceeds RunningHub's upload size limit.",
        ),
        (
            810,
            "WORKFLOW_NOT_SAVED_OR_NOT_RUNNING",
            "Save and manually run this workflow once in RunningHub, then verify its saved deployment ID in Workflows.",
        ),
        (
            811,
            "CORPAPIKEY_INVALID",
            "The enterprise key is invalid or lacks permission.",
        ),
        (
            812,
            "CORPAPIKEY_INSUFFICIENT_FUNDS",
            "RunningHub reports insufficient enterprise balance.",
        ),
        (
            901,
            "WEBAPP_NOT_EXISTS",
            "The hosted AI App ID does not exist. Check its saved deployment.",
        ),
    ];
    let identifier = v["msg"].as_str().or_else(|| v["message"].as_str());
    let reason = REASONS
        .iter()
        .find(|(_, name, _)| identifier == Some(*name))
        .or_else(|| REASONS.iter().find(|(n, _, _)| *n == code))
        .map(|(_, _, reason)| *reason);
    if let Some(reason) = reason {
        return reason.to_owned();
    }
    let safe_identifier = identifier.filter(|s| {
        (8..=96).contains(&s.len())
            && s.bytes().all(|b| b.is_ascii_uppercase() || b == b'_')
            && [
                "WORKFLOW_",
                "TASK_",
                "APIKEY_",
                "CORPAPIKEY_",
                "PARAMS_",
                "WEBAPP_",
                "TOKEN_",
                "UPLOAD_",
            ]
            .iter()
            .any(|prefix| s.starts_with(prefix))
            && !private_values
                .iter()
                .any(|private| !private.is_empty() && s.contains(*private))
    });
    let identifier_note = safe_identifier
        .map(|s| format!(" Provider identifier: {s}."))
        .unwrap_or_default();
    format!(
        "The provider's reason is not documented for this code.{identifier_note} Check this refusal before retrying."
    )
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
    #[tokio::test]
    async fn hosted_gpu_compatibility_does_not_require_comfyui_inventory() {
        for family in ["workflow", "ai-app"] {
            let p = RunningHub::new("test-only-key".into(), "123456789", family).unwrap();
            for compatibility in ["unspecified", "universal", "cuda"] {
                p.validate_compatibility(compatibility).await.unwrap();
            }
            for compatibility in ["apple-silicon", "rocm", "cpu", "invalid"] {
                let error = p.validate_compatibility(compatibility).await.unwrap_err();
                assert!(error.to_string().contains(compatibility));
            }
        }
    }
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
        assert!(check_response(&json!({"code":"0"}), "test", &[]).is_ok());
        assert!(check_response(&json!({"code":"secret"}), "test", &[]).is_err());
    }
    #[tokio::test]
    async fn undocumented_refusal_preserves_operation_without_guessing_or_leaking() {
        let (p, request) = mock(
            "workflow",
            200,
            json!({"code":605,"msg":"test-only-key private prompt https://private.test/input.png"}),
        )
        .await;
        let error = p
            .submit("local", &json!({"_mymovieNodeInfo":[]}))
            .await
            .unwrap_err();
        let message = error.to_string();
        assert!(message.contains("code 605 at /task/openapi/create"));
        assert!(message.contains("not documented"));
        for private in ["test-only-key", "private prompt", "private.test", "balance"] {
            assert!(!message.contains(private));
        }
        assert!(error.downcast_ref::<SubmissionRejected>().is_some());
        request.await.unwrap();
    }
    #[test]
    fn symbolic_reasons_are_retained_only_when_not_private() {
        let response = json!({"code":605,"msg":"WORKFLOW_ACCESS_DENIED"});
        let message = check_response(&response, "/task/openapi/create", &[])
            .unwrap_err()
            .to_string();
        assert!(message.contains("Provider identifier: WORKFLOW_ACCESS_DENIED"));
        for private in ["WORKFLOW_ACCESS_DENIED", "ACCESS_DENIED"] {
            let message = check_response(&response, "test", &[private])
                .unwrap_err()
                .to_string();
            assert!(!message.contains("WORKFLOW_ACCESS_DENIED"));
        }
        let mut private = Vec::new();
        let body = json!({"nested":[{"fieldValue":"WORKFLOW_ACCESS_DENIED"}]});
        collect_private_strings(&body, &mut private);
        assert_eq!(private, vec!["WORKFLOW_ACCESS_DENIED"]);
        assert!(
            !check_response(&response, "test", &private)
                .unwrap_err()
                .to_string()
                .contains("WORKFLOW_ACCESS_DENIED")
        );
    }
    #[test]
    fn documented_reasons_are_translated_without_exposing_free_text() {
        for (code, expected) in [
            (416, "wallet balance"),
            (802, "invalid or disabled"),
            (803, "input node IDs"),
            (810, "manually run"),
        ] {
            let error = check_response(&json!({"code":code,"msg":"private response"}), "test", &[])
                .unwrap_err()
                .to_string();
            assert!(error.contains(expected));
            assert!(!error.contains("private response"));
        }
        assert!(
            check_response(
                &json!({"code":605,"msg":"WORKFLOW_NOT_SAVED_OR_NOT_RUNNING"}),
                "test",
                &[]
            )
            .unwrap_err()
            .to_string()
            .contains("manually run")
        );
        assert!(
            check_response(
                &json!({"code":605,"msg":"APIKEY_UNAUTHORIZED test-only-key"}),
                "test",
                &[]
            )
            .unwrap_err()
            .to_string()
            .contains("not documented")
        );
    }
}
