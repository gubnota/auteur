//! One durable relay operation owns installation, restart, compilation and verification.
use crate::{Args, provision, workflow};
use project_core::{Result, atomic_json};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::sync::{Arc, Mutex};
use std::time::Duration;
pub type Progress = Arc<Mutex<Value>>;
tokio::task_local! { pub static PROGRESS: Progress; }
pub fn progress(stage: &str, detail: impl AsRef<str>, bytes: Option<(u64, u64)>) {
    let _ = PROGRESS.try_with(|p| {
        let mut p = p.lock().unwrap();
        let changed = p["stage"] != stage || p["detail"] != detail.as_ref();
        if changed {
            let row = json!({"stage":stage,"detail":detail.as_ref(),"at":timestamp()});
            let log = p["log"].as_array_mut().unwrap();
            log.push(row);
            if log.len() > 128 {
                log.remove(0);
            }
        }
        p["stage"] = json!(stage);
        p["detail"] = json!(detail.as_ref());
        p["updatedAt"] = json!(timestamp());
        if let Some((done, total)) = bytes {
            p["bytes"] = json!(done);
            p["totalBytes"] = json!(total);
        } else {
            p.as_object_mut().unwrap().remove("bytes");
            p.as_object_mut().unwrap().remove("totalBytes");
        }
    });
}
pub fn timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
pub fn fresh() -> Progress {
    Arc::new(Mutex::new(
        json!({"stage":"starting","detail":"Connecting to this runtime","startedAt":timestamp(),"log":[]}),
    ))
}
pub async fn lock(args: &Args) -> Result<std::fs::File> {
    loop {
        match provision::execution_lock(args, true) {
            Ok(g) => return Ok(g),
            Err(e) if e.to_string().contains("busy") => {
                progress(
                    "waiting",
                    "Waiting for this runtime’s active jobs or another GPU worker",
                    None,
                );
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
            Err(e) => return Err(e),
        }
    }
}
pub fn private_execution(args: &Args) -> Result<()> {
    let defaults: Value =
        serde_json::from_str(include_str!("../../../deploy/node-auth.defaults.json"))?;
    let token = std::env::var("MYMOVIE_AGENT_TOKEN").unwrap_or_default();
    if !args.allow_console
        || token.is_empty()
        || Some(token.as_str()) == defaults["MYMOVIE_AGENT_TOKEN"].as_str()
    {
        return Err("Custom scripts and console require --allow-console and a private token pair in the notebook and Studio".into());
    }
    Ok(())
}
pub fn clean_command(args: &Args) -> tokio::process::Command {
    let mut c = tokio::process::Command::new(&args.python);
    c.env_clear();
    for k in [
        "PATH",
        "HOME",
        "LANG",
        "LC_ALL",
        "VIRTUAL_ENV",
        "TMPDIR",
        "CUDA_VISIBLE_DEVICES",
        "LD_LIBRARY_PATH",
        "TERM",
        "COLORTERM",
    ] {
        if let Ok(v) = std::env::var(k) {
            c.env(k, v);
        }
    }
    // Helpers own a stdin watchdog: closing it kills the entire child process group.
    c.kill_on_drop(false);
    c
}
fn recipe_key(
    w: &studio_contracts::Workflow,
    index: usize,
    root: &std::path::Path,
    inventory: &Value,
    session: &str,
) -> Result<String> {
    // Python installs must invalidate readiness, not their own successful recipe receipt.
    let mut runtime = inventory["inventory"]["runtime"].clone();
    runtime
        .as_object_mut()
        .ok_or("Runtime identity missing")?
        .remove("dependencyHash");
    Ok(format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&json!([
            w.version,
            w.wrapper.initialization,
            index,
            runtime,
            root,
            if w.wrapper.initialization[index].policy == "session" {
                json!(session)
            } else {
                Value::Null
            }
        ]))?)
    ))
}
fn same_reviewed_dependencies(old: &Value, fresh: &Value) -> bool {
    ["artifacts", "nodeTypes", "canary"]
        .iter()
        .all(|key| old["profile"][key] == fresh["profile"][key])
}
async fn execute_script(
    args: &Args,
    script: &str,
    cwd: &std::path::Path,
    root: &std::path::Path,
    cache: &std::path::Path,
    timeout: u64,
    stage: &str,
    name: &str,
) -> Result<bool> {
    let mut command = clean_command(args);
    command
        .arg("-u")
        .arg("-c")
        .arg(include_str!("../../../deploy/runner/mymovie_script.py"))
        .arg(script)
        .env("COMFYUI_DIR", root)
        .env("COMFYUI_PYTHON", &args.python)
        .env("MODELS_DIR", root.join("models"))
        .env("CUSTOM_NODES_DIR", root.join("custom_nodes"))
        .env("WORKFLOW_DIR", root.join("user/default/workflows/MyMovie"))
        .env("CACHE_DIR", cache)
        .current_dir(cwd)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());
    let mut child = command.spawn()?;
    let _watchdog = child.stdin.take().ok_or("Script watchdog unavailable")?;
    use tokio::io::AsyncBufReadExt;
    let mut lines =
        tokio::io::BufReader::new(child.stdout.take().ok_or("Script output unavailable")?).lines();
    tokio::time::timeout(Duration::from_secs(timeout), async {
        while let Some(line) = lines.next_line().await? {
            progress(
                stage,
                format!("{name} · {}", line.chars().take(800).collect::<String>()),
                None,
            );
        }
        Ok::<_, Box<dyn std::error::Error + Send + Sync>>(child.wait().await?.success())
    })
    .await
    .map_err(|_| "Initialization step timed out")?
}
async fn recipes(args: &Args, w: &studio_contracts::Workflow) -> Result<bool> {
    if w.wrapper.initialization.is_empty() {
        return Ok(false);
    }
    private_execution(args)?;
    let _guard = lock(args).await?;
    w.wrapper.validate()?;
    let root = args
        .comfy_root
        .as_ref()
        .ok_or("ComfyUI root missing")?
        .canonicalize()?;
    let cache = args.cache.clone().unwrap_or(args.data.join("cache"));
    std::fs::create_dir_all(&cache)?;
    let inventory = provision::control(
        args,
        &provider_comfyui::ComfyUi::new(&args.comfy_url)?,
        "inventory",
        &json!({}),
    )
    .await?;
    let mut changed = false;
    for (index, step) in w.wrapper.initialization.iter().enumerate() {
        // Receipt includes all steps, workflow version and runtime identity, never just a generic marker.
        let key = recipe_key(w, index, &root, &inventory, &args.session_id)?;
        let receipt = cache.join(format!("recipe-{key}.json"));
        let cwd = root.join(&step.directory).canonicalize()?;
        if !cwd.starts_with(&root) {
            return Err("Recipe working folder escapes ComfyUI root".into());
        }
        // Checks run even when an exact receipt exists: deleted files and changed
        // environments cannot be hidden by a marker from a previous session.
        let checked = if let Some(check) = step
            .check_script
            .as_deref()
            .filter(|s| !s.trim().is_empty())
        {
            execute_script(
                args,
                check,
                &cwd,
                &root,
                &cache,
                step.timeout_seconds,
                "check",
                &step.name,
            )
            .await?
        } else {
            std::fs::read(&receipt)
                .ok()
                .and_then(|v| serde_json::from_slice::<Value>(&v).ok())
                .is_some_and(|v| v["verified"] == true && v["key"] == key)
        };
        if !checked {
            progress("install", &step.name, None);
            atomic_json(
                &cache.join("restart-required.json"),
                &json!({"required":true}),
            )?;
            if !execute_script(
                args,
                &step.script,
                &cwd,
                &root,
                &cache,
                step.timeout_seconds,
                "install",
                &step.name,
            )
            .await?
            {
                return Err("Initialization install failed; inspect Activity".into());
            }
            changed = true;
        }
        if let Some(verify) = step
            .verify_script
            .as_deref()
            .filter(|s| !s.trim().is_empty())
        {
            if !execute_script(
                args,
                verify,
                &cwd,
                &root,
                &cache,
                step.timeout_seconds,
                "verify",
                &step.name,
            )
            .await?
            {
                let _ = std::fs::remove_file(&receipt);
                return Err("Initialization verification failed; inspect Activity".into());
            }
        }
        if checked {
            progress("reuse", format!("{} · checks passed", step.name), None);
        }
        atomic_json(
            &receipt,
            &json!({"verified":true,"key":key,"completedAt":timestamp()}),
        )?;
    }
    Ok(changed)
}
pub async fn run(args: &Args, comfy: &provider_comfyui::ComfyUi, payload: &Value) -> Result<Value> {
    let original: studio_contracts::Workflow =
        serde_json::from_value(payload["sourceWorkflow"].clone())?;
    original.wrapper.validate()?;
    if original.wrapper.archived_at.is_some() {
        return Err("Workflow is in Trash".into());
    }
    let connection = payload["connectionId"]
        .as_str()
        .ok_or("Connection identity missing")?;
    let mut request = payload.clone();
    request["apply"] = json!(true);
    request["guided"] = json!(true);
    progress(
        "inventory",
        "Validating reviewed dependencies and runtime identity",
        None,
    );
    let result = {
        let _guard = match provision::execution_lock(args, true) {
            Ok(guard) => guard,
            Err(e) if e.to_string().contains("busy") => {
                // A sibling worker can legitimately change the shared runtime while
                // we wait. Rebind only the *same* reviewed immutable dependency set.
                let old: Value =
                    serde_json::from_slice(&std::fs::read(args.data.join("setup-review.json"))?)?;
                let reviewed: Vec<studio_contracts::Workflow> =
                    serde_json::from_value(request["workflows"].clone())?;
                if old["id"] != request["reviewId"]
                    || old["workflowHash"] != provision_core::digest(&reviewed)?
                {
                    return Err("Setup review changed; review this workflow again".into());
                }
                let guard = lock(args).await?;
                let mut inspect = request.clone();
                inspect["apply"] = json!(false);
                let fresh = provision::control(args, comfy, "provision", &inspect).await?;
                if !same_reviewed_dependencies(&old, &fresh) {
                    return Err("Shared runtime changed dependency resolution; review the new downloads before installing".into());
                }
                request["reviewId"] = fresh["reviewId"].clone();
                guard
            }
            Err(e) => return Err(e),
        };
        provision::control(args, comfy, "provision", &request).await?
    };
    let scripts_changed = recipes(args, &original).await?;
    if result["state"] == "needs-restart"
        || result["restartRequired"] == true
        || scripts_changed
        || provision::restart_pending(args)
    {
        progress(
            "restart",
            "Restarting the managed runtime when its workers are idle",
            None,
        );
        // Restart itself takes the exclusive shared-runtime lock.
        loop {
            match provision::control(args, comfy, "runtime-restart", &json!({})).await {
                Ok(_) => break,
                Err(e) if e.to_string().contains("busy") => {
                    progress(
                        "waiting",
                        "Waiting for all GPU workers to be idle before restart",
                        None,
                    );
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
                Err(e) => return Err(e),
            }
        }
    }
    let _guard = lock(args).await?;
    progress(
        "compile",
        "Preparing the original workflow and discovering its inputs and outputs",
        None,
    );
    let source = original.editor_graph.as_ref().unwrap_or(&original.graph);
    let compiled = workflow::control(
        args,
        if original.editor_graph.is_some() {
            "workflow-compile"
        } else {
            "workflow-inspect"
        },
        &json!({"source":source}),
    )
    .await?;
    let graph = if original.editor_graph.is_some() {
        compiled["graph"].clone()
    } else {
        original.graph.clone()
    };
    let (inputs, outputs) = workflow_core::schema::describe(&graph, &compiled["registry"])?;
    let profile = studio_contracts::CompiledProfile {
        connection_id: connection.into(),
        source_hash: original
            .editor_hash
            .clone()
            .unwrap_or(original.version.clone()),
        api_hash: format!("{:x}", Sha256::digest(serde_json::to_vec(&graph)?)),
        registry_hash: workflow_core::schema::fingerprint(&graph, &compiled["registry"])?,
        frontend_hash: compiled["frontendHash"].as_str().unwrap_or("").into(),
        compiler_version: compiled["compilerVersion"]
            .as_str()
            .unwrap_or("api-schema-v1")
            .into(),
        graph,
        inputs,
        outputs,
    };
    if original.editor_graph.is_some() {
        progress(
            "publish",
            "Saving the original workflow in this instance’s ComfyUI library",
            None,
        );
        workflow::control(
            args,
            "workflow-install",
            &json!({"source":source,"name":original.name,"publishToComfyui":true}),
        )
        .await?;
    }
    let mut prepared = original.clone();
    prepared.profiles.retain(|p| p.connection_id != connection);
    prepared.profiles.push(profile.clone());
    let target = workflow_core::for_setup(&prepared, connection)?;
    let mut verify = json!({"workflows":[target],"guided":true,"apply":false});
    progress(
        "verify",
        "Rechecking installed files, plugins, models and the prepared graph",
        None,
    );
    let review = provision::control(args, comfy, "provision", &verify).await?;
    verify["reviewId"] = review["reviewId"].clone();
    verify["apply"] = json!(true);
    let ready = provision::control(args, comfy, "provision", &verify).await?;
    if ready["ready"] != true {
        return Err(format!("Initialization requires attention: {}", ready).into());
    }
    progress(
        "ready",
        "Ready for this session · workflow can be queued",
        None,
    );
    Ok(
        json!({"ready":true,"state":"ready","workflowId":original.id,"workflowVersion":original.version,"profile":profile,"readiness":ready}),
    )
}

/// Runtime helpers may spawn pip/git. Cancellation must stop the whole group.
pub struct ProcessGroup(pub Option<u32>);
impl Drop for ProcessGroup {
    fn drop(&mut self) {
        #[cfg(unix)]
        if let Some(pid) = self.0 {
            unsafe {
                libc::kill(-(pid as i32), libc::SIGKILL);
            }
        }
    }
}
/// A restarted agent reconciles its own lease receipts; it never replays mutations.
pub async fn reconcile(
    args: &Args,
    client: &reqwest::Client,
    relay: &str,
    token: &str,
    interrupted: bool,
) -> Result<()> {
    let dir = args.data.join("receipts");
    if !dir.is_dir() {
        return Ok(());
    }
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        let Some(id) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        let Ok(mut v) = serde_json::from_slice::<Value>(&std::fs::read(&path)?) else {
            continue;
        };
        if v["kind"] != "initialize" || v["nodeId"] != args.node_id || v["reconciled"] == true {
            continue;
        }
        if v["state"] == "running" && !interrupted {
            continue;
        }
        if v["state"] == "running" {
            v["state"] = json!("failed");
            v["error"] = json!(
                "Agent restarted during initialization. Completed downloads are retained. Review the runtime and initialize again; no script was replayed."
            );
            atomic_json(&path, &v)?;
        }
        if crate::post(
            client,
            &format!("{relay}/v1/agent/jobs/{id}"),
            token,
            v.clone(),
        )
        .await
        .is_ok()
        {
            v["reconciled"] = json!(true);
            atomic_json(&path, &v)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn receipt_survives_its_own_python_install_but_not_recipe_or_runtime_changes() {
        let mut w = workflow_core::examples::catalogue().unwrap().remove(0);
        w.wrapper.initialization = serde_json::from_value(json!([{"name":"Setup","script":"echo setup","directory":"","timeoutSeconds":60,"policy":"recipe"}])).unwrap();
        let root = std::path::Path::new("/runtime/ComfyUI");
        let mut inventory = json!({"inventory":{"runtime":{"comfyCommit":"one","python":"3.11","dependencyHash":"before"}}});
        let key = recipe_key(&w, 0, root, &inventory, "session-1").unwrap();
        inventory["inventory"]["runtime"]["dependencyHash"] = json!("after");
        assert_eq!(
            key,
            recipe_key(&w, 0, root, &inventory, "session-2").unwrap()
        );
        inventory["inventory"]["runtime"]["comfyCommit"] = json!("two");
        assert_ne!(
            key,
            recipe_key(&w, 0, root, &inventory, "session-1").unwrap()
        );
        inventory["inventory"]["runtime"]["comfyCommit"] = json!("one");
        w.wrapper.initialization[0]
            .script
            .push_str("; echo changed");
        assert_ne!(
            key,
            recipe_key(&w, 0, root, &inventory, "session-1").unwrap()
        );
        w.wrapper.initialization[0].policy = "session".into();
        assert_ne!(
            recipe_key(&w, 0, root, &inventory, "session-1").unwrap(),
            recipe_key(&w, 0, root, &inventory, "session-2").unwrap()
        );
    }
    #[test]
    fn shared_worker_rebinding_cannot_add_or_change_a_reviewed_download() {
        let old = json!({"profile":{"runtime":{"fingerprint":"old"},"artifacts":[{"sha256":"a"}],"nodeTypes":["LoadImage"],"canary":{}}});
        let mut fresh = old.clone();
        fresh["profile"]["runtime"]["fingerprint"] = json!("new");
        assert!(same_reviewed_dependencies(&old, &fresh));
        fresh["profile"]["artifacts"][0]["sha256"] = json!("b");
        assert!(!same_reviewed_dependencies(&old, &fresh));
    }
    #[tokio::test]
    async fn progress_is_bounded_and_does_not_keep_an_old_download_counter() {
        let p = fresh();
        PROGRESS
            .scope(p.clone(), async {
                for n in 0..140 {
                    progress("download", format!("part {n}"), Some((n, 140)));
                }
                progress("verify", "Checking installed files", None);
            })
            .await;
        let v = p.lock().unwrap();
        assert_eq!(v["log"].as_array().unwrap().len(), 128);
        assert!(v.get("bytes").is_none());
        assert_eq!(v["stage"], "verify");
    }
}
