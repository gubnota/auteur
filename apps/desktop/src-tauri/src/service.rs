use integration_core::SettingsStore;
use job_core::ExecutionBackend;
use project_core::{ProjectStore, Result};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    path::Path,
    sync::{Arc, Mutex},
};
use studio_contracts::*;
use tauri::{Emitter, State};
pub struct Studio {
    pub inner: tokio::sync::Mutex<Inner>,
    pub opened: Arc<Mutex<Vec<String>>>,
}
pub struct Inner {
    pub project: Option<ProjectStore>,
    pub settings: SettingsStore,
}
impl Studio {
    pub fn new(dir: &Path, opened: Arc<Mutex<Vec<String>>>) -> Result<Self> {
        Ok(Self {
            inner: tokio::sync::Mutex::new(Inner {
                project: None,
                settings: SettingsStore::open(&dir.join("app.sqlite"))?,
            }),
            opened,
        })
    }
}
type S<'a> = State<'a, Arc<Studio>>;
type Reply<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn store(i: &Inner) -> Result<&ProjectStore> {
    i.project
        .as_ref()
        .ok_or_else(|| "Open a movie first".into())
}
fn credential(c: &Connection) -> Result<String> {
    let reference = c
        .credential_ref
        .as_ref()
        .ok_or("Enter credential in connection settings")?;
    let expected = format!("connection:{}", c.id);
    if reference != &expected {
        return Err("Credential identity mismatch".into());
    }
    Ok(keyring::Entry::new("net.fenki.mymovie-studio", reference)?.get_password()?)
}
fn backend(c: &Connection) -> Result<Box<dyn ExecutionBackend>> {
    Ok(match c.kind.as_str() {
        "comfyui" => Box::new(provider_comfyui::ComfyUi::new(&c.url)?),
        "runninghub" => Box::new(provider_runninghub::RunningHub::new(
            credential(c)?,
            c.deployment_id.as_deref().ok_or("Deployment ID required")?,
            c.api_family.as_deref().ok_or("API family required")?,
        )?),
        "relay" => Box::new(relay(c)?),
        _ => return Err("Unknown backend".into()),
    })
}
fn relay(c: &Connection) -> Result<provider_relay::Relay> {
    provider_relay::Relay::new(
        &c.url,
        credential(c)?,
        c.deployment_id
            .as_deref()
            .ok_or("Runner node ID required")?,
    )
}
fn connection(i: &Inner, id: &str) -> Result<Connection> {
    i.settings
        .read()?
        .connections
        .into_iter()
        .find(|c| c.id == id)
        .ok_or_else(|| "Connection no longer configured".into())
}
fn select(_app: &tauri::AppHandle, i: &mut Inner, new: ProjectStore) -> Result<Project> {
    let p = new.read()?;
    job_core::recover(&new)?;
    i.settings.recent(&new.path().to_string_lossy(), &p.name)?;
    i.project = Some(new);
    Ok(p)
}
#[tauri::command]
pub async fn create_project(
    app: tauri::AppHandle,
    state: S<'_>,
    path: String,
    name: String,
    demo: bool,
) -> Reply<Project> {
    let mut i = state.inner.lock().await;
    let new = ProjectStore::create(path, &name, demo).map_err(err)?;
    select(&app, &mut i, new).map_err(err)
}
#[tauri::command]
pub async fn open_project(app: tauri::AppHandle, state: S<'_>, path: String) -> Reply<Project> {
    let mut i = state.inner.lock().await;
    if let Some(s) = &i.project {
        if std::fs::canonicalize(&path).ok().as_ref() == Some(&s.path().to_path_buf()) {
            return s.read().map_err(err);
        }
    }
    let new = ProjectStore::open(path).map_err(err)?;
    select(&app, &mut i, new).map_err(err)
}
#[tauri::command]
pub async fn close_project(state: S<'_>) -> Reply<()> {
    state.inner.lock().await.project.take();
    Ok(())
}
#[tauri::command]
pub async fn get_project(state: S<'_>) -> Reply<Project> {
    store(&*state.inner.lock().await)
        .and_then(ProjectStore::read)
        .map_err(err)
}
#[tauri::command]
pub async fn save_project(
    state: S<'_>,
    project: Project,
    expected_revision: u64,
) -> Reply<Project> {
    let mut i = state.inner.lock().await;
    let s = i.project.as_mut().ok_or("No movie open")?;
    let old = s.read().map_err(err)?;
    if project.assets.len() != old.assets.len()
        || project.workflows.len() != old.workflows.len()
        || project.assets.iter().any(|a| {
            old.assets
                .iter()
                .find(|x| x.id == a.id)
                .is_none_or(|x| x.source_path != a.source_path)
        })
    {
        return Err("Use import commands to add originals or workflows".into());
    }
    s.save(project, expected_revision).map_err(err)
}
#[tauri::command]
pub async fn import_asset(state: S<'_>, path: String, linked: Option<bool>) -> Reply<Project> {
    let mut i = state.inner.lock().await;
    let s = i.project.as_mut().ok_or("No movie open")?;
    let p = s.read().map_err(err)?;
    let next = asset_core::import_target(
        s.path(),
        p,
        &[path],
        asset_core::DropTarget {
            linked: linked.unwrap_or(false),
            ..Default::default()
        },
    )
    .map_err(err)?;
    let revision = next.revision;
    s.save(next, revision).map_err(err)
}
#[tauri::command]
pub async fn import_character_references(
    state: S<'_>,
    character_id: String,
    paths: Vec<String>,
    linked: Option<bool>,
) -> Reply<Project> {
    let mut i = state.inner.lock().await;
    let s = i.project.as_mut().ok_or("No movie open")?;
    let p = s.read().map_err(err)?;
    let next = asset_core::import_target(
        s.path(),
        p,
        &paths,
        asset_core::DropTarget {
            character: Some(&character_id),
            linked: linked.unwrap_or(false),
            ..Default::default()
        },
    )
    .map_err(err)?;
    let revision = next.revision;
    s.save(next, revision).map_err(err)
}
#[tauri::command]
pub async fn import_workflow(state: S<'_>, path: String) -> Reply<Project> {
    let mut i = state.inner.lock().await;
    let s = i.project.as_mut().ok_or("No movie open")?;
    let file = Path::new(&path);
    if std::fs::metadata(file).map_err(err)?.len() > 16 * 1024 * 1024 {
        return Err("Workflow exceeds 16 MiB limit".into());
    }
    let graph = serde_json::from_slice(&std::fs::read(file).map_err(err)?).map_err(err)?;
    let w = workflow_core::import(
        file.file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .as_ref(),
        graph,
    )
    .map_err(err)?;
    let mut p = s.read().map_err(err)?;
    p.workflows.push(w);
    let r = p.revision;
    s.save(p, r).map_err(err)
}
#[tauri::command]
pub async fn get_settings(state: S<'_>) -> Reply<AppSettings> {
    state.inner.lock().await.settings.read().map_err(err)
}
#[tauri::command]
pub async fn save_settings(state: S<'_>, mut settings: AppSettings) -> Reply<AppSettings> {
    let i = state.inner.lock().await;
    let previous = i.settings.read().map_err(err)?;
    settings.notifications = previous.notifications;
    settings.logs = previous.logs;
    i.settings.save(&settings).map_err(err)?;
    Ok(settings)
}
#[tauri::command]
pub async fn clear_diagnostics(state: S<'_>, kind: String) -> Reply<AppSettings> {
    let i = state.inner.lock().await;
    let mut s = i.settings.read().map_err(err)?;
    match kind.as_str() {
        "logs" => s.logs.clear(),
        "notifications" => s.notifications.clear(),
        _ => return Err("Unknown diagnostic kind".into()),
    }
    i.settings.save(&s).map_err(err)?;
    Ok(s)
}
#[tauri::command]
pub fn save_credential(connection_id: String, secret: String) -> Reply<String> {
    if connection_id != "storage-transfer" {
        uuid::Uuid::parse_str(&connection_id).map_err(err)?;
    }
    if secret.trim().is_empty() {
        return Err("Credential is empty".into());
    }
    let reference = format!("connection:{connection_id}");
    keyring::Entry::new("net.fenki.mymovie-studio", &reference)
        .map_err(err)?
        .set_password(&secret)
        .map_err(err)?;
    Ok(reference)
}
#[tauri::command]
pub fn take_opened_projects(state: S<'_>) -> Vec<String> {
    std::mem::take(&mut *state.opened.lock().unwrap())
}
#[tauri::command]
pub async fn recent_projects(state: S<'_>) -> Reply<Value> {
    state.inner.lock().await.settings.list_recent().map_err(err)
}
#[tauri::command]
pub async fn project_history(state: S<'_>) -> Reply<Value> {
    let i = state.inner.lock().await;
    let s = store(&i).map_err(err)?;
    let mut st = s
        .connection()
        .prepare("SELECT revision,json FROM history ORDER BY revision DESC LIMIT 50")
        .map_err(err)?;
    let rows=st.query_map([],|r|Ok(json!({"revision":r.get::<_,i64>(0)?,"project":serde_json::from_str::<Value>(&r.get::<_,String>(1)?).unwrap_or(Value::Null)}))).map_err(err)?;
    Ok(rows
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(err)?
        .into())
}
#[tauri::command]
pub async fn list_jobs(state: S<'_>) -> Reply<Vec<Job>> {
    let i = state.inner.lock().await;
    match &i.project {
        Some(s) => job_core::list(s).map_err(err),
        None => Ok(vec![]),
    }
}
#[tauri::command]
pub async fn connection_health(state: S<'_>, connection_id: String) -> Reply<Value> {
    let c = connection(&*state.inner.lock().await, &connection_id).map_err(err)?;
    backend(&c)
        .map_err(err)?
        .health()
        .await
        .map_err(|_| "Connection check failed. Check server and credential settings.".into())
}
#[tauri::command]
pub async fn submit_job(
    state: S<'_>,
    frame_id: String,
    workflow_id: String,
    connection_id: String,
    values: Value,
) -> Reply<Vec<Job>> {
    let mut i = state.inner.lock().await;
    let result = submit(&mut i, &frame_id, &workflow_id, &connection_id, values).await;
    result.map_err(err)
}
async fn submit(
    i: &mut Inner,
    frame_id: &str,
    workflow_id: &str,
    connection_id: &str,
    values: Value,
) -> Result<Vec<Job>> {
    let c = connection(i, connection_id)?;
    let b = backend(&c)?;
    let p = store(i)?.read()?;
    let (scene, frame) = p
        .episodes
        .iter()
        .flat_map(|e| &e.scenes)
        .flat_map(|s| {
            s.shots
                .iter()
                .flat_map(move |sh| sh.frames.iter().map(move |f| (s, f)))
        })
        .find(|(_, f)| f.id == frame_id)
        .ok_or("Frame missing")?;
    let w = p
        .workflows
        .iter()
        .find(|w| w.id == workflow_id)
        .ok_or("Workflow missing")?;
    let seed = u64::from_le_bytes(uuid::Uuid::new_v4().as_bytes()[..8].try_into()?) % (1u64 << 53);
    let mut semantic = json!({"positivePrompt":workflow_core::composed(&p.positive_prompt,scene.positive_prompt.as_deref(),&frame.positive_prompt,frame.include_common),"negativePrompt":workflow_core::composed(&p.negative_prompt,scene.negative_prompt.as_deref(),&frame.negative_prompt,frame.include_common),"seed":seed});
    for binding in &w.bindings {
        if binding.semantic.starts_with("characterReference")
            || matches!(
                binding.semantic.as_str(),
                "positivePrompt" | "negativePrompt" | "image"
            )
        {
            continue;
        }
        if let Some(value) = values.get(&binding.semantic) {
            semantic[&binding.semantic] = value.clone();
        } else if semantic.get(&binding.semantic).is_none() {
            semantic[&binding.semantic] =
                w.graph[&binding.node_id]["inputs"][&binding.input].clone();
        }
    }
    if c.kind == "runninghub" && w.bindings.is_empty() {
        return Err("Configure verified provider bindings first".into());
    }
    if job_core::list(store(i)?)?
        .iter()
        .filter(|j| j.connection_id == c.id && !job_core::terminal(&j.state))
        .count()
        >= c.concurrency.max(1) as usize
    {
        return Err("Connection admission limit reached".into());
    }
    let reference_inputs =
        workflow_core::character_reference_inputs(&p, scene, frame, &w.bindings, &values)?;
    // Check all selected references before performing the first provider upload.
    let reference_paths = reference_inputs
        .iter()
        .map(|(_, a)| asset_core::source(store(i)?.path(), a, true))
        .collect::<Result<Vec<_>>>()?;
    for ((key, a), path) in reference_inputs.iter().zip(reference_paths) {
        semantic[key] = json!(b.stage_asset(&a.name, std::fs::read(path)?).await?);
    }
    if w.bindings.iter().any(|b| b.semantic == "image") {
        let a = p
            .assets
            .iter()
            .find(|a| frame.asset_id.as_ref() == Some(&a.id))
            .ok_or("Select a frame image before generation")?;
        let bytes = std::fs::read(asset_core::source(store(i)?.path(), a, true)?)?;
        let name = b.stage_asset(&a.name, bytes).await?;
        semantic["image"] = json!(name);
    }
    let mut graph = workflow_core::bind(&w.graph, &w.bindings, &semantic)?;
    b.validate_job(&graph).await?;
    let mut j = job_core::prepare(store(i)?, frame, w, &c, graph.clone(), semantic)?;
    j.snapshot["characters"] = serde_json::to_value(
        p.characters
            .iter()
            .filter(|ch| {
                frame.character_ids.contains(&ch.id) || scene.character_ids.contains(&ch.id)
            })
            .collect::<Vec<_>>(),
    )?;
    j.snapshot["characterReferences"] =
        serde_json::to_value(workflow_core::character_references(&p, scene, frame))?;
    j.snapshot["sceneId"] = json!(scene.id);
    j.snapshot["connection"] = json!({"id":c.id,"kind":c.kind,"url":c.url,"deploymentId":c.deployment_id,"apiFamily":c.api_family});
    if c.kind == "runninghub" {
        graph["_mymovieNodeInfo"] = json!(w.bindings.iter().map(|b|json!({"nodeId":b.node_id,"fieldName":b.input,"fieldValue":graph[&b.node_id]["inputs"][&b.input]})).collect::<Vec<_>>());
    }
    j.snapshot["providerPayload"] = graph.clone();
    project_core::atomic_json(
        &project_core::confined(store(i)?.path(), &format!("jobs/submissions/{}.json", j.id))?,
        &j,
    )?;
    // Persist ambiguity BEFORE POST. Failed requests are never automatically resubmitted.
    job_core::transition(&mut j, "unknown")?;
    job_core::persist(store(i)?, &j)?;
    match b.submit(&j.id, &graph).await {
        Ok(remote) => {
            j.remote_id = Some(remote);
            job_core::transition(&mut j, "submitted")?;
        }
        Err(_) => {
            j.error = Some(
                "Submission outcome unknown. Reconcile with this account before retrying.".into(),
            );
        }
    }
    job_core::persist(store(i)?, &j)?;
    i.settings
        .diagnostic("info", "Generation attempt recorded")?;
    job_core::list(store(i)?)
}
#[tauri::command]
pub async fn refresh_jobs(app: tauri::AppHandle, state: S<'_>) -> Reply<Vec<Job>> {
    refresh(&state, &app).await.map_err(err)
}
pub async fn refresh(state: &Arc<Studio>, app: &tauri::AppHandle) -> Result<Vec<Job>> {
    let mut i = state.inner.lock().await;
    if i.project.is_none() {
        return Ok(vec![]);
    }
    let existing = job_core::list(store(&i)?)?;
    for mut j in existing {
        if job_core::terminal(&j.state) || j.remote_id.is_none() {
            continue;
        }
        let c = match connection(&i, &j.connection_id) {
            Ok(c) => c,
            Err(_) => continue,
        };
        if j.snapshot["connection"]
            != json!({"id":c.id,"kind":c.kind,"url":c.url,"deploymentId":c.deployment_id,"apiFamily":c.api_family})
        {
            continue;
        }
        let b = match backend(&c) {
            Ok(b) => b,
            Err(_) => continue,
        };
        let status = match b.status(j.remote_id.as_deref().unwrap()).await {
            Ok(s) => s,
            Err(_) => continue,
        };
        let before = j.state.clone();
        if status.state == "collecting" {
            if status.outputs.is_empty() {
                j.error = Some("Execution completed without collectable output".into());
                job_core::transition(&mut j, "failed")?;
            } else {
                job_core::transition(&mut j, "collecting")?;
                job_core::persist(store(&i)?, &j)?;
                let mut collected = vec![];
                let mut error = None;
                for o in status.outputs {
                    match b.collect(&o).await {
                        Ok((name, bytes)) => {
                            let actual = format!("{:x}", Sha256::digest(&bytes));
                            if o.get("sha256")
                                .and_then(Value::as_str)
                                .is_some_and(|h| h != actual)
                                || o.get("size")
                                    .and_then(Value::as_u64)
                                    .is_some_and(|n| n != bytes.len() as u64)
                            {
                                error = Some("Output integrity mismatch".to_string());
                                break;
                            }
                            let ext = Path::new(&name)
                                .extension()
                                .and_then(|e| e.to_str())
                                .unwrap_or("png");
                            let dir = tempfile::tempdir()?;
                            let tmp = dir.path().join(format!("result.{ext}"));
                            std::fs::write(&tmp, &bytes)?;
                            let asset = asset_core::import(store(&i)?.path(), &tmp)?;
                            collected.push(asset);
                        }
                        Err(_) => {
                            error =
                                Some("Result collection failed; refresh to retry download".into());
                            break;
                        }
                    }
                }
                if let Some(error) = error {
                    j.error = Some(error);
                } else {
                    let s = i.project.as_mut().unwrap();
                    let mut p = s.read()?;
                    for a in collected {
                        let a = if let Some(old) = p.assets.iter().find(|old| old.path == a.path) {
                            old.clone()
                        } else {
                            p.assets.push(a.clone());
                            a
                        };
                        j.results.push(a);
                    }
                    let revision = p.revision;
                    s.save(p, revision)?;
                    j.error = None;
                    job_core::transition(&mut j, "completed")?;
                }
            }
        } else {
            job_core::transition(&mut j, &status.state)?;
            j.error = status.error;
        }
        job_core::persist(store(&i)?, &j)?;
        if before != j.state && job_core::terminal(&j.state) {
            i.settings.diagnostic(
                if j.state == "completed" {
                    "success"
                } else {
                    "error"
                },
                &format!("Render {}: {}", &j.id[..8], j.state),
            )?;
            use tauri_plugin_notification::NotificationExt;
            let _ = app
                .notification()
                .builder()
                .title("MyMovie Studio")
                .body(format!("Render {}", j.state))
                .show();
            let _ = app.emit("project-changed", store(&i)?.read()?);
        }
    }
    let jobs = job_core::list(store(&i)?)?;
    let active = jobs
        .iter()
        .filter(|j| !job_core::terminal(&j.state))
        .count();
    dock(app, active);
    Ok(jobs)
}
fn dock(app: &tauri::AppHandle, active: usize) {
    #[cfg(target_os = "macos")]
    {
        let label = if active == 0 {
            String::new()
        } else {
            format!("{active} active")
        };
        let _ = app.run_on_main_thread(move || {
            use objc2::MainThreadMarker;
            use objc2_app_kit::NSApplication;
            use objc2_foundation::NSString;
            if let Some(main) = MainThreadMarker::new() {
                let tile = NSApplication::sharedApplication(main).dockTile();
                let value = (!label.is_empty()).then(|| NSString::from_str(&label));
                tile.setBadgeLabel(value.as_deref());
            }
        });
    }
}
#[tauri::command]
pub async fn cancel_job(state: S<'_>, job_id: String) -> Reply<Vec<Job>> {
    let i = state.inner.lock().await;
    let mut j = job_core::list(store(&i).map_err(err)?)
        .map_err(err)?
        .into_iter()
        .find(|j| j.id == job_id)
        .ok_or("Attempt missing")?;
    let remote = j
        .remote_id
        .as_deref()
        .ok_or("Unknown submission needs manual reconciliation")?;
    backend(&connection(&i, &j.connection_id).map_err(err)?)
        .map_err(err)?
        .cancel(remote)
        .await
        .map_err(err)?;
    let c = connection(&i, &j.connection_id).map_err(err)?;
    job_core::transition(
        &mut j,
        if c.kind == "comfyui" {
            "canceled"
        } else {
            "cancel_requested"
        },
    )
    .map_err(err)?;
    job_core::persist(store(&i).map_err(err)?, &j).map_err(err)?;
    job_core::list(store(&i).map_err(err)?).map_err(err)
}
#[tauri::command]
pub async fn runner_action(state: S<'_>, connection_id: String, action: String) -> Reply<Value> {
    let c = connection(&*state.inner.lock().await, &connection_id).map_err(err)?;
    relay(&c)
        .map_err(err)?
        .command(&action, json!({}))
        .await
        .map_err(err)
}
#[tauri::command]
pub async fn plan_deployment(
    state: S<'_>,
    connection_id: String,
    workflow_ids: Vec<String>,
) -> Reply<Value> {
    let i = state.inner.lock().await;
    let c = connection(&i, &connection_id).map_err(err)?;
    let p = store(&i).and_then(ProjectStore::read).map_err(err)?;
    let workflows: Vec<_> = p
        .workflows
        .into_iter()
        .filter(|w| workflow_ids.contains(&w.id))
        .collect();
    relay(&c).map_err(err)?.command("provision",json!({"workflows":workflows,"runtimeLock":i.settings.read().map_err(err)?.storage["runtimeLock"]})).await.map_err(err)
}
#[tauri::command]
pub async fn sync_storage(state: S<'_>, direction: String, asset_ids: Vec<String>) -> Reply<Value> {
    let mut i = state.inner.lock().await;
    let settings = i.settings.read().map_err(err)?;
    let reference = settings.storage["transferCredentialRef"]
        .as_str()
        .ok_or("Store a signed transfer manifest URL in Settings")?;
    if reference != "connection:storage-transfer" {
        return Err("Invalid transfer credential reference".into());
    }
    let url = keyring::Entry::new("net.fenki.mymovie-studio", reference)
        .map_err(err)?
        .get_password()
        .map_err(err)?;
    let objects = storage_s3::manifest(&url)
        .await
        .map_err(|_| "Transfer manifest unavailable or expired")?;
    let s = i.project.as_mut().ok_or("Open a movie first")?;
    let mut p = s.read().map_err(err)?;
    let mut count = 0;
    for o in objects {
        if direction == "push" {
            if let Some(a) = p
                .assets
                .iter()
                .find(|a| asset_ids.contains(&a.id) && a.sha256 == o.sha256)
            {
                if a.kind == "lora" && (o.architecture.is_none() || o.license.is_none()) {
                    return Err("LoRA manifest needs architecture and license".into());
                }
                storage_s3::upload(&o, &asset_core::source(s.path(), a, true).map_err(err)?)
                    .await
                    .map_err(|_| "Upload failed; renew transfer URLs")?;
                count += 1;
            }
        } else if direction == "pull" {
            let cache = project_core::confined(s.path(), "media/transfers").map_err(err)?;
            std::fs::create_dir_all(&cache).map_err(err)?;
            let name = Path::new(&o.name)
                .file_name()
                .ok_or("Object name missing")?;
            let dest = cache.join(format!("{}-{}", o.sha256, name.to_string_lossy()));
            storage_s3::download(&o, &dest).await.map_err(err)?;
            let a = asset_core::import(s.path(), &dest).map_err(err)?;
            if !p.assets.iter().any(|old| old.path == a.path) {
                p.assets.push(a);
            }
            count += 1;
        } else {
            return Err("Invalid transfer direction".into());
        }
    }
    let revision = p.revision;
    s.save(p, revision).map_err(err)?;
    Ok(json!({"transferred":count,"direction":direction}))
}

