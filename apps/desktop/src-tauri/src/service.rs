mod catalogue;
mod jobs;
mod runner_tokens;
mod thumbnails;
pub use catalogue::*;
use integration_core::SettingsStore;
use job_core::ExecutionBackend;
pub use jobs::*;
use project_core::{ProjectStore, Result};
pub use runner_tokens::*;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    path::Path,
    sync::{Arc, Mutex},
};
use studio_contracts::*;
use tauri::{Emitter, State};
pub use thumbnails::*;
pub struct Studio {
    pub inner: tokio::sync::Mutex<Inner>,
    pub opened: Arc<Mutex<Vec<String>>>,
    pub inflight: Mutex<std::collections::HashSet<(u64, String)>>,
}
pub struct Inner {
    pub project: Option<ProjectStore>,
    pub settings: SettingsStore,
    pub session: u64,
}
impl Studio {
    pub fn new(dir: &Path, opened: Arc<Mutex<Vec<String>>>) -> Result<Self> {
        Ok(Self {
            inner: tokio::sync::Mutex::new(Inner {
                project: None,
                session: 0,
                settings: SettingsStore::open(&dir.join("app.sqlite"))?,
            }),
            opened,
            inflight: Mutex::new(Default::default()),
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
    i.session += 1;
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
pub async fn open_project(
    app: tauri::AppHandle,
    state: S<'_>,
    path: String,
    allow_upgrade: Option<bool>,
) -> Reply<Project> {
    let mut i = state.inner.lock().await;
    if let Some(s) = &i.project {
        if std::fs::canonicalize(&path).ok().as_ref() == Some(&s.path().to_path_buf()) {
            return s.read().map_err(err);
        }
    }
    let manifest = project_core::confined(Path::new(&path), "manifest.json").map_err(err)?;
    let format: Value =
        serde_json::from_slice(&std::fs::read(manifest).map_err(err)?).map_err(err)?;
    if format["schemaVersion"].as_u64().is_some_and(|v| v < 5) && !allow_upgrade.unwrap_or(false) {
        return Err("UPGRADE_REQUIRED: Workflow catalogue needs document format 4. A consistent SQLite and manifest backup will be saved inside backups/ first. Older MyMovie Studio versions cannot open the upgraded document.".into());
    }
    let new = ProjectStore::open(path).map_err(err)?;
    select(&app, &mut i, new).map_err(err)
}
#[tauri::command]
pub async fn close_project(state: S<'_>) -> Reply<()> {
    let mut i = state.inner.lock().await;
    i.session += 1;
    i.project.take();
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
    let file = Path::new(&path);
    if std::fs::metadata(file).map_err(err)?.len() > 16 * 1024 * 1024 {
        return Err("Workflow exceeds 16 MiB limit".into());
    }
    let graph = serde_json::from_slice(&std::fs::read(file).map_err(err)?).map_err(err)?;
    let bundled = workflow_core::bundle::is_bundle(&graph);
    let mut workflows = if bundled {
        workflow_core::bundle::import(graph).map_err(err)?
    } else {
        vec![
            workflow_core::import_source(
                file.file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .as_ref(),
                graph,
            )
            .map_err(err)?,
        ]
    };
    let catalogue = i.settings.catalogue().map_err(err)?;
    for w in &mut workflows {
        if !bundled
            && let Some(old) = catalogue
                .iter()
                .find(|old| old.version == w.version && old.editor_graph == w.editor_graph)
        {
            *w = old.clone();
        }
        if let Some(old) = catalogue.iter().find(|old| old.id == w.id) {
            if old.version != w.version
                || old.graph != w.graph
                || old.editor_graph != w.editor_graph
            {
                return Err("Collection conflicts with an immutable saved variant".into());
            }
            w.profiles = old.profiles.clone();
            w.last_target = old.last_target.clone();
        }
    }
    let s = i.project.as_mut().ok_or("No movie open")?;
    let mut p = s.read().map_err(err)?;
    for w in &mut workflows {
        if !bundled
            && let Some(old) = p
                .workflows
                .iter()
                .find(|old| old.version == w.version && old.editor_graph == w.editor_graph)
        {
            *w = old.clone();
        }
        if let Some(old) = p.workflows.iter_mut().find(|old| old.id == w.id) {
            if old.version != w.version
                || old.graph != w.graph
                || old.editor_graph != w.editor_graph
            {
                return Err("Collection conflicts with this movie's variant".into());
            }
            old.wrapper = w.wrapper.clone();
            old.layout = w.layout.clone();
            old.bindings = w.bindings.clone();
            old.requirements = w.requirements.clone();
        } else {
            p.workflows.push(w.clone());
        }
    }
    let r = p.revision;
    let saved = s.save(p, r).map_err(err)?;
    for w in &workflows {
        i.settings.put_workflow(w).map_err(err)?;
    }
    Ok(saved)
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
    i.settings.read().map_err(err)
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
pub async fn remove_recent_project(state: S<'_>, path: String) -> Reply<Value> {
    let i = state.inner.lock().await;
    i.settings.remove_recent(&path).map_err(err)?;
    i.settings.list_recent().map_err(err)
}
#[tauri::command]
pub async fn clear_recent_projects(state: S<'_>) -> Reply<Value> {
    let i = state.inner.lock().await;
    i.settings.clear_recent().map_err(err)?;
    i.settings.list_recent().map_err(err)
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
    app: tauri::AppHandle,
    state: S<'_>,
    frame_id: String,
    workflow_id: String,
    connection_id: String,
    values: Value,
) -> Reply<Vec<Job>> {
    let mut i = state.inner.lock().await;
    let draft_id = project_core::id();
    let draft = JobDraft {
        queued_run_id: None,
        queued_job_ids: vec![],
        id: draft_id.clone(),
        name: "Generation".into(),
        frame_id,
        context: Default::default(),
        items: vec![JobItem {
            id: project_core::id(),
            workflow_id,
            connection_id,
            values,
            input_text: Default::default(),
            input_errors: Default::default(),
            assets: Default::default(),
            bindings: None,
            deployment_id: None,
            api_family: None,
        }],
    };
    let s = i.project.as_mut().ok_or("No movie open")?;
    let mut p = s.read().map_err(err)?;
    p.job_drafts.push(draft);
    let rev = p.revision;
    s.save(p, rev).map_err(err)?;
    drop(i);
    start_job_draft(app, state, draft_id).await
}
#[tauri::command]
pub async fn refresh_jobs(app: tauri::AppHandle, state: S<'_>) -> Reply<Vec<Job>> {
    refresh(&state, &app).await.map_err(err)
}
pub async fn refresh(state: &Arc<Studio>, app: &tauri::AppHandle) -> Result<Vec<Job>> {
    jobs::drive(state, app).await
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
pub async fn reconcile_job(
    state: S<'_>,
    job_id: String,
    remote_id: Option<String>,
    confirmed_absent: bool,
) -> Reply<Vec<Job>> {
    let i = state.inner.lock().await;
    let epoch = i.session;
    if state
        .inflight
        .lock()
        .unwrap()
        .contains(&(epoch, job_id.clone()))
    {
        return Err(
            "This attempt is still contacting the provider; wait before reconciling".into(),
        );
    }
    let attempts = job_core::list(store(&i).map_err(err)?).map_err(err)?;
    let mut j = attempts
        .iter()
        .find(|j| j.id == job_id)
        .cloned()
        .ok_or("Attempt missing")?;
    if j.state != "unknown" || j.remote_id.is_some() {
        return Err("Only an unknown submission without a task ID can be reconciled".into());
    }
    let remote = remote_id
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.trim().to_owned());
    if remote.is_some() && confirmed_absent {
        return Err("Choose either an existing task or a confirmed absent task".into());
    }
    let b = if remote.is_some() {
        if attempts.iter().any(|other| {
            other.id != j.id && other.connection_id == j.connection_id && other.remote_id == remote
        }) {
            return Err("This task is already attached to another attempt".into());
        }
        Some(
            backend(
                &workflow_core::frozen_connection(
                    &j,
                    &connection(&i, &j.connection_id).map_err(err)?,
                )
                .map_err(err)?,
            )
            .map_err(err)?,
        )
    } else {
        None
    };
    drop(i);
    if let Some(remote) = remote {
        let status = b.unwrap().status(&remote).await.map_err(err)?;
        if status.state == "unknown" {
            return Err("The selected account could not verify this task ID".into());
        }
        j.remote_id = Some(remote.clone());
        j.snapshot["reconciliation"] = json!({"action":"attached-task","remoteId":remote});
        j.error = None;
        job_core::transition(&mut j, "submitted").map_err(err)?;
    } else if confirmed_absent {
        j.snapshot["reconciliation"] = json!({"action":"user-confirmed-no-task"});
        j.error = Some("User checked provider history and confirmed no task was created".into());
        job_core::transition(&mut j, "failed").map_err(err)?;
    } else {
        return Err(
            "Provide a verified task ID or confirm no task exists in provider history".into(),
        );
    }
    let i = state.inner.lock().await;
    if i.session != epoch {
        return Err("Project changed during reconciliation".into());
    }
    let latest = job_core::list(store(&i).map_err(err)?)
        .map_err(err)?
        .into_iter()
        .find(|x| x.id == j.id)
        .ok_or("Attempt missing")?;
    if latest.state != "unknown" || latest.remote_id.is_some() {
        return Err("Attempt changed during reconciliation; refresh first".into());
    }
    job_core::persist(store(&i).map_err(err)?, &j).map_err(err)?;
    job_core::list(store(&i).map_err(err)?).map_err(err)
}
#[tauri::command]
pub async fn cancel_job(state: S<'_>, job_id: String) -> Reply<Vec<Job>> {
    let i = state.inner.lock().await;
    let epoch = i.session;
    let mut j = job_core::list(store(&i).map_err(err)?)
        .map_err(err)?
        .into_iter()
        .find(|j| j.id == job_id)
        .ok_or("Attempt missing")?;
    if job_core::terminal(&j.state) {
        return job_core::list(store(&i).map_err(err)?).map_err(err);
    }
    if matches!(j.state.as_str(), "waiting" | "paused" | "staging") {
        job_core::transition(&mut j, "canceled").map_err(err)?;
        job_core::persist(store(&i).map_err(err)?, &j).map_err(err)?;
        return job_core::list(store(&i).map_err(err)?).map_err(err);
    }
    let remote = j
        .remote_id
        .clone()
        .ok_or("Unknown submission needs manual reconciliation")?;
    let c = workflow_core::frozen_connection(&j, &connection(&i, &j.connection_id).map_err(err)?)
        .map_err(err)?;
    let b = backend(&c).map_err(err)?;
    drop(i);
    b.cancel(&remote).await.map_err(err)?;
    let i = state.inner.lock().await;
    if i.session != epoch {
        return Err("Project changed during cancellation".into());
    }
    let latest = job_core::list(store(&i).map_err(err)?)
        .map_err(err)?
        .into_iter()
        .find(|x| x.id == j.id)
        .ok_or("Attempt missing")?;
    if !job_core::terminal(&latest.state) {
        j = latest;
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
    }
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
    apply: Option<bool>,
    guided: Option<bool>,
    review_id: Option<String>,
) -> Reply<Value> {
    let (c, workflows, settings) = {
        let i = state.inner.lock().await;
        let c = connection(&i, &connection_id).map_err(err)?;
        let p = store(&i).and_then(ProjectStore::read).map_err(err)?;
        let workflows: Vec<_> = p
            .workflows
            .into_iter()
            .filter(|w| workflow_ids.contains(&w.id))
            .map(|w| workflow_core::for_setup(&w, &connection_id))
            .collect::<Result<Vec<_>>>()
            .map_err(err)?;
        (c, workflows, i.settings.read().map_err(err)?)
    };
    if workflows.is_empty() {
        return Err("Select at least one workflow from this movie".into());
    }
    relay(&c).map_err(err)?.command("provision",json!({"workflows":workflows,"runtimeLock":settings.storage["runtimeLock"],"profile":if guided==Some(true){Value::Null}else{settings.storage["provisionProfile"].clone()},"apply":apply.unwrap_or(false),"guided":guided.unwrap_or(false),"reviewId":review_id})).await.map_err(err)
}
#[tauri::command]
pub async fn runner_operation(
    state: S<'_>,
    connection_id: String,
    operation_id: String,
) -> Reply<Value> {
    if operation_id.len() != 36
        || !operation_id
            .bytes()
            .all(|b| b.is_ascii_hexdigit() || b == b'-')
    {
        return Err("Invalid operation identity".into());
    }
    let c = connection(&*state.inner.lock().await, &connection_id).map_err(err)?;
    relay(&c)
        .map_err(err)?
        .get(&format!("/v1/jobs/{operation_id}"))
        .await
        .map_err(err)
}
#[tauri::command]
pub fn validate_profile(profile: Value) -> Reply<()> {
    serde_json::from_value::<provision_core::ProvisionProfile>(profile)
        .map_err(err)?
        .validate()
        .map_err(err)
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
pub async fn media_tools(state: S<'_>) -> Reply<Value> {
    let configured = state
        .inner
        .lock()
        .await
        .settings
        .read()
        .map_err(err)?
        .storage["ffmpegPath"]
        .as_str()
        .map(str::to_owned);
    let mut reports = serde_json::Map::new();
    for tool in ["ffmpeg", "ffprobe"] {
        let result = tokio::process::Command::new(thumbnails::executable(configured.clone(), tool))
            .arg("-version")
            .output()
            .await;
        reports.insert(tool.into(), match result {
            Ok(o) if o.status.success() => json!({"available":true,"version":String::from_utf8_lossy(&o.stdout).lines().next().unwrap_or("")}),
            _ => json!({"available":false,"help":"Install FFmpeg or set its executable path in Settings → Media tools"}),
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

#[tauri::command]
pub async fn export_workflow_setup(
    state: S<'_>,
    path: String,
    workflow_id: String,
    requirements: studio_contracts::WorkflowRequirements,
    connection_id: Option<String>,
) -> Reply<()> {
    let inner = state.inner.lock().await;
    let project = inner
        .project
        .as_ref()
        .ok_or("Open a project first")?
        .read()
        .map_err(err)?;
    let mut workflow = project
        .workflows
        .iter()
        .find(|w| w.id == workflow_id)
        .ok_or("Unknown workflow")?
        .clone();
    if let Some(target) = connection_id {
        workflow = workflow_core::for_setup(&workflow, &target).map_err(err)?;
    }
    for a in &requirements.artifacts {
        a.validate().map_err(err)?;
    }
    if ![
        "unspecified",
        "universal",
        "apple-silicon",
        "cuda",
        "rocm",
        "cpu",
    ]
    .contains(&requirements.compatibility.as_str())
    {
        return Err("Unknown compatibility flag".into());
    }
    workflow.requirements = requirements;
    let dest = Path::new(&path);
    if dest.is_symlink() || dest.extension().is_none_or(|e| e != "json") {
        return Err("Choose a regular JSON destination".into());
    }
    project_core::atomic_json(dest, &json!([workflow])).map_err(err)
}

/// Import and assign by content ID in one document revision, never by filename.
#[tauri::command]
pub async fn import_job_media(
    state: S<'_>,
    draft_id: String,
    item_id: String,
    semantic: String,
    path: String,
    linked: Option<bool>,
) -> Reply<ImportResult> {
    let mut i = state.inner.lock().await;
    let s = i.project.as_mut().ok_or("No movie open")?;
    let mut p = s.read().map_err(err)?;
    let item = p
        .job_drafts
        .iter()
        .find(|d| d.id == draft_id)
        .and_then(|d| d.items.iter().find(|x| x.id == item_id))
        .ok_or("Job input no longer exists")?;
    let w = workflow_core::for_target(
        p.workflows
            .iter()
            .find(|w| w.id == item.workflow_id)
            .ok_or("Workflow missing")?,
        &item.connection_id,
    )
    .map_err(err)?;
    let b = item
        .bindings
        .as_ref()
        .unwrap_or(&w.bindings)
        .iter()
        .find(|b| b.semantic == semantic)
        .ok_or("Configure this workflow input first")?;
    let kind = b
        .media
        .as_ref()
        .map(|m| m.kind.as_str())
        .or_else(|| {
            (b.semantic == "image"
                || b.semantic == "mask"
                || b.semantic.starts_with("characterReference"))
            .then_some("image")
        })
        .ok_or("Select a media input")?;
    let candidate = asset_core::import_with_mode(s.path(), Path::new(&path), true).map_err(err)?;
    if candidate.kind != kind {
        return Err(format!("This input requires {kind}"));
    }
    if b.media
        .as_ref()
        .is_some_and(|m| m.role == "characterReference")
        || b.semantic.starts_with("characterReference")
    {
        return Err(
            "Import references through Characters, assign the cast, then select its image".into(),
        );
    }
    let id = asset_core::import_reusing(
        s.path(),
        &mut p.assets,
        Path::new(&path),
        linked.unwrap_or(false),
    )
    .map_err(err)?;
    p.job_drafts
        .iter_mut()
        .find(|d| d.id == draft_id)
        .unwrap()
        .items
        .iter_mut()
        .find(|x| x.id == item_id)
        .unwrap()
        .assets
        .insert(semantic, id.clone());
    let revision = p.revision;
    Ok(ImportResult {
        project: s.save(p, revision).map_err(err)?,
        asset_ids: vec![id],
    })
}

#[tauri::command]
pub fn notebook_setup_script(host: String) -> Reply<String> {
    let source = match host.as_str() {
        "colab" => include_str!("../../../../deploy/colab/MyMovie_ComfyUI.ipynb"),
        "kaggle" => include_str!("../../../../deploy/kaggle/MyMovie_ComfyUI.ipynb"),
        _ => return Err("Select Colab or Kaggle".into()),
    };
    let notebook: Value = serde_json::from_str(source).map_err(err)?;
    let cells = notebook["cells"]
        .as_array()
        .ok_or("Invalid bundled notebook")?;
    let mut script = String::new();
    // Include installation and startup, never the notebook's separate Stop cell.
    for cell in cells.iter().take(8) {
        if cell["cell_type"] == "code" {
            for line in cell["source"].as_array().ok_or("Invalid notebook cell")? {
                script.push_str(line.as_str().ok_or("Invalid notebook line")?);
            }
            script.push_str("\n\n");
        }
    }
    Ok(script)
}

#[cfg(test)]
mod notebook_script_tests {
    #[test]
    fn copyable_notebook_starts_without_including_the_stop_cell() {
        for host in ["colab", "kaggle"] {
            let script = super::notebook_setup_script(host.into()).unwrap();
            assert!(script.contains("runner.start("));
            assert!(!script.contains("runner.stop()"));
            assert!(script.contains("ARTIFACT_SHA256"));
        }
    }
}
