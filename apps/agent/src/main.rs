use clap::Parser;
use job_core::ExecutionBackend;
use project_core::{Result, atomic_json};
use serde_json::{Value, json};
use std::path::PathBuf;
#[derive(Parser)]
#[command(version)]
struct Args {
    #[arg(value_parser=["doctor","inventory","bootstrap","provision","serve"])]
    command: String,
    #[arg(long, default_value = "http://127.0.0.1:8188")]
    comfy_url: String,
    #[arg(long)]
    relay: Option<String>,
    #[arg(long, default_value = "local-cpu")]
    node_id: String,
    #[arg(long, default_value = "agent-data")]
    data: PathBuf,
    #[arg(long)]
    runtime_lock: Option<PathBuf>,
}
async fn post(c: &reqwest::Client, url: &str, token: &str, v: Value) -> Result<Value> {
    Ok(c.post(url)
        .bearer_auth(token)
        .json(&v)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?)
}
async fn execute(
    args: &Args,
    comfy: &provider_comfyui::ComfyUi,
    kind: &str,
    payload: &Value,
) -> Result<Value> {
    let health = comfy.health().await?;
    match kind {
        "doctor" | "bootstrap" => Ok(
            json!({"comfy":health,"ready":true,"note":"Bootstrap verifies the installed private runtime; it never runs arbitrary shell"}),
        ),
        "inventory" => Ok(health),
        "provision" => {
            let registry: Value = reqwest::get(format!("{}/object_info", args.comfy_url))
                .await?
                .error_for_status()?
                .json()
                .await?;
            let workflows: Vec<studio_contracts::Workflow> =
                serde_json::from_value(payload["workflows"].clone())?;
            let runtime = payload
                .get("runtimeLock")
                .filter(|v| !v.is_null())
                .map(|v| serde_json::from_value::<provision_core::RuntimeLock>(v.clone()))
                .transpose()?;
            let plan = provision_core::plan(&workflows, &registry, runtime.as_ref());
            // Approved sources are downloaded only through a separately verified transfer manifest.
            if let Some(lock) = runtime {
                lock.validate()?;
                atomic_json(&args.data.join("runtime.lock.json"), &lock)?;
            }
            for w in &workflows {
                atomic_json(
                    &args
                        .data
                        .join(format!("workflows/{}/{}.json", w.id, w.version)),
                    w,
                )?;
            }
            Ok(plan)
        }
        _ => Err("Unsupported control action".into()),
    }
}
#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    std::fs::create_dir_all(&args.data)?;
    let comfy = provider_comfyui::ComfyUi::new(&args.comfy_url)?;
    if args.command != "serve" {
        let payload = if let Some(lock) = &args.runtime_lock {
            json!({"runtimeLock":serde_json::from_slice::<Value>(&std::fs::read(lock)?)?,"workflows":[]})
        } else {
            json!({"workflows":[]})
        };
        println!(
            "{}",
            serde_json::to_string_pretty(&execute(&args, &comfy, &args.command, &payload).await?)?
        );
        return Ok(());
    }
    let relay = args
        .relay
        .as_deref()
        .ok_or("--relay required")?
        .trim_end_matches('/');
    storage_s3::validate_url(relay)?;
    let token = std::env::var("MYMOVIE_AGENT_TOKEN")?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()?;
    let mut last_heartbeat = std::time::Instant::now() - std::time::Duration::from_secs(15);
    loop {
        if last_heartbeat.elapsed().as_secs() >= 15 {
            let health = comfy.health().await.ok();
            let _ = post(&client, &format!("{relay}/v1/agent/heartbeat"), &token,
                json!({"nodeId":args.node_id,"connected":health.is_some(),"transport":"outbound HTTPS","comfy":health})).await;
            last_heartbeat = std::time::Instant::now();
        }
        let job = match post(
            &client,
            &format!("{relay}/v1/agent/claim"),
            &token,
            json!({"nodeId":args.node_id}),
        )
        .await
        {
            Ok(j) => j,
            Err(_) => {
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                continue;
            }
        };
        if job.is_null() {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            continue;
        }
        let id = job["id"].as_str().ok_or("Missing job ID")?;
        let report_url = format!("{relay}/v1/agent/jobs/{id}");
        let mut receipt =
            json!({"nodeId":args.node_id,"leaseToken":job["leaseToken"],"state":"running"});
        let receipt_path = args.data.join(format!("receipts/{id}.json"));
        if job["kind"] == "drain" {
            receipt["state"] = json!("completed");
            receipt["report"] = json!({"drained":true});
            post(&client, &report_url, &token, receipt).await?;
            return Ok(());
        }
        if job["kind"] != "generation" {
            match execute(
                &args,
                &comfy,
                job["kind"].as_str().unwrap_or(""),
                &job["payload"],
            )
            .await
            {
                Ok(r) => {
                    receipt["state"] = json!("completed");
                    receipt["report"] = r;
                }
                Err(_) => {
                    receipt["state"] = json!("failed");
                    receipt["error"] = json!("Runner validation failed; inspect local logs");
                }
            }
            atomic_json(&receipt_path, &receipt)?;
            let _ = post(&client, &report_url, &token, receipt).await;
            continue;
        }
        // A receipt written before ComfyUI POST prevents blind resubmit after any crash.
        if receipt_path.exists() {
            receipt["state"] = json!("unknown");
            receipt["error"] = json!("Existing local receipt requires reconciliation");
            post(&client, &report_url, &token, receipt).await?;
            continue;
        }
        let mut graph = job["payload"].clone();
        // Image assets use relay-private identifiers. Materialize them into ComfyUI before validation.
        if let Some(nodes) = graph.as_object_mut() {
            for n in nodes.values_mut() {
                if let Some(inputs) = n["inputs"].as_object_mut() {
                    if let Some(image) = inputs.get_mut("image") {
                        if let Some(asset_id) = image.as_str().filter(|s| s.len() == 36) {
                            let bytes = client
                                .get(format!("{relay}/v1/assets/{asset_id}"))
                                .bearer_auth(&token)
                                .send()
                                .await?
                                .error_for_status()?
                                .bytes()
                                .await?;
                            *image =
                                json!(comfy.stage_asset("reference.png", bytes.to_vec()).await?);
                        }
                    }
                }
            }
        }
        if comfy.validate_job(&graph).await.is_err() {
            receipt["state"] = json!("failed");
            receipt["error"] = json!("Installed node/model registry rejected workflow");
            post(&client, &report_url, &token, receipt).await?;
            continue;
        }
        receipt["state"] = json!("unknown");
        atomic_json(&receipt_path, &receipt)?;
        let remote = match comfy.submit(id, &graph).await {
            Ok(remote) => remote,
            Err(_) => {
                receipt["error"] = json!("ComfyUI submission outcome unknown");
                post(&client, &report_url, &token, receipt).await?;
                continue;
            }
        };
        receipt["remoteId"] = json!(remote);
        receipt["state"] = json!("running");
        atomic_json(&receipt_path, &receipt)?;
        loop {
            let ack = post(&client, &report_url, &token, receipt.clone()).await;
            let canceled = ack.as_ref().is_ok_and(|j| j["state"] == "cancel_requested");
            if canceled && comfy.cancel(&remote).await.is_ok() {
                receipt["state"] = json!("canceled");
                atomic_json(&receipt_path, &receipt)?;
                post(&client, &report_url, &token, receipt.clone()).await?;
                break;
            }
            let status = match comfy.status(&remote).await {
                Ok(s) => s,
                Err(_) => {
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                    continue;
                }
            };
            if status.state == "collecting" {
                let mut outputs = vec![];
                let mut failed = false;
                for o in status.outputs {
                    match comfy.collect(&o).await {
                        Ok((name, bytes)) => {
                            let response = client
                                .post(format!("{relay}/v1/assets"))
                                .bearer_auth(&token)
                                .header("x-asset-name", name)
                                .body(bytes)
                                .send()
                                .await;
                            match response {
                                Ok(r) if r.status().is_success() => {
                                    outputs.push(r.json::<Value>().await?)
                                }
                                _ => {
                                    failed = true;
                                    break;
                                }
                            }
                        }
                        Err(_) => {
                            failed = true;
                            break;
                        }
                    }
                }
                if failed {
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                    continue;
                }
                receipt["outputs"] = json!(outputs);
                receipt["state"] = json!("collecting");
                atomic_json(&receipt_path, &receipt)?;
                post(&client, &report_url, &token, receipt.clone()).await?;
                break;
            } else if matches!(status.state.as_str(), "failed" | "canceled" | "unknown") {
                receipt["state"] = json!(status.state);
                receipt["error"] = json!(status.error);
                atomic_json(&receipt_path, &receipt)?;
                post(&client, &report_url, &token, receipt.clone()).await?;
                break;
            }
            tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        }
    }
}
