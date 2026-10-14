use crate::Args;
use job_core::ExecutionBackend;
use project_core::{Result, atomic_json};
use provision_core::ProvisionProfile;
use serde_json::{Value, json};
use std::{path::Path, time::Duration};
use tokio::io::AsyncWriteExt;

async fn helper(args: &Args, payload: Value) -> Result<Value> {
    let root = args
        .comfy_root
        .as_ref()
        .ok_or("Configure --comfy-root for node initialization")?;
    let helper = args
        .runtime_helper
        .clone()
        .or_else(|| {
            std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.join("mymovie_runtime.py")))
        })
        .ok_or("Runtime helper missing")?;
    let mut cmd = tokio::process::Command::new(&args.python);
    cmd.arg(helper).arg("--root").arg(root);
    if args.managed_runtime {
        cmd.arg("--managed");
    }
    if let Some(config) = &args.model_paths {
        cmd.arg("--model-paths").arg(config);
    }
    cmd.arg("--cache")
        .arg(args.data.join("inventory-cache.json"));
    cmd.stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true);
    let mut child = cmd.spawn()?;
    let mut input = child.stdin.take().ok_or("Helper input unavailable")?;
    input.write_all(&serde_json::to_vec(&payload)?).await?;
    drop(input);
    let out = tokio::time::timeout(Duration::from_secs(1800), child.wait_with_output()).await??;
    if out.stdout.len() > 8 * 1024 * 1024 {
        return Err("Runtime inventory exceeds limit".into());
    }
    let result: Value = serde_json::from_slice(&out.stdout)?;
    if !out.status.success() {
        return Err(result["error"]
            .as_str()
            .unwrap_or("Runtime inventory failed")
            .to_owned()
            .into());
    }
    Ok(result)
}
async fn registry(args: &Args) -> Result<Value> {
    Ok(reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?
        .get(format!(
            "{}/object_info",
            args.comfy_url.trim_end_matches('/')
        ))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?)
}
fn read(path: &Path) -> Option<Value> {
    std::fs::read(path)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
}
fn workflow_set(payload: &Value) -> Result<Vec<studio_contracts::Workflow>> {
    let workflows: Vec<studio_contracts::Workflow> =
        serde_json::from_value(payload.get("workflows").cloned().unwrap_or(json!([])))?;
    for w in &workflows {
        if w.id.len() != 36
            || !w.id.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-')
            || w.version.len() != 64
            || !w.version.bytes().all(|b| b.is_ascii_hexdigit())
        {
            return Err("Invalid immutable workflow identity".into());
        }
        let pending = w.editor_graph.is_some() && w.graph.as_object().is_some_and(|g| g.is_empty());
        let content = if pending {
            workflow_core::for_setup(w, "")?;
            w.editor_graph.as_ref().unwrap()
        } else {
            workflow_core::validate_graph(&w.graph)?;
            &w.graph
        };
        if provision_core::digest(content)? != w.version {
            return Err("Workflow content differs from immutable version".into());
        }
    }
    Ok(workflows)
}
pub async fn control(
    args: &Args,
    comfy: &provider_comfyui::ComfyUi,
    kind: &str,
    payload: &Value,
) -> Result<Value> {
    let health = comfy.health().await?;
    let saved = read(&args.data.join("profile.json"));
    let mut profile: Option<ProvisionProfile> = payload
        .get("profile")
        .filter(|v| !v.is_null())
        .cloned()
        .or(saved)
        .map(serde_json::from_value)
        .transpose()?;
    if kind == "doctor" || kind == "bootstrap" {
        return Ok(
            json!({"comfy":health,"ready":false,"state":"online","sessionId":args.session_id,"note":"Inspect Inventory, then review and initialize a pinned profile. Connection health does not prove readiness."}),
        );
    }
    let workflows = if kind == "inventory" {
        workflow_set(&read(&args.data.join("workflows.json")).unwrap_or(json!({})))?
    } else {
        workflow_set(payload)?
    };
    if let Some(p) = &mut profile {
        for w in &workflows {
            for a in &w.requirements.artifacts {
                if let Some(existing) = p
                    .artifacts
                    .iter()
                    .find(|e| e.kind == a.kind && e.category == a.category && e.target == a.target)
                {
                    if provision_core::digest(existing)? != provision_core::digest(a)? {
                        return Err(format!("Conflicting dependency pin: {}", a.target).into());
                    }
                } else {
                    p.artifacts.push(a.clone());
                }
            }
        }
        p.validate()?;
    }
    let reg = registry(args).await?;
    let mut inventory = helper(
        args,
        json!({"artifacts":profile.as_ref().map(|p|&p.artifacts)}),
    )
    .await?;
    inventory["devices"] = health["stats"]["devices"].clone();
    if kind == "inventory" {
        let readiness = if let Some(p) = &profile {
            provision_core::readiness(
                p,
                &inventory,
                &reg,
                &workflows,
                &args.session_id,
                read(&args.data.join("attestation.json")).as_ref(),
            )?
        } else {
            json!({"state":"unchecked","ready":false})
        };
        return Ok(
            json!({"comfy":health,"inventory":inventory,"readiness":readiness,"sessionId":args.session_id}),
        );
    }
    let Some(profile) = profile else {
        let legacy = payload
            .get("runtimeLock")
            .filter(|v| !v.is_null())
            .map(|v| serde_json::from_value::<provision_core::RuntimeLock>(v.clone()))
            .transpose()?;
        return Ok(
            json!({"ready":false,"state":"unchecked","inventory":inventory,"plan":provision_core::plan(&workflows,&reg,legacy.as_ref()),"note":"Save a provisioning profile with this native fingerprint or an immutable Docker digest, verified artifacts and a small canary."}),
        );
    };
    profile.validate()?;
    let status = provision_core::readiness(
        &profile,
        &inventory,
        &reg,
        &workflows,
        &args.session_id,
        read(&args.data.join("attestation.json")).as_ref(),
    )?;
    if payload["apply"] != true {
        return Ok(
            json!({"ready":false,"state":"review","inventory":inventory,"plan":status,"managedRuntime":args.managed_runtime}),
        );
    }
    if status["runtimeMatches"] != true {
        return Err("Runtime identity changed; inspect Inventory and review a new profile".into());
    }
    if status["ready"] == true {
        return Ok(status);
    }
    // The shared cache lock serializes installation across independent GPU workers.
    let cache = args.cache.clone().unwrap_or(args.data.join("cache"));
    tokio::fs::create_dir_all(&cache).await?;
    let lock = std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(cache.join("install.lock"))?;
    fs2::FileExt::try_lock_exclusive(&lock).map_err(
        |_| "Another worker is initializing shared dependencies; retry after its report completes",
    )?;
    let sources = if let Ok(url) = std::env::var("MYMOVIE_TRANSFER_MANIFEST") {
        storage_s3::manifest(&url)
            .await
            .map_err(|_| "Secret transfer manifest unavailable or expired")?
    } else {
        vec![]
    };
    let mut restart = false;
    for (a, row) in profile.artifacts.iter().zip(
        inventory["files"]
            .as_array()
            .ok_or("Missing integrity inventory")?,
    ) {
        if row["state"] == "verified" {
            continue;
        }
        if row["state"] != "missing" {
            return Err(format!("Dependency {} conflicts or has an unknown category; resolve it before initialization",a.target).into());
        }
        if !args.managed_runtime {
            return Err(
                "External ComfyUI is read-only; install requirements in its own environment".into(),
            );
        }
        let dest = cache.join(&a.sha256);
        let url = if !a.source_ref.is_empty() {
            sources
                .iter()
                .find(|o| o.name == a.source_ref && o.sha256 == a.sha256 && o.size == a.size)
                .ok_or("Required secret transfer object is unavailable or mismatches profile")?
                .url
                .clone()
        } else {
            a.source.clone()
        };
        // download() re-verifies resumed bytes; helper re-verifies an existing cache entry.
        if !dest.exists() {
            storage_s3::download(&storage_s3::Object{name:a.target.clone(),sha256:a.sha256.clone(),size:a.size,url,architecture:Some(a.architecture.clone()),license:Some(a.license.clone())},&dest).await.map_err(|_|"Dependency transfer failed or integrity mismatch; inspect the source and retry")?;
        }
        helper(args, json!({"action":"install","artifact":a,"source":dest})).await?;
        restart |= a.kind == "plugin" || a.kind == "wheel";
    }
    let wheels: Vec<_> = profile
        .artifacts
        .iter()
        .filter(|a| a.kind == "wheel")
        .collect();
    if restart && !wheels.is_empty() {
        helper(args, json!({"action":"wheels","artifacts":wheels})).await?;
    }
    for w in &workflows {
        atomic_json(
            &args
                .data
                .join(format!("workflows/{}/{}.json", w.id, w.version)),
            w,
        )?;
    }
    atomic_json(&args.data.join("profile.json"), &profile)?;
    atomic_json(
        &args.data.join("workflows.json"),
        &json!({"workflows":workflows}),
    )?;
    if restart {
        return Ok(
            json!({"ready":false,"state":"needs-restart","note":"Dependencies installed and verified. Stop this managed notebook runner, start it again, inspect the new runtime fingerprint and review initialization. Existing queues are never interrupted automatically."}),
        );
    }
    if workflows
        .iter()
        .any(|w| w.graph.as_object().is_some_and(|g| g.is_empty()))
    {
        return Ok(
            json!({"ready":false,"state":"needs-preparation","note":"Reviewed dependencies installed. Prepare each original workflow on this node, then review initialization again. No generation or readiness attestation was performed."}),
        );
    }
    let mut inv = helper(args, json!({"artifacts":profile.artifacts})).await?;
    inv["devices"] = comfy.health().await?["stats"]["devices"].clone();
    let reg = registry(args).await?;
    let mut result =
        provision_core::readiness(&profile, &inv, &reg, &workflows, &args.session_id, None)?;
    if result["state"] != "unchecked" {
        return Ok(result);
    }
    for w in &workflows {
        let media: Vec<_> = w
            .bindings
            .iter()
            .filter(|b| {
                b.media.is_some()
                    || b.semantic == "image"
                    || b.semantic == "mask"
                    || b.semantic.starts_with("characterReference")
            })
            .cloned()
            .collect();
        comfy.validate_media(&w.graph, &media).await?;
    }
    comfy.validate_job(&profile.canary).await?;
    let canary_path = args.data.join("canary-receipt.json");
    let previous = read(&canary_path);
    if previous
        .as_ref()
        .is_some_and(|r| r["state"] == "unknown" && r["remoteId"].is_null())
    {
        return Err("Canary submission is ambiguous. Inspect ComfyUI history for its client ID before clearing the local receipt".into());
    }
    let remote = if let Some(id) = previous
        .as_ref()
        .filter(|r| {
            r["state"] == "unknown"
                && r["profileHash"] == result["profileHash"]
                && r["sessionId"] == args.session_id
        })
        .and_then(|r| r["remoteId"].as_str())
    {
        id.to_owned()
    } else {
        if previous.as_ref().is_some_and(|r| r["state"] == "unknown") {
            return Err(
                "Previous session canary requires reconciliation before starting another".into(),
            );
        }
        let attempt = format!("canary-{}", project_core::id());
        atomic_json(
            &canary_path,
            &json!({"state":"unknown","attemptId":attempt,"profileHash":result["profileHash"],"sessionId":args.session_id}),
        )?;
        let remote = comfy.submit(&attempt, &profile.canary).await?;
        atomic_json(
            &canary_path,
            &json!({"state":"unknown","attemptId":attempt,"remoteId":remote,"profileHash":result["profileHash"],"sessionId":args.session_id}),
        )?;
        remote
    };
    let acceptance=tokio::time::timeout(Duration::from_secs(120),async {
        loop {let s=comfy.status(&remote).await?;
            if s.state=="collecting" {if s.outputs.is_empty(){return Err("Canary produced no output".into());} let mut results=vec![];for o in s.outputs {let (name,bytes)=comfy.collect(&o).await?;if bytes.is_empty(){return Err("Canary output is empty".into());} use sha2::{Digest,Sha256};results.push(json!({"name":name,"size":bytes.len(),"sha256":format!("{:x}",Sha256::digest(&bytes))}));} return Ok::<_,Box<dyn std::error::Error+Send+Sync>>(results);}
            if matches!(s.state.as_str(),"failed"|"unknown"|"canceled") {return Err("Canary failed; inspect ComfyUI diagnostics".into());}
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    }).await;
    match acceptance {
        Ok(Ok(outputs)) => {
            result["state"] = json!("ready");
            result["ready"] = json!(true);
            result["canary"] = json!({"remoteId":remote,"outputs":outputs});
            atomic_json(&args.data.join("attestation.json"), &result)?;
            atomic_json(
                &canary_path,
                &json!({"state":"completed","remoteId":remote}),
            )?;
            Ok(result)
        }
        _ => Ok(
            json!({"state":"canary-failed","ready":false,"remoteId":remote,"note":"Reconcile this canary before retrying initialization."}),
        ),
    }
}
pub async fn generation_ready(args: &Args, graph: &Value) -> Result<studio_contracts::Workflow> {
    let inventory = control(
        args,
        &provider_comfyui::ComfyUi::new(&args.comfy_url)?,
        "inventory",
        &json!({}),
    )
    .await?;
    if inventory["readiness"]["ready"] != true {
        return Err("Node is unchecked or its runtime changed. Review and initialize this session in Connections before generation".into());
    }
    let saved = workflow_set(&read(&args.data.join("workflows.json")).unwrap_or(json!({})))?;
    let initialized=saved.iter().find(|w| {
        let Some(nodes)=w.graph.as_object() else{return false};
        let Some(actual)=graph.as_object() else{return false};
        nodes.len()==actual.len() && nodes.iter().all(|(id,n)| {
            let Some(candidate)=actual.get(id) else{return false};
            if n["class_type"]!=candidate["class_type"] {return false;}
            let Some(inputs)=n["inputs"].as_object() else{return false};
            let Some(values)=candidate["inputs"].as_object() else{return false};
            inputs.len()==values.len() && inputs.iter().all(|(input,v)|w.bindings.iter().any(|b|b.node_id==*id&&b.input==*input) || values.get(input)==Some(v))
        })
    }).ok_or("This exact workflow version has not been initialized; only reviewed bound inputs may change")?;
    let profile: ProvisionProfile = serde_json::from_value(
        read(&args.data.join("profile.json")).ok_or("Missing initialized profile")?,
    )?;
    for node in graph.as_object().ok_or("Invalid graph")?.values() {
        for value in node["inputs"].as_object().ok_or("Invalid inputs")?.values() {
            if let Some(name) = value.as_str() {
                if [
                    ".safetensors",
                    ".ckpt",
                    ".pt",
                    ".pth",
                    ".onnx",
                    ".bin",
                    ".gguf",
                ]
                .iter()
                .any(|ext| name.to_lowercase().ends_with(ext))
                    && !profile
                        .artifacts
                        .iter()
                        .any(|a| a.kind == "model" && a.target == name)
                {
                    return Err("A job selected weights outside the reviewed profile".into());
                }
            }
        }
    }
    comfy_compatibility(args, &initialized.requirements.compatibility).await?;
    Ok(initialized.clone())
}
async fn comfy_compatibility(args: &Args, kind: &str) -> Result<()> {
    provider_comfyui::ComfyUi::new(&args.comfy_url)?
        .validate_compatibility(kind)
        .await
}

#[cfg(test)]
mod setup_tests {
    use super::*;
    #[test]
    fn dependency_setup_accepts_immutable_editor_but_not_changed_source() {
        let w = workflow_core::import_source(
            "editor",
            json!({"nodes":[{"id":1,"type":"MissingPlugin"}],"links":[]}),
        )
        .unwrap();
        let mut payload = json!({"workflows":[w]});
        let workflows = workflow_set(&payload).unwrap();
        assert!(workflow_core::for_target(&workflows[0], "local").is_err());
        payload["workflows"][0]["editorGraph"]["nodes"][0]["type"] = json!("ChangedPlugin");
        assert!(workflow_set(&payload).is_err());
    }
}
