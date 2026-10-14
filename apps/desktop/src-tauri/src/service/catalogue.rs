//! Catalogue pins and target preparation. Provider I/O never holds the document lock.
use super::*;
#[tauri::command]
pub async fn install_workflow(
    state: S<'_>,
    workflow_id: String,
    connection_id: String,
) -> Reply<Value> {
    let (w, c) = {
        let i = state.inner.lock().await;
        let p = store(&i).map_err(err)?.read().map_err(err)?;
        (
            p.workflows
                .iter()
                .find(|w| w.id == workflow_id)
                .ok_or("Workflow missing")?
                .clone(),
            connection(&i, &connection_id).map_err(err)?,
        )
    };
    let source = w
        .editor_graph
        .as_ref()
        .ok_or("Import the original editor workflow first")?;
    if c.kind == "comfyui" {
        provider_comfyui::ComfyUi::new(&c.url)
            .map_err(err)?
            .install_workflow(&w.name, source)
            .await
            .map_err(err)
    } else if c.kind == "relay" {
        let r = relay(&c).map_err(err)?;
        let receipt = r
            .command(
                "workflow-install",
                json!({"source":source,"name":w.name,"publishToComfyui":true}),
            )
            .await
            .map_err(err)?;
        let id = receipt["id"]
            .as_str()
            .ok_or("Runner did not return operation ID")?;
        for _ in 0..120 {
            let status = r.get(&format!("/v1/jobs/{id}")).await.map_err(err)?;
            match status["state"].as_str() {
                Some("completed") => return Ok(status["report"].clone()),
                Some("failed" | "lost" | "canceled") => {
                    return Err(format!("Workflow installation: {}", status["error"]));
                }
                _ => tokio::time::sleep(std::time::Duration::from_secs(2)).await,
            }
        }
        Err("Installation timed out; check runner logs before retrying".into())
    } else {
        Err("Select a ComfyUI or runner node".into())
    }
}
fn hash(v: &Value) -> Result<String> {
    Ok(format!("{:x}", Sha256::digest(serde_json::to_vec(v)?)))
}
#[tauri::command]
pub async fn list_workflows(state: S<'_>) -> Reply<Vec<Workflow>> {
    state.inner.lock().await.settings.catalogue().map_err(err)
}
#[tauri::command]
pub async fn pin_workflow(state: S<'_>, workflow_id: String) -> Reply<Project> {
    let mut i = state.inner.lock().await;
    let w = i
        .settings
        .catalogue()
        .map_err(err)?
        .into_iter()
        .find(|w| w.id == workflow_id)
        .ok_or("Catalogue version missing")?;
    let s = i.project.as_mut().ok_or("Open a movie first")?;
    let mut p = s.read().map_err(err)?;
    if !p.workflows.iter().any(|old| old.id == w.id) {
        p.workflows.push(w);
    }
    let revision = p.revision;
    s.save(p, revision).map_err(err)
}
#[tauri::command]
pub async fn catalogue_workflow(state: S<'_>, workflow_id: String) -> Reply<Workflow> {
    let i = state.inner.lock().await;
    let p = store(&i).map_err(err)?.read().map_err(err)?;
    let w = p
        .workflows
        .iter()
        .find(|w| w.id == workflow_id)
        .ok_or("Workflow missing")?;
    i.settings.put_workflow(w).map_err(err)
}
#[tauri::command]
pub async fn save_workflow_layout(
    state: S<'_>,
    workflow_id: String,
    layout: studio_contracts::WorkflowLayout,
) -> Reply<Project> {
    if layout.inputs.len() > 4096
        || layout.outputs.len() > 1024
        || layout
            .inputs
            .iter()
            .any(|l| l.label.len() > 200 || l.group.len() > 100 || l.label.trim().is_empty())
        || layout.inputs.iter().any(|l| {
            l.media_role.as_ref().is_some_and(|r| {
                ![
                    "sourceImage",
                    "startFrame",
                    "endFrame",
                    "referenceImage",
                    "mask",
                    "referenceVideo",
                    "referenceAudio",
                    "sourceVideo",
                    "sourceAudio",
                ]
                .contains(&r.as_str())
            })
        })
        || layout
            .outputs
            .iter()
            .any(|l| l.label.len() > 200 || l.label.trim().is_empty())
    {
        return Err(
            "Use nonempty labels up to 200 characters and groups up to 100 characters".into(),
        );
    }
    let mut i = state.inner.lock().await;
    let s = i.project.as_mut().ok_or("Movie closed")?;
    let mut p = s.read().map_err(err)?;
    let w = p
        .workflows
        .iter_mut()
        .find(|w| w.id == workflow_id)
        .ok_or("Workflow missing")?;
    w.layout = layout;
    let catalogued = w.clone();
    let revision = p.revision;
    let saved = s.save(p, revision).map_err(err)?;
    i.settings.put_workflow(&catalogued).map_err(err)?;
    Ok(saved)
}
#[tauri::command]
pub async fn prepare_workflow(
    state: S<'_>,
    workflow_id: String,
    connection_id: String,
) -> Reply<Project> {
    prepare_target(state.inner(), workflow_id, connection_id).await
}
pub(super) async fn prepare_target(
    state: &Studio,
    workflow_id: String,
    connection_id: String,
) -> Reply<Project> {
    let (w, c, epoch, python, browser) = {
        let i = state.inner.lock().await;
        let p = store(&i).map_err(err)?.read().map_err(err)?;
        let w = p
            .workflows
            .iter()
            .find(|w| w.id == workflow_id)
            .ok_or("Workflow missing")?
            .clone();
        let settings = i.settings.read().map_err(err)?;
        (
            w,
            connection(&i, &connection_id).map_err(err)?,
            i.session,
            settings.storage["compilerPython"]
                .as_str()
                .unwrap_or("python3")
                .to_string(),
            settings.storage["compilerBrowser"]
                .as_str()
                .map(str::to_string),
        )
    };
    let receipt: Value = if c.kind == "relay" {
        let r = relay(&c).map_err(err)?;
        let action = if w.editor_graph.is_some() {
            "workflow-compile"
        } else {
            "workflow-inspect"
        };
        let queued = r
            .command(
                action,
                json!({"source":w.editor_graph.as_ref().unwrap_or(&w.graph)}),
            )
            .await
            .map_err(err)?;
        let id = queued["id"]
            .as_str()
            .ok_or("Runner did not return operation ID")?;
        let mut finished = None;
        for _ in 0..120 {
            let status = r.get(&format!("/v1/jobs/{id}")).await.map_err(err)?;
            match status["state"].as_str() {
                Some("completed") => {
                    finished = Some(status["report"].clone());
                    break;
                }
                Some("failed" | "lost" | "canceled") => {
                    return Err(format!("Runner preparation: {}", status["error"]));
                }
                _ => tokio::time::sleep(std::time::Duration::from_secs(2)).await,
            }
        }
        finished.ok_or("Preparation timed out; check runner logs before trying again")?
    } else if c.kind == "comfyui" {
        if let Some(source) = &w.editor_graph {
            let temp = tempfile::tempdir().map_err(err)?;
            let helper = temp.path().join("compiler.py");
            std::fs::write(
                &helper,
                include_str!("../../../../../deploy/runner/mymovie_workflow_compiler.py"),
            )
            .map_err(err)?;
            let input = temp.path().join("editor.json");
            let output = temp.path().join("compiled.json");
            project_core::atomic_json(&input, source).map_err(err)?;
            let mut command = tokio::process::Command::new(&python);
            command
                .arg(helper)
                .arg("--url")
                .arg(&c.url)
                .arg("--source")
                .arg(input)
                .arg("--output")
                .arg(&output)
                .kill_on_drop(true);
            if let Some(browser) = browser {
                command.arg("--browser-executable").arg(browser);
            }
            let status =
                tokio::time::timeout(std::time::Duration::from_secs(120), command.output())
                    .await
                    .map_err(err)?
                    .map_err(err)?;
            if !output.is_file() {
                return Err("Compiler could not start. Set compiler Python in Settings and install Playwright/Chromium (see Workflow Setup guide).".into());
            }
            let result: Value =
                serde_json::from_slice(&std::fs::read(output).map_err(err)?).map_err(err)?;
            if !status.status.success() {
                return Err(result["error"]
                    .as_str()
                    .unwrap_or("Compilation failed")
                    .into());
            }
            result
        } else {
            json!({"registry":provider_comfyui::ComfyUi::new(&c.url).map_err(err)?.get("/object_info").await.map_err(err)?,"compilerVersion":"api-schema-v1","frontendHash":""})
        }
    } else {
        return Err("Select a ComfyUI or runner target to discover editor workflow inputs.".into());
    };
    let graph = if w.editor_graph.is_some() {
        receipt["graph"].clone()
    } else {
        w.graph.clone()
    };
    let registry = &receipt["registry"];
    let (inputs, outputs) = workflow_core::schema::describe(&graph, registry).map_err(err)?;
    let profile = CompiledProfile {
        connection_id: connection_id.clone(),
        source_hash: w.editor_hash.clone().unwrap_or(w.version.clone()),
        api_hash: hash(&graph).map_err(err)?,
        registry_hash: workflow_core::schema::fingerprint(&graph, registry).map_err(err)?,
        frontend_hash: receipt["frontendHash"].as_str().unwrap_or("").into(),
        compiler_version: receipt["compilerVersion"].as_str().unwrap_or("").into(),
        graph,
        inputs,
        outputs,
    };
    let mut i = state.inner.lock().await;
    if i.session != epoch
        || serde_json::to_value(connection(&i, &connection_id).map_err(err)?).map_err(err)?
            != serde_json::to_value(&c).map_err(err)?
    {
        return Err(
            "Movie or connection changed during preparation; result was not applied".into(),
        );
    }
    let s = i.project.as_mut().ok_or("Movie closed")?;
    let mut p = s.read().map_err(err)?;
    let current = p
        .workflows
        .iter_mut()
        .find(|x| x.id == w.id && x.version == w.version)
        .ok_or("Workflow changed")?;
    current
        .profiles
        .retain(|x| x.connection_id != connection_id);
    current.profiles.push(profile);
    current.last_target = Some(connection_id);
    let catalogued = current.clone();
    let revision = p.revision;
    let saved = s.save(p, revision).map_err(err)?;
    i.settings.put_workflow(&catalogued).map_err(err)?;
    Ok(saved)
}
#[tauri::command]
pub async fn export_workflow(
    state: S<'_>,
    workflow_id: String,
    connection_id: String,
    editor: bool,
    path: String,
) -> Reply<()> {
    let i = state.inner.lock().await;
    let p = store(&i).map_err(err)?.read().map_err(err)?;
    let w = p
        .workflows
        .iter()
        .find(|w| w.id == workflow_id)
        .ok_or("Workflow missing")?;
    let graph = if editor {
        w.editor_graph
            .clone()
            .ok_or("This version has no editor source")?
    } else {
        workflow_core::for_target(w, &connection_id)
            .map_err(err)?
            .graph
    };
    project_core::atomic_json(Path::new(&path), &graph).map_err(err)
}

