//! Frozen batches and concurrent provider I/O. Never await a provider under Inner.
use super::*;
use job_core::{RemoteStatus, runs};

fn preflight(i: &Inner, draft: &JobDraft) -> Result<Vec<Job>> {
    if draft.items.is_empty() {
        return Err("Add a workflow item first".into());
    }
    let p = store(i)?.read()?;
    let now = chrono_now();
    let mut attempts = vec![];
    for item in &draft.items {
        let w = p
            .workflows
            .iter()
            .find(|w| w.id == item.workflow_id)
            .ok_or("Workflow missing")?;
        let mut c = connection(i, &item.connection_id)?;
        // Item overrides are explicit; otherwise use verified workflow/account mapping.
        if let Some(id) = &item.deployment_id {
            c.deployment_id = Some(id.clone());
        }
        if let Some(family) = &item.api_family {
            c.api_family = Some(family.clone());
        }
        if item.deployment_id.is_none() && item.api_family.is_none() {
            c = workflow_core::deployment(w, &c)?;
        }
        runs::lane(&c)?;
        backend(&c)?; // validates endpoint, route, credentials without network activity
        let mut snapshot = workflow_core::resolve_item(&p, draft, item)?;
        if c.kind == "runninghub" && snapshot["bindings"].as_array().is_none_or(Vec::is_empty) {
            return Err("Configure verified provider bindings first".into());
        }
        for value in snapshot["media"].as_object().unwrap().values() {
            let asset: Asset = serde_json::from_value(value.clone())?;
            asset_core::source(store(i)?.path(), &asset, true)?;
        }
        snapshot["connection"] = serde_json::to_value(&c)?;
        attempts.push(Job {
            id: project_core::id(),
            frame_id: draft.frame_id.clone(),
            workflow_id: w.id.clone(),
            workflow_version: w.version.clone(),
            connection_id: c.id.clone(),
            state: "waiting".into(),
            remote_id: None,
            snapshot,
            results: vec![],
            error: None,
            created_at: now.clone(),
            updated_at: now.clone(),
            run_id: None,
            item_id: Some(item.id.clone()),
        });
    }
    Ok(attempts)
}
fn chrono_now() -> String {
    chrono::Utc::now().to_rfc3339()
}
#[tauri::command]
pub async fn preview_job_draft(state: S<'_>, draft: JobDraft) -> Reply<Value> {
    let i = state.inner.lock().await;
    preflight(&i, &draft)
        .map(|jobs| json!({"items": jobs.iter().map(|j| &j.snapshot).collect::<Vec<_>>() }))
        .map_err(err)
}
#[tauri::command]
pub async fn list_job_runs(state: S<'_>) -> Reply<Vec<JobRun>> {
    let i = state.inner.lock().await;
    match &i.project {
        Some(s) => runs::list(s).map_err(err),
        None => Ok(vec![]),
    }
}
#[tauri::command]
pub async fn start_job_draft(
    app: tauri::AppHandle,
    state: S<'_>,
    draft_id: String,
) -> Reply<Vec<Job>> {
    let i = state.inner.lock().await;
    let draft = store(&i)
        .map_err(err)?
        .read()
        .map_err(err)?
        .job_drafts
        .into_iter()
        .find(|d| d.id == draft_id)
        .ok_or("Draft missing; wait for it to save")?;
    let mut attempts = preflight(&i, &draft).map_err(err)?;
    let run = JobRun {
        id: project_core::id(),
        name: draft.name,
        draft_id: draft.id,
        job_ids: attempts.iter().map(|j| j.id.clone()).collect(),
        state: "active".into(),
        created_at: chrono_now(),
    };
    for j in &mut attempts {
        j.run_id = Some(run.id.clone());
    }
    runs::create(store(&i).map_err(err)?, &run, &attempts).map_err(err)?;
    let all = job_core::list(store(&i).map_err(err)?).map_err(err)?;
    drop(i);
    let studio = state.inner().clone();
    tauri::async_runtime::spawn(async move {
        let _ = refresh(&studio, &app).await;
    });
    Ok(all)
}
#[tauri::command]
pub async fn control_job_run(state: S<'_>, run_id: String, action: String) -> Reply<Vec<Job>> {
    let i = state.inner.lock().await;
    runs::control(store(&i).map_err(err)?, &run_id, &action).map_err(err)?;
    let active = if action == "cancel" {
        job_core::list(store(&i).map_err(err)?)
            .map_err(err)?
            .into_iter()
            .filter(|j| {
                j.run_id.as_deref() == Some(&run_id)
                    && !job_core::terminal(&j.state)
                    && (j.remote_id.is_some() || j.state == "staging")
            })
            .map(|j| j.id)
            .collect::<Vec<_>>()
    } else {
        vec![]
    };
    drop(i);
    let mut errors = vec![];
    for id in active {
        if let Err(e) = super::cancel_job(state.clone(), id).await {
            errors.push(e);
        }
    }
    if !errors.is_empty() {
        return Err(format!(
            "Some active attempts could not be canceled: {}",
            errors.join("; ")
        ));
    }
    super::list_jobs(state).await
}