#[tauri::command]
pub fn validate_runtime(runtime: Value) -> Reply<()> {
    let lock: provision_core::RuntimeLock = serde_json::from_value(runtime).map_err(err)?;
    lock.validate().map_err(err)
}
#[tauri::command]
pub async fn media_tools() -> Reply<Value> {
    let mut reports = serde_json::Map::new();
    for tool in ["ffmpeg", "ffprobe"] {
        let result = tokio::process::Command::new(tool)
            .arg("-version")
            .output()
            .await;
        reports.insert(tool.into(), match result {
            Ok(o) if o.status.success() => json!({"available":true,"version":String::from_utf8_lossy(&o.stdout).lines().next().unwrap_or("")}),
            _ => json!({"available":false,"help":"Install FFmpeg and ensure the application can find it in PATH"}),
        });
    }
    Ok(Value::Object(reports))
}

#[tauri::command]
pub async fn assistant_request(
    state: S<'_>,
    connection_id: String,
    model: String,
    text: String,
) -> Reply<Value> {
    let c = {
        let i = state.inner.lock().await;
        connection(&i, &connection_id).map_err(err)?
    };
    let token = credential(&c).map_err(|_| "Enter a replacement key in Connections".to_string())?;
    crate::assistant::request(&c.kind, &token, &model, &text).await
}
#[tauri::command]
pub async fn import_media_drop(
    state: S<'_>,
    paths: Vec<String>,
    frame_id: Option<String>,
    shot_id: Option<String>,
    episode_id: Option<String>,
    scene_id: Option<String>,
    new_scene: Option<bool>,
    character_id: Option<String>,
    linked: Option<bool>,
) -> Reply<Project> {
    if paths.is_empty() || paths.len() > 64 {
        return Err("Drop between one and 64 files".into());
    }
    let mut i = state.inner.lock().await;
    let s = i.project.as_mut().ok_or("No movie open")?;
    let p = s.read().map_err(err)?;
    let next = asset_core::import_target(
        s.path(),
        p,
        &paths,
        asset_core::DropTarget {
            frame: frame_id.as_deref(),
            shot: shot_id.as_deref(),
            episode: episode_id.as_deref(),
            scene: scene_id.as_deref(),
            new_scene: new_scene.unwrap_or(false),
            character: character_id.as_deref(),
            linked: linked.unwrap_or(false),
        },
    )
    .map_err(err)?;
    let revision = next.revision;
    s.save(next, revision).map_err(err)
}

