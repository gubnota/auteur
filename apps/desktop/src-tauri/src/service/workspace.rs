//! Application resources outlive all Movie documents. The resource snapshot uses
//! the existing domain DTO for compatibility, never a selected Movie identity.
use super::*;
use std::collections::HashMap;

pub(super) fn open(dir: &Path) -> Result<ProjectStore> {
    let mut s = ProjectStore::open_workspace(dir.join("workspace"))?;
    let mut p = s.read()?;
    let catalogue = SettingsStore::open(&dir.join("app.sqlite"))?.catalogue()?;
    let revision = p.revision;
    let mut changed = false;
    for w in catalogue {
        if !p.workflows.iter().any(|old| old.id == w.id) {
            p.workflows.push(w);
            changed = true;
        }
    }
    if changed {
        s.save(p, revision)?;
    }
    job_core::recover(&s)?;
    Ok(s)
}

/// Copy resources once per document revision. Originals/receipts remain untouched.
/// Pending historical attempts are quarantined, never silently resubmitted.
pub(super) fn migrate(global: &mut ProjectStore, movie: &ProjectStore) -> Result<()> {
    let source = movie.read()?;
    let previous: Option<String> = global
        .connection()
        .query_row(
            "SELECT json FROM movie_migrations WHERE movie_id=?1",
            [&source.id],
            |r| r.get(0),
        )
        .ok();
    let historical_jobs = job_core::list(movie)?;
    let history_hash = format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&historical_jobs)?)
    );
    if previous
        .as_ref()
        .and_then(|s| serde_json::from_str::<Value>(s).ok())
        .is_some_and(|v| v["revision"] == source.revision && v["historyHash"] == history_hash)
    {
        return Ok(());
    }
    let prior: Value = previous
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or(Value::Null);
    let mut target = global.read()?;
    let revision = target.revision;
    let mut assets = HashMap::new();
    let mut workflows = HashMap::new();
    let mut missing = vec![];
    let mut source_assets = source.assets.clone();
    for asset in historical_jobs.iter().flat_map(|j| &j.results) {
        if !source_assets.iter().any(|a| a.id == asset.id) {
            source_assets.push(asset.clone());
        }
    }
    for asset in &source_assets {
        if let Some(existing) = target
            .assets
            .iter()
            .find(|a| a.sha256 == asset.sha256 && a.size == asset.size)
        {
            assets.insert(asset.id.clone(), existing.id.clone());
            continue;
        }
        match asset_core::source(movie.path(), asset, true)
            .and_then(|path| asset_core::import(global.path(), &path))
        {
            Ok(mut imported) => {
                imported.id = if target.assets.iter().any(|a| a.id == asset.id) {
                    project_core::id()
                } else {
                    asset.id.clone()
                };
                imported.name = asset.name.clone();
                imported.archived_at = asset.archived_at.clone();
                assets.insert(asset.id.clone(), imported.id.clone());
                target.assets.push(imported);
            }
            Err(_) => missing.push(asset.id.clone()), // Missing linked sources do not block opening the Movie.
        }
    }
    for workflow in &source.workflows {
        if let Some(existing) = target.workflows.iter().find(|w| {
            (w.id == workflow.id
                || prior["workflowIds"][&workflow.id].as_str() == Some(w.id.as_str()))
                && w.version == workflow.version
                && w.graph == workflow.graph
        }) {
            workflows.insert(workflow.id.clone(), existing.id.clone());
        } else {
            let mut copied = workflow.clone();
            if target.workflows.iter().any(|w| w.id == copied.id) {
                copied.id = project_core::id();
            }
            workflows.insert(workflow.id.clone(), copied.id.clone());
            target.workflows.push(copied);
        }
    }
    // Keep editable drafts, but remove old run linkage. They require explicit scheduling.
    for draft in &source.job_drafts {
        if target.job_drafts.iter().any(|d| d.id == draft.id) {
            continue;
        }
        let mut copied = draft.clone();
        copied.queued_run_id = None;
        copied.queued_job_ids.clear();
        if copied.context.kind == "storyboard" && !copied.frame_id.is_empty() {
            let mut episodes = source.episodes.clone();
            let mut characters = source.characters.clone();
            for episode in &mut episodes {
                for scene in &mut episode.scenes {
                    for shot in &mut scene.shots {
                        for frame in &mut shot.frames {
                            if let Some(id) = frame.asset_id.as_mut().and_then(|id| assets.get(id))
                            {
                                frame.asset_id = Some(id.clone());
                            }
                        }
                    }
                }
            }
            for character in &mut characters {
                for id in &mut character.asset_ids {
                    if let Some(global_id) = assets.get(id) {
                        *id = global_id.clone();
                    }
                }
            }
            copied.context.storyboard = Some(studio_contracts::StoryboardContext {
                movie_id: source.id.clone(),
                movie_name: source.name.clone(),
                positive_prompt: source.positive_prompt.clone(),
                negative_prompt: source.negative_prompt.clone(),
                episodes,
                characters,
            });
        } else {
            copied.context.kind = "standalone".into();
            copied.frame_id.clear();
        }
        for item in &mut copied.items {
            if let Some(id) = workflows.get(&item.workflow_id) {
                item.workflow_id = id.clone();
            }
            for id in item.assets.values_mut() {
                if let Some(global_id) = assets.get(id) {
                    *id = global_id.clone();
                }
            }
        }
        target.job_drafts.push(copied);
    }
    global.save(target, revision)?;
    let existing = job_core::list(global)?;
    for mut job in job_core::list(movie)? {
        if existing.iter().any(|j| j.id == job.id) {
            continue;
        }
        job.snapshot["originMovie"] = json!({"id":source.id,"name":source.name});
        if !job_core::terminal(&job.state) {
            job.state = "unknown".into();
            job.error = Some(
                "Imported history; reconcile the original remote attempt before retrying".into(),
            );
        }
        job.run_id = None;
        if let Some(id) = workflows.get(&job.workflow_id) {
            job.workflow_id = id.clone();
        }
        for asset in &mut job.results {
            if let Some(id) = assets.get(&asset.id) {
                if let Some(global_asset) = global.read()?.assets.into_iter().find(|a| &a.id == id)
                {
                    *asset = global_asset;
                }
            }
        }
        job_core::persist(global, &job)?;
    }
    let journal = json!({"revision":source.revision,"historyHash":history_hash,"assetIds":assets,"workflowIds":workflows,"missingAssets":missing});
    global.connection().execute(
        "INSERT INTO movie_migrations(movie_id,revision,json) VALUES(?1,?2,?3) ON CONFLICT(movie_id) DO UPDATE SET revision=excluded.revision,json=excluded.json",
        [&source.id, &source.revision.to_string(), &journal.to_string()])?;
    Ok(())
}