fn session(i: &Inner, epoch: u64) -> Result<()> {
    if i.session != epoch || i.project.is_none() {
        return Err("Project session changed; response retained only by remote provider".into());
    }
    Ok(())
}
async fn dispatch(
    studio: Arc<Studio>,
    epoch: u64,
    mut j: Job,
    b: Box<dyn ExecutionBackend>,
    uploads: Vec<(String, Asset, Vec<u8>)>,
) -> Result<()> {
    let mut semantic = j.snapshot["semantic"].clone();
    let result: Result<Value> = async {
        for (key, asset, bytes) in uploads { semantic[&key] = json!(b.stage_asset(&asset.name, bytes).await?); }
        let bindings: Vec<Binding> = serde_json::from_value(j.snapshot["bindings"].clone())?;
        let mut graph = workflow_core::bind_exact(&j.snapshot["originalGraph"], &bindings, &semantic)?;
        b.validate_job(&graph).await?;
        if j.snapshot["connection"]["kind"] == "runninghub" {
            graph["_mymovieNodeInfo"] = json!(bindings.iter().map(|x| json!({"nodeId":x.node_id,"fieldName":x.input,"fieldValue":graph[&x.node_id]["inputs"][&x.input]})).collect::<Vec<_>>());
        }
        Ok(graph)
    }.await;
    let graph = {
        let i = studio.inner.lock().await;
        session(&i, epoch)?;
        let latest = job_core::list(store(&i)?)?
            .into_iter()
            .find(|x| x.id == j.id)
            .ok_or("Attempt missing")?;
        if latest.state != "staging" {
            return Ok(());
        }
        match result {
            Err(e) => {
                j.error = Some(e.to_string());
                job_core::transition(&mut j, "failed")?;
                job_core::persist(store(&i)?, &j)?;
                return Ok(());
            }
            Ok(graph) => {
                j.snapshot["semantic"] = semantic;
                j.snapshot["providerPayload"] = graph.clone();
                // A crash after this write must never blindly create a second task.
                job_core::transition(&mut j, "unknown")?;
                job_core::persist(store(&i)?, &j)?;
                project_core::atomic_json(
                    &project_core::confined(
                        store(&i)?.path(),
                        &format!("jobs/submissions/{}.json", j.id),
                    )?,
                    &j,
                )?;
                graph
            }
        }
    };
    let response = b.submit(&j.id, &graph).await;
    let i = studio.inner.lock().await;
    session(&i, epoch)?;
    match response {
        Ok(remote) => {
            j.remote_id = Some(remote);
            job_core::transition(&mut j, "submitted")?;
        }
        Err(e) => {
            j.error = Some(e.to_string());
            if e.downcast_ref::<job_core::SubmissionRejected>().is_some() {
                job_core::transition(&mut j, "failed")?;
            }
        }
    }
    job_core::persist(store(&i)?, &j)
}
async fn poll(
    studio: Arc<Studio>,
    app: tauri::AppHandle,
    epoch: u64,
    mut j: Job,
    b: Box<dyn ExecutionBackend>,
) -> Result<()> {
    let status: RemoteStatus = b.status(j.remote_id.as_deref().unwrap()).await?;
    let mut outputs = vec![];
    let mut collection_error = None;
    if status.state == "collecting" {
        for o in &status.outputs {
            match b.collect(o).await {
                Ok((name, bytes)) => {
                    let hash = format!("{:x}", Sha256::digest(&bytes));
                    if o.get("sha256")
                        .and_then(Value::as_str)
                        .is_some_and(|h| h != hash)
                        || o.get("size")
                            .and_then(Value::as_u64)
                            .is_some_and(|s| s != bytes.len() as u64)
                    {
                        collection_error = Some("Output integrity mismatch".to_string());
                        break;
                    }
                    outputs.push((name, bytes));
                }
                Err(_) => {
                    collection_error =
                        Some("Result collection failed; refresh to retry download".into());
                    break;
                }
            }
        }
    }
    let mut i = studio.inner.lock().await;
    session(&i, epoch)?;
    let latest = job_core::list(store(&i)?)?
        .into_iter()
        .find(|x| x.id == j.id)
        .ok_or("Attempt missing")?;
    if job_core::terminal(&latest.state) || latest.state != j.state {
        return Ok(());
    }
    if status.state == "collecting" {
        if status.outputs.is_empty() {
            j.error = Some("Execution completed without collectable output".into());
            job_core::transition(&mut j, "failed")?;
        } else if let Some(error) = collection_error {
            j.error = Some(error);
            job_core::transition(&mut j, "collecting")?;
        } else {
            let s = i.project.as_mut().unwrap();
            let mut p = s.read()?;
            for (name, bytes) in outputs {
                let dir = tempfile::tempdir()?;
                let ext = Path::new(&name)
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("png");
                let tmp = dir.path().join(format!("result.{ext}"));
                std::fs::write(&tmp, bytes)?;
                let a = asset_core::import(s.path(), &tmp)?;
                let a = if let Some(old) = p.assets.iter().find(|old| old.path == a.path) {
                    old.clone()
                } else {
                    p.assets.push(a.clone());
                    a
                };
                j.results.push(a);
            }
            let rev = p.revision;
            s.save(p, rev)?;
            j.error = None;
            job_core::transition(&mut j, "completed")?;
        }
    } else {
        job_core::transition(&mut j, &status.state)?;
        j.error = status.error;
    }
    job_core::persist(store(&i)?, &j)?;
    if job_core::terminal(&j.state) {
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
    Ok(())
}
pub async fn drive(studio: &Arc<Studio>, app: &tauri::AppHandle) -> Result<Vec<Job>> {
    let i = studio.inner.lock().await;
    if i.project.is_none() {
        return Ok(vec![]);
    }
    let epoch = i.session;
    let attempts = job_core::list(store(&i)?)?;
    let eligible = runs::eligible(&attempts, &i.settings.read()?.connections)?;
    for mut j in attempts {
        if job_core::terminal(&j.state) {
            continue;
        }
        if studio
            .inflight
            .lock()
            .unwrap()
            .contains(&(epoch, j.id.clone()))
        {
            continue;
        }
        let b = match connection(&i, &j.connection_id)
            .and_then(|c| workflow_core::frozen_connection(&j, &c))
            .and_then(|c| backend(&c))
        {
            Ok(b) => b,
            Err(e) => {
                j.error = Some(format!("Destination unavailable: {e}"));
                if j.state == "waiting" {
                    job_core::transition(&mut j, "paused")?;
                }
                job_core::persist(store(&i)?, &j)?;
                continue;
            }
        };
        let state = studio.clone();
        if eligible.contains(&j.id) {
            let mut uploads = vec![];
            let verified: Result<()> = (|| {
                for (key, value) in j.snapshot["media"]
                    .as_object()
                    .ok_or("Frozen media missing")?
                {
                    let a: Asset = serde_json::from_value(value.clone())?;
                    let bytes = std::fs::read(asset_core::source(store(&i)?.path(), &a, true)?)?;
                    uploads.push((key.clone(), a, bytes));
                }
                Ok(())
            })();
            if let Err(e) = verified {
                j.error = Some(e.to_string());
                job_core::transition(&mut j, "failed")?;
                job_core::persist(store(&i)?, &j)?;
                continue;
            }
            job_core::transition(&mut j, "staging")?;
            job_core::persist(store(&i)?, &j)?;
            launch(state, app.clone(), epoch, j, b, Some(uploads));
        } else if j.remote_id.is_some() {
            launch(state, app.clone(), epoch, j, b, None);
        }
    }
    drop(i);
    let i = studio.inner.lock().await;
    if i.project.is_none() {
        return Ok(vec![]);
    }
    let all = job_core::list(store(&i)?)?;
    super::dock(
        app,
        all.iter().filter(|j| !job_core::terminal(&j.state)).count(),
    );
    Ok(all)
}

// Register under Inner before spawning; refresh ticks never duplicate provider I/O.
struct Inflight {
    studio: Arc<Studio>,
    key: (u64, String),
}
impl Drop for Inflight {
    fn drop(&mut self) {
        self.studio.inflight.lock().unwrap().remove(&self.key);
    }
}
fn launch(
    studio: Arc<Studio>,
    app: tauri::AppHandle,
    epoch: u64,
    job: Job,
    backend: Box<dyn ExecutionBackend>,
    uploads: Option<Vec<(String, Asset, Vec<u8>)>>,
) {
    let key = (epoch, job.id.clone());
    studio.inflight.lock().unwrap().insert(key.clone());
    let guard = Inflight {
        studio: studio.clone(),
        key,
    };
    tauri::async_runtime::spawn(async move {
        let _guard = guard;
        let result = match uploads {
            Some(uploads) => dispatch(studio.clone(), epoch, job, backend, uploads).await,
            None => poll(studio.clone(), app, epoch, job, backend).await,
        };
        if let Err(e) = result {
            let i = studio.inner.lock().await;
            if session(&i, epoch).is_ok() {
                if let Ok(mut jobs) = job_core::list(store(&i).unwrap()) {
                    if let Some(j) = jobs
                        .iter_mut()
                        .find(|j| j.id == _guard.key.1 && !job_core::terminal(&j.state))
                    {
                        j.error = Some(e.to_string());
                        let _ = job_core::persist(store(&i).unwrap(), j);
                    }
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use std::sync::Arc;
    use tokio::sync::{Barrier, Notify};
    struct Delayed {
        entered: Arc<Barrier>,
        release: Arc<Notify>,
        remote: String,
    }
    #[async_trait]
    impl ExecutionBackend for Delayed {
        async fn health(&self) -> Result<Value> {
            Ok(json!({}))
        }
        async fn validate_job(&self, _: &Value) -> Result<()> {
            Ok(())
        }
        async fn submit(&self, _: &str, _: &Value) -> Result<String> {
            self.entered.wait().await;
            self.release.notified().await;
            Ok(self.remote.clone())
        }
        async fn status(&self, _: &str) -> Result<RemoteStatus> {
            unreachable!()
        }
        async fn cancel(&self, _: &str) -> Result<()> {
            Ok(())
        }
        async fn collect(&self, _: &Value) -> Result<(String, Vec<u8>)> {
            unreachable!()
        }
        async fn stage_asset(&self, _: &str, _: Vec<u8>) -> Result<String> {
            unreachable!()
        }
    }
    fn attempt() -> Job {
        Job {
            id: project_core::id(),
            frame_id: "frame".into(),
            workflow_id: "workflow".into(),
            workflow_version: "v1".into(),
            connection_id: "local".into(),
            state: "staging".into(),
            remote_id: None,
            snapshot: json!({"semantic":{},"bindings":[],"media":{},"originalGraph":{"1":{"class_type":"EmptyImage","inputs":{}}},"connection":{"kind":"comfyui"}}),
            results: vec![],
            error: None,
            created_at: chrono_now(),
            updated_at: chrono_now(),
            run_id: None,
            item_id: None,
        }
    }
    #[tokio::test]
    async fn independent_submissions_overlap_and_switched_session_cannot_receive_response() {
        let dir = tempfile::tempdir().unwrap();
        let old_path = dir.path().join("old.mymovie");
        let studio = Arc::new(Studio::new(dir.path(), Arc::new(Mutex::new(vec![]))).unwrap());
        {
            studio.inner.lock().await.project =
                Some(ProjectStore::create(&old_path, "Old", false).unwrap());
        }
        let a = attempt();
        let b = attempt();
        {
            let i = studio.inner.lock().await;
            job_core::persist(store(&i).unwrap(), &a).unwrap();
            job_core::persist(store(&i).unwrap(), &b).unwrap();
        }
        let entered = Arc::new(Barrier::new(3));
        let release_a = Arc::new(Notify::new());
        let release_b = Arc::new(Notify::new());
        let provider = |release: Arc<Notify>, remote: &str| {
            Box::new(Delayed {
                entered: entered.clone(),
                release,
                remote: remote.into(),
            }) as Box<dyn ExecutionBackend>
        };
        let first = tokio::spawn(dispatch(
            studio.clone(),
            0,
            a.clone(),
            provider(release_a.clone(), "task-a"),
            vec![],
        ));
        let second = tokio::spawn(dispatch(
            studio.clone(),
            0,
            b.clone(),
            provider(release_b.clone(), "task-b"),
            vec![],
        ));
        tokio::time::timeout(std::time::Duration::from_secs(2), entered.wait())
            .await
            .expect("Both providers must reach submit concurrently");
        // UI/document access remains available while both providers are slow.
        let lock = tokio::time::timeout(std::time::Duration::from_millis(250), studio.inner.lock())
            .await
            .unwrap();
        assert!(
            job_core::list(store(&lock).unwrap())
                .unwrap()
                .iter()
                .all(|j| j.state == "unknown")
        );
        drop(lock);
        release_b.notify_one();
        second.await.unwrap().unwrap();
        {
            let i = studio.inner.lock().await;
            assert_eq!(
                job_core::list(store(&i).unwrap())
                    .unwrap()
                    .iter()
                    .find(|j| j.id == b.id)
                    .unwrap()
                    .remote_id
                    .as_deref(),
                Some("task-b")
            );
        }
        {
            let mut i = studio.inner.lock().await;
            i.project = None;
            i.session += 1;
            i.project =
                Some(ProjectStore::create(dir.path().join("new.mymovie"), "New", false).unwrap());
        }
        release_a.notify_one();
        assert!(first.await.unwrap().is_err());
        {
            let i = studio.inner.lock().await;
            assert!(job_core::list(store(&i).unwrap()).unwrap().is_empty());
        }
        let old = ProjectStore::open(old_path).unwrap();
        let frozen = job_core::list(&old)
            .unwrap()
            .into_iter()
            .find(|j| j.id == a.id)
            .unwrap();
        assert_eq!(frozen.state, "unknown");
        assert!(frozen.remote_id.is_none());
    }
    #[tokio::test]
    async fn canceled_staging_never_submits() {
        let dir = tempfile::tempdir().unwrap();
        let studio = Arc::new(Studio::new(dir.path(), Arc::new(Mutex::new(vec![]))).unwrap());
        let mut j = attempt();
        j.state = "canceled".into();
        {
            let mut i = studio.inner.lock().await;
            i.project = Some(
                ProjectStore::create(dir.path().join("movie.mymovie"), "Cancel", false).unwrap(),
            );
            job_core::persist(store(&i).unwrap(), &j).unwrap();
        }
        j.state = "staging".into();
        let provider = Delayed {
            entered: Arc::new(Barrier::new(2)),
            release: Arc::new(Notify::new()),
            remote: "unexpected".into(),
        };
        tokio::time::timeout(
            std::time::Duration::from_secs(1),
            dispatch(studio.clone(), 0, j, Box::new(provider), vec![]),
        )
        .await
        .unwrap()
        .unwrap();
        let i = studio.inner.lock().await;
        assert_eq!(
            job_core::list(store(&i).unwrap()).unwrap()[0].state,
            "canceled"
        );
    }
}