#[tauri::command]
pub async fn save_workflow_form(
    state: S<'_>,
    workflow_id: String,
    bindings: Vec<studio_contracts::Binding>,
    connection_id: String,
    layout: studio_contracts::WorkflowLayout,
) -> Reply<Project> {
    let mut i = state.inner.lock().await;
    let s = i.project.as_mut().ok_or("Movie closed")?;
    let mut p = s.read().map_err(err)?;
    let w = p
        .workflows
        .iter_mut()
        .find(|w| w.id == workflow_id)
        .ok_or("Workflow missing")?;
    let graph = w
        .profiles
        .iter()
        .find(|x| x.connection_id == connection_id)
        .map(|x| &x.graph)
        .unwrap_or(&w.graph);
    workflow_core::schema::validate_form(graph, &bindings, &layout).map_err(err)?;
    w.bindings = bindings;
    w.layout = layout;
    let catalogued = w.clone();
    let revision = p.revision;
    let saved = s.save(p, revision).map_err(err)?;
    i.settings.put_workflow(&catalogued).map_err(err)?;
    Ok(saved)
}

#[tauri::command]
pub async fn export_workflow_bundle(
    state: S<'_>,
    workflow_id: String,
    collection: bool,
    path: String,
) -> Reply<()> {
    let i = state.inner.lock().await;
    let p = store(&i).map_err(err)?.read().map_err(err)?;
    let selected = p
        .workflows
        .iter()
        .find(|w| w.id == workflow_id)
        .ok_or("Workflow missing")?;
    let family = if selected.wrapper.family_id.is_empty() {
        &selected.id
    } else {
        &selected.wrapper.family_id
    };
    let workflows: Vec<_> = p
        .workflows
        .iter()
        .filter(|w| {
            if collection && !selected.wrapper.collection.is_empty() {
                w.wrapper.collection == selected.wrapper.collection
            } else {
                let other = if w.wrapper.family_id.is_empty() {
                    &w.id
                } else {
                    &w.wrapper.family_id
                };
                other == family
            }
        })
        .cloned()
        .collect();
    let bundle = workflow_core::bundle::export(&workflows).map_err(err)?;
    project_core::atomic_json(Path::new(&path), &bundle).map_err(err)
}