#[tauri::command]
pub async fn get_workspace(state: S<'_>) -> Reply<Project> {
    state.inner.lock().await.workspace.read().map_err(err)
}
#[tauri::command]
pub async fn save_workspace(
    state: S<'_>,
    project: Project,
    expected_revision: u64,
) -> Reply<Project> {
    if !project.episodes.is_empty() || !project.characters.is_empty() {
        return Err("Movie entities belong to a Movie".into());
    }
    let mut i = state.inner.lock().await;
    let old = i.workspace.read().map_err(err)?;
    if project.assets.len() != old.assets.len()
        || project.assets.iter().any(|a| {
            old.assets
                .iter()
                .find(|x| x.id == a.id)
                .is_none_or(|x| x.source_path != a.source_path)
        })
    {
        return Err("Use Library import and attachment actions".into());
    }
    let mut project = project;
    for canonical in workflow_core::examples::catalogue().map_err(err)? {
        if let Some(w) = project.workflows.iter_mut().find(|w| w.id == canonical.id) {
            let archived = w.wrapper.archived_at.clone();
            w.name = canonical.name;
            w.wrapper = canonical.wrapper;
            w.wrapper.archived_at = archived;
            w.bindings = canonical.bindings;
            w.layout = canonical.layout;
            w.requirements = canonical.requirements;
        }
    }
    let saved = i
        .workspace
        .save_metadata(project, expected_revision)
        .map_err(err)?;
    for w in &saved.workflows {
        i.settings.put_workflow(w).map_err(err)?;
    }
    Ok(saved)
}