#[tauri::command]
pub async fn collect_media(state: S<'_>) -> Reply<Project> {
    let mut i = state.inner.lock().await;
    let s = i.project.as_mut().ok_or("No movie open")?;
    let p = s.read().map_err(err)?;
    let next = asset_core::collect(s.path(), p).map_err(err)?;
    let revision = next.revision;
    s.save(next, revision).map_err(err)
}
#[tauri::command]
pub async fn asset_availability(state: S<'_>, verify: Option<bool>) -> Reply<Value> {
    let (root, p) = {
        let i = state.inner.lock().await;
        let s = i.project.as_ref().ok_or("No movie open")?;
        (s.path().to_path_buf(), s.read().map_err(err)?)
    };
    tauri::async_runtime::spawn_blocking(move || {
        json!(
            p.assets
                .iter()
                .map(|a| (
                    a.id.clone(),
                    asset_core::source(&root, a, verify.unwrap_or(false)).is_ok()
                ))
                .collect::<std::collections::HashMap<_, _>>()
        )
    })
    .await
    .map_err(err)
}

#[tauri::command]
pub async fn relink_asset(state: S<'_>, asset_id: String, path: String) -> Reply<Project> {
    let mut i = state.inner.lock().await;
    let s = i.project.as_mut().ok_or("No movie open")?;
    let mut p = s.read().map_err(err)?;
    let a = p
        .assets
        .iter_mut()
        .find(|a| a.id == asset_id)
        .ok_or("Asset missing")?;
    if a.source_path.is_none() {
        return Err("Only linked originals can be relinked".into());
    }
    a.source_path = Some(path);
    asset_core::source(s.path(), a, true).map_err(err)?;
    let revision = p.revision;
    s.save(p, revision).map_err(err)
}
