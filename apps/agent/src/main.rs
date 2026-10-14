mod provision;
mod workflow;
use clap::Parser;
use job_core::ExecutionBackend;
use project_core::{Result, atomic_json};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
#[derive(Parser)]
#[command(version)]
struct Args {
    #[arg(value_parser=["doctor","inventory","bootstrap","provision","workflow-inspect","workflow-install","workflow-compile","serve"])]
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
    #[arg(long)]
    comfy_root: Option<PathBuf>,
    #[arg(long, default_value = "python3")]
    python: String,
    #[arg(long)]
    workflow_source: Option<PathBuf>,
    #[arg(long)]
    publish_to_comfyui: bool,
    #[arg(long, default_value = "MyMovie workflow")]
    workflow_name: String,
    #[arg(long)]
    workflow_compiler: Option<PathBuf>,
    #[arg(long)]
    compiler_browser: Option<PathBuf>,
    #[arg(long)]
    runtime_helper: Option<PathBuf>,
    #[arg(long)]
    managed_runtime: bool,
    #[arg(long)]
    model_paths: Option<PathBuf>,
    #[arg(long)]
    cache: Option<PathBuf>,
    #[arg(long)]
    profile: Option<PathBuf>,
    #[arg(long)]
    workflows: Option<PathBuf>,
    #[arg(long)]
    apply: bool,
    #[arg(skip)]
    session_id: String,
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
struct LeaseRenewal(tokio::task::JoinHandle<()>);
impl Drop for LeaseRenewal {
    fn drop(&mut self) {
        self.0.abort();
    }
}
fn renew_lease(
    client: reqwest::Client,
    url: String,
    token: String,
    receipt: Value,
) -> LeaseRenewal {
    LeaseRenewal(tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(15));
        loop {
            interval.tick().await;
            let mut renewal = receipt.clone();
            renewal["renewOnly"] = json!(true);
            let _ = post(&client, &url, &token, renewal).await;
        }
    }))
}
async fn execute(
    args: &Args,
    comfy: &provider_comfyui::ComfyUi,
    kind: &str,
    payload: &Value,
) -> Result<Value> {
    if kind.starts_with("workflow-") {
        workflow::control(args, kind, payload).await
    } else {
        provision::control(args, comfy, kind, payload).await
    }
}
#[tokio::main]
async fn main() -> Result<()> {
    let mut args = Args::parse();
    args.session_id = project_core::id();
    std::fs::create_dir_all(&args.data)?;
    let comfy = provider_comfyui::ComfyUi::new(&args.comfy_url)?;
    if args.command != "serve" {
        let payload = if let Some(lock) = &args.runtime_lock {
            json!({"runtimeLock":serde_json::from_slice::<Value>(&std::fs::read(lock)?)?,"workflows":[]})
        } else {
            json!({"workflows":[]})
        };
        let mut payload = payload;
        if let Some(path) = &args.profile {
            payload["profile"] = serde_json::from_slice(&std::fs::read(path)?)?;
        }
        if let Some(path) = &args.workflows {
            payload["workflows"] = serde_json::from_slice(&std::fs::read(path)?)?;
        }
        if let Some(path) = &args.workflow_source {
            payload["source"] = serde_json::from_slice(&std::fs::read(path)?)?;
        }
        payload["apply"] = json!(args.apply);
        payload["publishToComfyui"] = json!(args.publish_to_comfyui);
        payload["name"] = json!(args.workflow_name);
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
        let _lease = renew_lease(
            client.clone(),
            report_url.clone(),
            token.clone(),
            receipt.clone(),
        );
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
                Err(error) => {
                    receipt["state"] = json!("failed");
                    receipt["error"] = if job["kind"]
                        .as_str()
                        .is_some_and(|k| k.starts_with("workflow-"))
                    {
                        json!(error.to_string().chars().take(2000).collect::<String>())
                    } else {
                        json!(
                            "Runner validation failed; review runtime paths, dependency pins and connection status"
                        )
                    };
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
        let payload = &job["payload"];
        let mut graph = payload.get("graph").unwrap_or(payload).clone();
        let prepared:Result<()> = async {
            comfy.validate_profile(&payload["compiledProfile"]).await?;
            let initialized=provision::generation_ready(&args,&graph).await?;
            comfy.validate_media(&graph,&initialized.bindings).await?;
            comfy.validate_before_staging(&graph,&initialized.bindings).await?;
            let mut staged:std::collections::HashMap<String,(String,String)>=std::collections::HashMap::new();
            for (node_id,node) in graph.as_object_mut().ok_or("Invalid graph")? {
                for (input,value) in node["inputs"].as_object_mut().ok_or("Invalid inputs")? {
                    let Some(asset_id)=value.as_str().and_then(|s|s.strip_prefix("relay-asset:")).map(str::to_owned) else {continue};
                    if asset_id.len()!=36 || !asset_id.bytes().all(|b|b.is_ascii_hexdigit() || b==b'-') {return Err("Invalid relay asset identity".into());}
                    let binding=initialized.bindings.iter().find(|b|b.node_id==*node_id && b.input==*input).ok_or("Media marker is not a reviewed input")?;
                    let kind=binding.media.as_ref().map(|m|m.kind.as_str()).unwrap_or("image");
                    if let Some((name,staged_kind))=staged.get(&asset_id) {
                        if staged_kind!=kind {return Err("One media asset cannot satisfy different loader types".into());}
                        *value=json!(name);continue;
                    }
                    let mut response=client.get(format!("{relay}/v1/assets/{asset_id}")).bearer_auth(&token).send().await?.error_for_status()?;
                    let header=|key|response.headers().get(key).and_then(|v|v.to_str().ok()).unwrap_or("").to_owned();
                    let mut asset:studio_contracts::Asset=serde_json::from_value(json!({"id":asset_id,"name":header("x-asset-name"),"kind":header("x-asset-kind"),"sha256":header("x-asset-sha256"),"size":0,"path":""}))?;
                    if asset.kind!=kind {return Err("Media type differs from the reviewed loader binding".into());}
                    const MAX_MEDIA:usize=1024*1024*1024;
                    if response.content_length().is_some_and(|n|n>MAX_MEDIA as u64) {return Err("Relay media exceeds 1 GiB".into());}
                    let mut bytes=vec![];
                    while let Some(chunk)=response.chunk().await? {if bytes.len().saturating_add(chunk.len())>MAX_MEDIA {return Err("Relay media exceeds 1 GiB".into());}bytes.extend_from_slice(&chunk);}
                    asset.size=bytes.len() as u64;
                    if format!("{:x}",Sha256::digest(&bytes))!=asset.sha256 {return Err("Relay media integrity mismatch".into());}
                    let name=comfy.stage_asset(&asset,bytes).await?;staged.insert(asset_id,(name.clone(),kind.to_owned()));*value=json!(name);
                }
            }
            comfy.validate_job(&graph).await?;
            Ok(())
        }.await;
        if let Err(e) = prepared {
            receipt["state"] = json!("failed");
            receipt["error"] = json!(e.to_string());
            atomic_json(&receipt_path, &receipt)?;
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
                                .header(
                                    "x-asset-kind",
                                    if name.ends_with(".mp4") || name.ends_with(".webm") {
                                        "video"
                                    } else if name.ends_with(".wav")
                                        || name.ends_with(".mp3")
                                        || name.ends_with(".flac")
                                    {
                                        "audio"
                                    } else {
                                        "image"
                                    },
                                )
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
