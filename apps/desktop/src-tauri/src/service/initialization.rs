use super::*;
#[tauri::command]
pub async fn start_initialization(
    state: S<'_>,
    connection_id: String,
    workflow_id: String,
    review_id: String,
) -> Reply<Value> {
    let (c, w, pid, setup, settings) = {
        let i = state.inner.lock().await;
        let p = store(&i).map_err(err)?.read().map_err(err)?;
        let w = p
            .workflows
            .iter()
            .find(|w| w.id == workflow_id)
            .ok_or("Workflow missing")?
            .clone();
        let setup = workflow_core::for_setup(&w, &connection_id).map_err(err)?;
        (
            connection(&i, &connection_id).map_err(err)?,
            w,
            p.id,
            setup,
            i.settings.read().map_err(err)?,
        )
    };
    let hf_token = model_credentials::for_install(&settings, &setup).map_err(err)?;
    relay(&c).map_err(err)?.initialize(json!({"workflows":[setup],"sourceWorkflow":w,"workspaceId":pid,"connectionId":connection_id,"reviewId":review_id,"guided":true,"apply":true}), hf_token.as_deref()).await.map_err(err)
}
#[tauri::command]
pub async fn list_initializations(
    state: S<'_>,
    connection_id: String,
    passive: Option<bool>,
) -> Reply<Value> {
    let c = connection(&*state.inner.lock().await, &connection_id).map_err(err)?;
    if passive.unwrap_or(false) && credential_for(&c, true).is_err() {
        return Ok(json!([]));
    }
    relay_for(&c, passive.unwrap_or(false))
        .map_err(err)?
        .get(&format!(
            "/v1/nodes/{}/operations",
            c.deployment_id.as_deref().ok_or("Node ID missing")?
        ))
        .await
        .map_err(err)
}
#[tauri::command]
pub async fn cancel_initialization(
    state: S<'_>,
    connection_id: String,
    operation_id: String,
) -> Reply<Value> {
    let c = connection(&*state.inner.lock().await, &connection_id).map_err(err)?;
    let r = relay(&c).map_err(err)?;
    let old = r
        .get(&format!("/v1/jobs/{operation_id}"))
        .await
        .map_err(err)?;
    if old["kind"] != "initialize" || old["nodeId"] != r.node {
        return Err("Initialization identity mismatch".into());
    }
    r.post(&format!("/v1/jobs/{operation_id}/cancel"), json!({}))
        .await
        .map_err(err)
}
#[tauri::command]
pub async fn apply_initialization(
    state: S<'_>,
    connection_id: String,
    operation_id: String,
) -> Reply<Option<Project>> {
    let c = connection(&*state.inner.lock().await, &connection_id).map_err(err)?;
    let r = relay(&c).map_err(err)?;
    let status = r
        .get(&format!("/v1/jobs/{operation_id}"))
        .await
        .map_err(err)?;
    if status["kind"] != "initialize"
        || status["nodeId"] != r.node
        || status["state"] != "completed"
        || status["report"]["ready"] != true
    {
        return Err("Initialization is not complete".into());
    }
    let source: Workflow =
        serde_json::from_value(status["payload"]["sourceWorkflow"].clone()).map_err(err)?;
    let profile: CompiledProfile =
        serde_json::from_value(status["report"]["profile"].clone()).map_err(err)?;
    if profile.connection_id != connection_id
        || profile.source_hash
            != source
                .editor_hash
                .as_ref()
                .unwrap_or(&source.version)
                .as_str()
        || profile.api_hash
            != format!(
                "{:x}",
                Sha256::digest(serde_json::to_vec(&profile.graph).map_err(err)?)
            )
    {
        return Err("Prepared profile identity mismatch".into());
    }
    workflow_core::validate_graph(&profile.graph).map_err(err)?;
    let mut i = state.inner.lock().await;
    if serde_json::to_value(connection(&i, &connection_id).map_err(err)?).map_err(err)?
        != serde_json::to_value(&c).map_err(err)?
    {
        return Err("Connection changed".into());
    }
    let s = &mut i.workspace;
    let mut p = s.read().map_err(err)?;
    if status["payload"]["workspaceId"]
        .as_str()
        .is_some_and(|id| id != p.id)
    {
        return Ok(None);
    }
    let Some(w) = p
        .workflows
        .iter_mut()
        .find(|w| w.id == source.id && w.version == source.version)
    else {
        return Ok(None);
    };
    if w.wrapper.archived_at.is_some()
        || serde_json::to_value(&w.requirements).map_err(err)?
            != serde_json::to_value(&source.requirements).map_err(err)?
        || serde_json::to_value(&w.wrapper).map_err(err)?
            != serde_json::to_value(&source.wrapper).map_err(err)?
    {
        return Err(
            "Workflow setup changed; remote receipt retained without replacing the form".into(),
        );
    }
    if w.profiles
        .iter()
        .any(|p| serde_json::to_value(p).ok() == serde_json::to_value(&profile).ok())
    {
        return Ok(None);
    }
    w.profiles.retain(|p| p.connection_id != connection_id);
    w.profiles.push(profile);
    w.last_target = Some(connection_id);
    let copied = w.clone();
    let rev = p.revision;
    let saved = s.save(p, rev).map_err(err)?;
    i.settings.put_workflow(&copied).map_err(err)?;
    Ok(Some(saved))
}
#[tauri::command]
pub async fn console_request(
    state: S<'_>,
    connection_id: String,
    session_id: Option<String>,
    command: Option<Value>,
) -> Reply<Value> {
    let c = connection(&*state.inner.lock().await, &connection_id).map_err(err)?;
    let r = relay(&c).map_err(err)?;
    if let Some(id) = session_id {
        if id.len() != 36 || !id.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-') {
            return Err("Invalid console identity".into());
        }
        let current = r.get(&format!("/v1/consoles/{id}")).await.map_err(err)?;
        if current["nodeId"] != r.node {
            return Err("Console belongs to a different node".into());
        }
        if let Some(cmd) = command {
            r.post(&format!("/v1/consoles/{id}/input"), cmd)
                .await
                .map_err(err)
        } else {
            Ok(current)
        }
    } else {
        r.post(&format!("/v1/nodes/{}/console", r.node), json!({}))
            .await
            .map_err(err)
    }
}
#[tauri::command]
pub async fn clear_workflow_trash(state: S<'_>) -> Reply<Project> {
    let mut i = state.inner.lock().await;
    i.workspace.clear_workflow_trash().map_err(err)
}
#[tauri::command]
pub async fn archive_workflow(state: S<'_>, workflow_id: String, archived: bool) -> Reply<Project> {
    // Trash preserves the exact workflow and any operation receipts. An offline node
    // must not prevent removing a movie copy; results remain traceable by ID.
    let mut i = state.inner.lock().await;
    let s = &mut i.workspace;
    let mut p = s.read().map_err(err)?;
    let family = p
        .workflows
        .iter()
        .find(|w| w.id == workflow_id)
        .ok_or("Workflow missing")?
        .wrapper
        .family_id
        .clone();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(err)?
        .as_secs()
        .to_string();
    for w in &mut p.workflows {
        if w.id == workflow_id || (!family.is_empty() && w.wrapper.family_id == family) {
            w.wrapper.archived_at = archived.then(|| timestamp.clone());
        }
    }
    let rev = p.revision;
    s.save(p, rev).map_err(err)
}
