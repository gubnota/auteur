use crate::Args;
use project_core::{Result, atomic_json, confined};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
pub async fn control(args: &Args, kind: &str, payload: &Value) -> Result<Value> {
    let registry = provider_comfyui::ComfyUi::new(&args.comfy_url)?
        .get("/object_info")
        .await?;
    if kind == "workflow-inspect" {
        return Ok(
            json!({"registry":registry,"compilerVersion":"frontend-export-v1","sessionId":args.session_id}),
        );
    }
    let source = payload.get("source").ok_or("Workflow source required")?;
    if serde_json::to_vec(source)?.len() > 16 * 1024 * 1024 {
        return Err("Workflow exceeds 16 MiB".into());
    }
    let hash = format!("{:x}", Sha256::digest(serde_json::to_vec(source)?));
    let root = args.data.join("workflows");
    std::fs::create_dir_all(&root)?;
    let directory = confined(&root, &hash)?;
    std::fs::create_dir_all(&directory)?;
    let input = confined(&directory, "editor.json")?;
    if input.exists() {
        let old: Value = serde_json::from_slice(&std::fs::read(&input)?)?;
        if old != *source {
            return Err("Immutable workflow registry conflict".into());
        }
    } else {
        atomic_json(&input, source)?;
    }
    if kind == "workflow-install" {
        if payload["publishToComfyui"] == true {
            return provider_comfyui::ComfyUi::new(&args.comfy_url)?
                .install_workflow(
                    payload["name"].as_str().unwrap_or("MyMovie workflow"),
                    source,
                )
                .await;
        }
        return Ok(json!({"sourceHash":hash,"installed":true,"loadedCanvas":false}));
    }
    let output = confined(&directory, &format!("compile-{}.json", project_core::id()))?;
    let helper = args.workflow_compiler.clone().unwrap_or_else(|| {
        std::env::current_exe()
            .unwrap_or_default()
            .with_file_name("mymovie_workflow_compiler.py")
    });
    if !helper.is_file() {
        return Err("Compiler sidecar missing; install the complete agent archive and workflow compiler requirements".into());
    }
    let mut command = tokio::process::Command::new(&args.python);
    command
        .arg(helper)
        .arg("--url")
        .arg(&args.comfy_url)
        .arg("--source")
        .arg(input)
        .arg("--output")
        .arg(&output)
        .kill_on_drop(true);
    if let Some(browser) = &args.compiler_browser {
        command.arg("--browser-executable").arg(browser);
    }
    let status =
        tokio::time::timeout(std::time::Duration::from_secs(120), command.output()).await??;
    let result: Value = if output.is_file() {
        serde_json::from_slice(&std::fs::read(&output)?)?
    } else {
        json!({"error":"Compiler failed to start; install Playwright and Chromium for the selected Python"})
    };
    let _ = std::fs::remove_file(output);
    if !status.status.success() {
        return Err(result["error"]
            .as_str()
            .unwrap_or("Compiler failed")
            .to_string()
            .into());
    }
    workflow_core::validate_graph(&result["graph"])?;
    atomic_json(&confined(&directory, "compiled.json")?, &result)?;
    Ok(result)
}
