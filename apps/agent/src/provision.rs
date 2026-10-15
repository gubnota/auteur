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
    #[cfg(unix)]
    cmd.process_group(0);
    let mut child = cmd.spawn()?;
    let _process_group = crate::initialization::ProcessGroup(child.id());
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
pub(crate) fn restart_pending(args: &Args) -> bool {
    args.cache
        .clone()
        .unwrap_or(args.data.join("cache"))
        .join("restart-required.json")
        .exists()
}
fn validate_review(
    review: &Value,
    payload: &Value,
    session: &str,
    workflows: &[studio_contracts::Workflow],
    inventory: &Value,
) -> Result<()> {
    if review["id"] != payload["reviewId"]
        || review["sessionId"] != session
        || review["workflowHash"] != provision_core::digest(&workflows)?
        || review["profile"]["runtime"]["fingerprint"] != inventory["runtimeFingerprint"]
    {
        return Err("Setup review is stale; check this node and review again".into());
    }
    Ok(())
}
pub async fn control(
    args: &Args,
    comfy: &provider_comfyui::ComfyUi,
    kind: &str,
    payload: &Value,
) -> Result<Value> {
    if kind == "runtime-restart" {
        return restart(args).await;
    }
    let session_id = format!(
        "{}:{}",
        args.session_id,
        read(&args.data.join("runtime-epoch.json")).unwrap_or(json!(0))
    );
    let health = comfy.health().await?;
    let saved = if payload["guided"] == true {
        None
    } else {
        read(&args.data.join("profile.json"))
    };
    let mut profile: Option<ProvisionProfile> = payload
        .get("profile")
        .filter(|v| !v.is_null())
        .cloned()
        .or(saved)
        .map(serde_json::from_value)
        .transpose()?;
    if payload["guided"] == true {
        profile = None;
    }
    if kind == "doctor" || kind == "bootstrap" {
        return Ok(
            json!({"comfy":health,"ready":false,"state":"online","sessionId":session_id,"note":"Inspect Inventory, then review and initialize a pinned profile. Connection health does not prove readiness."}),
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
        let mut readiness = if let Some(p) = &profile {
            provision_core::readiness(
                p,
                &inventory,
                &reg,
                &workflows,
                &session_id,
                read(&args.data.join("attestation.json")).as_ref(),
            )?
        } else {
            json!({"state":"unchecked","ready":false})
        };
        if restart_pending(args) {
            readiness["ready"] = json!(false);
            readiness["state"] = json!("needs-restart");
        }
        return Ok(
            json!({"comfy":health,"inventory":inventory,"readiness":readiness,"sessionId":session_id}),
        );
    }
    if payload["guided"] == true {
        if payload["apply"] == true {
            let review = read(&args.data.join("setup-review.json"))
                .ok_or("Check node and review setup first")?;
            validate_review(&review, payload, &session_id, &workflows, &inventory)?;
            profile = Some(serde_json::from_value(review["profile"].clone())?);
            inventory = helper(
                args,
                json!({"artifacts":profile.as_ref().unwrap().artifacts}),
            )
            .await?;
            inventory["devices"] = health["stats"]["devices"].clone();
        } else {
            let mut artifacts = vec![];
            let mut packages = vec![];
            let mut node_types = std::collections::BTreeSet::new();
            for w in &workflows {
                w.wrapper.validate()?;
                packages.extend(w.wrapper.python_packages.clone());
                for a in &w.requirements.artifacts {
                    if let Some(existing) =
                        artifacts
                            .iter()
                            .find(|e: &&studio_contracts::InstallArtifact| {
                                e.kind == a.kind && e.category == a.category && e.target == a.target
                            })
                    {
                        if provision_core::digest(existing)? != provision_core::digest(a)? {
                            return Err("Conflicting dependency pins".into());
                        }
                    } else {
                        artifacts.push(a.clone());
                    }
                }
                if let Some(nodes) = w.editor_graph.as_ref().and_then(|e| e["nodes"].as_array()) {
                    for node in nodes {
                        if let Some(t) = node["type"].as_str() {
                            if !["Note", "MarkdownNote", "Reroute"].contains(&t)
                                && node["mode"] != 2
                                && node["mode"] != 4
                            {
                                node_types.insert(t.to_owned());
                            }
                        }
                    }
                }
            }
            packages.sort();
            packages.dedup();
            let wheels: Vec<studio_contracts::InstallArtifact> = serde_json::from_value(
                helper(args, json!({"action":"resolve-wheels","packages":packages})).await?,
            )?;
            artifacts.extend(wheels);
            let p = ProvisionProfile {
                schema_version: 1,
                runtime: provision_core::RuntimeIdentity {
                    kind: "native".into(),
                    image: String::new(),
                    fingerprint: inventory["runtimeFingerprint"]
                        .as_str()
                        .ok_or("Missing runtime fingerprint")?
                        .into(),
                },
                artifacts,
                node_types: node_types.into_iter().collect(),
                canary: serde_json::from_str(include_str!(
                    "../../../examples/workflows/cpu-canary_api.json"
                ))?,
            };
            p.validate()?;
            inventory = helper(args, json!({"artifacts":p.artifacts})).await?;
            inventory["devices"] = health["stats"]["devices"].clone();
            let plan = provision_core::readiness(
                &p,
                &inventory,
                &reg,
                &workflows,
                &session_id,
                read(&args.data.join("attestation.json")).as_ref(),
            )?;
            let review = json!({"id":project_core::id(),"sessionId":session_id,"workflowHash":provision_core::digest(&workflows)?,"profile":p});
            atomic_json(&args.data.join("setup-review.json"), &review)?;
            return Ok(
                json!({"state":"review","ready":false,"reviewId":review["id"],"profile":review["profile"],"inventory":inventory,"plan":plan,"managedRuntime":args.managed_runtime,"restartSupported":args.supervisor.is_some(),"restartRequired":restart_pending(args)}),
            );
        }
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
        &session_id,
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
    if status["incompatible"]
        .as_array()
        .is_some_and(|v| !v.is_empty())
    {
        return Err("Selected workflows are incompatible with this node; select a compatible hardware variant before installation".into());
    }
    if status["ready"] == true && !restart_pending(args) {
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
    loop {
        match fs2::FileExt::try_lock_exclusive(&lock) {
            Ok(()) => break,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => (),
            Err(e) => return Err(e.into()),
        }
        crate::initialization::progress(
            "waiting",
            "Waiting for another GPU worker’s shared dependency cache",
            None,
        );
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    // Another worker may have installed these files while we waited.
    inventory = helper(args, json!({"artifacts":profile.artifacts})).await?;
    let sources = if let Ok(url) = std::env::var("MYMOVIE_TRANSFER_MANIFEST") {
        storage_s3::manifest(&url)
            .await
            .map_err(|_| "Secret transfer manifest unavailable or expired")?
    } else {
        vec![]
    };
    let restart_marker = cache.join("restart-required.json");
    let mut restart = restart_marker.exists();
    for (a, row) in profile.artifacts.iter().zip(
        inventory["files"]
            .as_array()
            .ok_or("Missing integrity inventory")?,
    ) {
        if row["state"] == "verified" {
            crate::initialization::progress(
                "reuse",
                format!("{} · SHA256 verified; reused", a.target),
                None,
            );
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
        if a.source_ref == "builtin-mymovie-rembg-v1" {
            let bundled = workflow_core::examples::rembg_artifact()?;
            if provision_core::digest(a)? != provision_core::digest(&bundled)? {
                return Err("Bundled plugin metadata mismatch; update the agent".into());
            }
            tokio::fs::write(&dest, workflow_core::examples::REMBG_ARCHIVE).await?;
        }
        let url = if a.source_ref == "builtin-mymovie-rembg-v1" {
            String::new()
        } else if !a.source_ref.is_empty() {
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
            storage_s3::download_authenticated(
                &storage_s3::Object {
                    name: a.target.clone(),
                    sha256: a.sha256.clone(),
                    size: a.size,
                    url,
                    architecture: Some(a.architecture.clone()),
                    license: Some(a.license.clone()),
                },
                &dest,
                huggingface_token().as_deref(),
                |done, total| {
                    crate::initialization::progress(
                        "download",
                        format!("{} → {}/{}", a.target, a.category, a.target),
                        Some((done, total)),
                    )
                },
            )
            .await
            .map_err(|e| {
                if e.to_string().starts_with("Model access denied:") {
                    e.to_string()
                } else {
                    "Dependency transfer failed or integrity mismatch; inspect the source and retry"
                        .into()
                }
            })?;
        }
        // Persist before mutation, including partially failed installs.
        if a.kind == "plugin" || a.kind == "wheel" {
            atomic_json(&restart_marker, &json!({"required":true}))?;
            restart = true;
        }
        crate::initialization::progress(
            "install",
            format!("Installing and verifying {}/{}", a.category, a.target),
            None,
        );
        helper(args, json!({"action":"install","artifact":a,"source":dest})).await?;
    }
    let wheels: Vec<_> = profile
        .artifacts
        .iter()
        .filter(|a| a.kind == "wheel")
        .collect();
    if !wheels.is_empty() {
        crate::initialization::progress(
            "packages",
            "Installing the reviewed Python wheels offline",
            None,
        );
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
            json!({"ready":false,"state":"needs-restart","note":"Dependencies installed and verified. Use Restart managed ComfyUI, then check and review the new runtime before preparing inputs. Existing queues are never interrupted automatically."}),
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
        provision_core::readiness(&profile, &inv, &reg, &workflows, &session_id, None)?;
    if result["state"] != "unchecked" {
        return Ok(result);
    }
    // Job-specific media is validated at submission, after upload. Setup runs only its weight-free canary.
    crate::initialization::progress(
        "canary",
        "Checking the weight-free runtime canary and collecting its output",
        None,
    );
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
                && r["sessionId"] == session_id
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
            &json!({"state":"unknown","attemptId":attempt,"profileHash":result["profileHash"],"sessionId":session_id}),
        )?;
        let remote = comfy.submit(&attempt, &profile.canary).await?;
        atomic_json(
            &canary_path,
            &json!({"state":"unknown","attemptId":attempt,"remoteId":remote,"profileHash":result["profileHash"],"sessionId":session_id}),
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
    fn guided_review_binds_session_workflows_runtime_and_review_id() {
        let workflows = workflow_core::examples::catalogue().unwrap();
        let review = json!({"id":"review-1","sessionId":"session-1","workflowHash":provision_core::digest(&workflows).unwrap(),"profile":{"runtime":{"fingerprint":"runtime-1"}}});
        let payload = json!({"reviewId":"review-1"});
        let inventory = json!({"runtimeFingerprint":"runtime-1"});
        assert!(validate_review(&review, &payload, "session-1", &workflows, &inventory).is_ok());
        assert!(validate_review(&review, &payload, "session-2", &workflows, &inventory).is_err());
        assert!(
            validate_review(&review, &payload, "session-1", &workflows[..1], &inventory).is_err()
        );
        assert!(
            validate_review(
                &review,
                &payload,
                "session-1",
                &workflows,
                &json!({"runtimeFingerprint":"runtime-2"})
            )
            .is_err()
        );
        assert!(
            validate_review(
                &review,
                &json!({"reviewId":"review-2"}),
                "session-1",
                &workflows,
                &inventory
            )
            .is_err()
        );
    }
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

/// All notebook workers share this lock: installs/restarts cannot race generation.
pub fn execution_lock(args: &Args, exclusive: bool) -> Result<std::fs::File> {
    let cache = args.cache.clone().unwrap_or(args.data.join("cache"));
    std::fs::create_dir_all(&cache)?;
    let file = std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(cache.join("execution.lock"))?;
    if exclusive { fs2::FileExt::try_lock_exclusive(&file) } else { fs2::FileExt::try_lock_shared(&file) }
        .map_err(|_| "Node is busy with generation or initialization; finish its jobs before installing/restarting")?;
    Ok(file)
}
async fn restart(args: &Args) -> Result<Value> {
    if !args.managed_runtime {
        return Err("External ComfyUI is read-only".into());
    }
    let dir = args.supervisor.as_ref().ok_or(
        "This agent has no notebook supervisor; update the agent and rerun the base notebook",
    )?;
    let _guard = execution_lock(args, true)?;
    let id = project_core::id();
    let request = dir.join(format!("{id}.request.json"));
    let response = dir.join(format!("{id}.response.json"));
    atomic_json(&request, &json!({"id":id,"action":"restart-comfyui"}))?;
    for _ in 0..180 {
        if let Some(reply) = read(&response) {
            let _ = std::fs::remove_file(&response);
            if reply["ok"] == true {
                return Ok(
                    json!({"state":"restarted","ready":false,"note":"ComfyUI restarted; check and review the new runtime, then prepare inputs and initialize again."}),
                );
            }
            return Err(reply["error"]
                .as_str()
                .unwrap_or("Managed restart failed; inspect notebook logs")
                .to_owned()
                .into());
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    let _ = std::fs::remove_file(&request);
    Err("Notebook supervisor did not acknowledge restart; check the running notebook cell".into())
}

/// Credentials stay on this node and are used only for the HF origin by storage-s3.
fn huggingface_token() -> Option<String> {
    let valid = |v: &str| !v.is_empty() && v.len() < 1024 && !v.chars().any(char::is_whitespace);
    if let Ok(v) = std::env::var("HF_TOKEN")
        && valid(&v)
    {
        return Some(v);
    }
    let path = std::env::var_os("HF_TOKEN_PATH")
        .map(std::path::PathBuf::from)
        .or_else(|| std::env::var_os("HF_HOME").map(|p| std::path::PathBuf::from(p).join("token")))
        .or_else(|| {
            std::env::var_os("HOME")
                .map(|p| std::path::PathBuf::from(p).join(".cache/huggingface/token"))
        })?;
    if std::fs::metadata(&path).ok()?.len() > 1024 {
        return None;
    }
    let v = std::fs::read_to_string(path).ok()?.trim().to_string();
    valid(&v).then_some(v)
}