#[tauri::command]
pub async fn attach_global_asset(state: S<'_>, asset_id: String) -> Reply<Project> {
    let mut i = state.inner.lock().await;
    let Inner {
        workspace, project, ..
    } = &mut *i;
    attach(
        workspace,
        project.as_mut().ok_or("Open a Movie to attach media")?,
        &asset_id,
    )
    .map_err(err)
}
fn attach(global: &ProjectStore, movie: &mut ProjectStore, asset_id: &str) -> Result<Project> {
    let mut asset = global
        .read()?
        .assets
        .into_iter()
        .find(|a| a.id == asset_id && a.archived_at.is_none())
        .ok_or("Media unavailable")?;
    let path = asset_core::source(global.path(), &asset, true)?;
    let mut p = movie.read()?;
    if p.assets
        .iter()
        .any(|a| a.id == asset.id || a.sha256 == asset.sha256)
    {
        return Ok(p);
    }
    asset.source_path = Some(path.to_string_lossy().into_owned());
    p.assets.push(asset);
    let revision = p.revision;
    movie.save(p, revision)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn attaching_to_two_movies_reuses_bytes_and_collect_is_portable() {
        let dir = tempfile::tempdir().unwrap();
        let mut global = open(dir.path()).unwrap();
        let path = dir.path().join("frame.png");
        std::fs::write(&path, b"global-image-fixture").unwrap();
        let asset = asset_core::import(global.path(), &path).unwrap();
        let mut p = global.read().unwrap();
        let revision = p.revision;
        p.assets.push(asset.clone());
        global.save(p, revision).unwrap();
        for name in ["one", "two"] {
            let mut movie =
                ProjectStore::create(dir.path().join(format!("{name}.mymovie")), name, false)
                    .unwrap();
            let first = attach(&global, &mut movie, &asset.id).unwrap();
            assert_eq!(first.assets.len(), 1);
            assert!(first.assets[0].source_path.is_some());
            assert!(!movie.path().join(&asset.path).exists());
            assert_eq!(
                attach(&global, &mut movie, &asset.id).unwrap().revision,
                first.revision
            );
            let revision = first.revision;
            let collected = asset_core::collect(movie.path(), first).unwrap();
            movie.save(collected, revision).unwrap();
            assert_eq!(
                std::fs::read(movie.path().join(&asset.path)).unwrap(),
                b"global-image-fixture"
            );
        }
        assert_eq!(global.read().unwrap().assets.len(), 1);
    }
    #[test]
    fn migration_retains_receipt_only_media_and_quarantines_new_history() {
        let dir = tempfile::tempdir().unwrap();
        let mut global = open(dir.path()).unwrap();
        let mut movie = ProjectStore::create(dir.path().join("old.mymovie"), "Old", false).unwrap();
        let file = dir.path().join("result.png");
        std::fs::write(&file, b"receipt-only-render").unwrap();
        let asset = asset_core::import(movie.path(), &file).unwrap();
        migrate(&mut global, &movie).unwrap();
        // A provider receipt can arrive without any change to Movie metadata.
        let job: Job = serde_json::from_value(json!({"id":"historical","frameId":"frame","workflowId":"wf","workflowVersion":"v","connectionId":"offline","state":"running","remoteId":"remote","snapshot":{},"results":[asset],"error":null,"createdAt":"now","updatedAt":"now","runId":"old-run"})).unwrap();
        job_core::persist(&movie, &job).unwrap();
        migrate(&mut global, &movie).unwrap();
        let jobs = job_core::list(&global).unwrap();
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].state, "unknown");
        assert!(jobs[0].run_id.is_none());
        assert_eq!(jobs[0].snapshot["originMovie"]["name"], "Old");
        assert_eq!(
            std::fs::read(asset_core::source(global.path(), &jobs[0].results[0], true).unwrap())
                .unwrap(),
            b"receipt-only-render"
        );
        let revision = global.read().unwrap().revision;
        migrate(&mut global, &movie).unwrap();
        assert_eq!(global.read().unwrap().revision, revision);
        assert_eq!(job_core::list(&global).unwrap().len(), 1);
        // A colliding workflow identity must remain stably remapped across revisions.
        let mut local =
            workflow_core::import("old", json!({"1":{"class_type":"EmptyImage","inputs":{}}}))
                .unwrap();
        let mut conflicting = workflow_core::import(
            "global",
            json!({"2":{"class_type":"EmptyImage","inputs":{}}}),
        )
        .unwrap();
        conflicting.id = local.id.clone();
        let mut g = global.read().unwrap();
        let r = g.revision;
        g.workflows.push(conflicting);
        global.save(g, r).unwrap();
        let mut m = movie.read().unwrap();
        let r = m.revision;
        m.workflows.push(local.clone());
        movie.save(m, r).unwrap();
        migrate(&mut global, &movie).unwrap();
        local = global
            .read()
            .unwrap()
            .workflows
            .into_iter()
            .find(|w| w.name == "old")
            .unwrap();
        let mut m = movie.read().unwrap();
        let r = m.revision;
        m.name = "Renamed".into();
        movie.save(m, r).unwrap();
        migrate(&mut global, &movie).unwrap();
        assert_eq!(
            global
                .read()
                .unwrap()
                .workflows
                .iter()
                .filter(|w| w.name == "old")
                .count(),
            1
        );
        assert_ne!(local.id, movie.read().unwrap().workflows[0].id);
    }
    #[test]
    fn zero_movies_persist_and_migrate_without_replay() {
        let dir = tempfile::tempdir().unwrap();
        let mut global = open(dir.path()).unwrap();
        assert!(!global.path().join("manifest.json").exists());
        assert!(global.read().unwrap().episodes.is_empty());
        let movie = ProjectStore::create(dir.path().join("test.mymovie"), "Movie", false).unwrap();
        let id = global.read().unwrap().id;
        migrate(&mut global, &movie).unwrap();
        let revision = global.read().unwrap().revision;
        migrate(&mut global, &movie).unwrap();
        assert_eq!(global.read().unwrap().revision, revision);
        drop(movie);
        drop(global);
        assert_eq!(open(dir.path()).unwrap().read().unwrap().id, id);
    }
}
