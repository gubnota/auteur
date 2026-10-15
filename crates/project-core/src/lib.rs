use fs2::FileExt;
use rusqlite::{Connection, params};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Component, Path, PathBuf},
};
use studio_contracts::*;
use uuid::Uuid;
pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;
pub struct ProjectStore {
    root: PathBuf,
    db: Connection,
    _lock: File,
}
pub fn id() -> String {
    Uuid::new_v4().to_string()
}
pub fn safe_relative(path: &str) -> bool {
    !path.is_empty()
        && Path::new(path)
            .components()
            .all(|c| matches!(c, Component::Normal(_)))
}
pub fn confined(root: &Path, relative: &str) -> Result<PathBuf> {
    if !safe_relative(relative) {
        return Err("Unsafe document-relative path".into());
    }
    let root = fs::canonicalize(root)?;
    let mut path = root.clone();
    for part in Path::new(relative).components() {
        path.push(part.as_os_str());
        match fs::symlink_metadata(&path) {
            Ok(m) if m.file_type().is_symlink() => {
                return Err("Symlink inside document package".into());
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
        }
    }
    Ok(path)
}
pub fn atomic_json(path: &Path, value: &impl serde::Serialize) -> Result<()> {
    let parent = path.parent().ok_or("Missing parent")?;
    fs::create_dir_all(parent)?;
    let tmp = parent.join(format!(".{}.partial", id()));
    let mut f = OpenOptions::new().write(true).create_new(true).open(&tmp)?;
    f.write_all(&serde_json::to_vec_pretty(value)?)?;
    f.sync_all()?;
    fs::rename(tmp, path)?;
    File::open(parent)?.sync_all()?;
    Ok(())
}
impl ProjectStore {
    pub fn create(path: impl AsRef<Path>, name: &str, demo: bool) -> Result<Self> {
        let path = path.as_ref();
        if path.extension().and_then(|s| s.to_str()) != Some("mymovie") {
            return Err("Choose a .mymovie document package".into());
        }
        if name.trim().is_empty() {
            return Err("Movie name is required".into());
        }
        fs::create_dir(path)?;
        let store = Self::open_inner(path)?;
        let mut project = Project {
            id: id(),
            name: name.trim().into(),
            revision: 0,
            ratio: "16:9".into(),
            positive_prompt: "Cinematic light, coherent characters, natural detail".into(),
            negative_prompt: "Artifacts, text, watermark".into(),
            episodes: vec![Episode {
                id: id(),
                name: "Pilot".into(),
                scenes: vec![],
            }],
            characters: vec![],
            assets: vec![],
            workflows: vec![],
            job_drafts: vec![],
        };
        if demo {
            project.characters = ["Mira", "Old Sal", "The Keeper"]
                .into_iter()
                .map(|name| Character {
                    id: id(),
                    name: name.into(),
                    description: format!(
                        "Sample character: {name}. Add appearance and continuity notes."
                    ),
                    asset_ids: vec![],
                    revision: 1,
                })
                .collect();
            project.episodes[0].scenes.push(Scene {
                id: id(),
                name: "The lighthouse".into(),
                positive_prompt: None,
                negative_prompt: None,
                character_ids: vec![],
                shots: vec![Shot {
                    id: id(),
                    name: "Arrival".into(),
                    frames: (1..=4)
                        .map(|n| Frame {
                            id: id(),
                            name: format!("Frame {n:02}"),
                            asset_id: None,
                            positive_prompt: format!("Mira approaches the lighthouse, shot {n}"),
                            negative_prompt: String::new(),
                            include_common: true,
                            ratio: None,
                            character_ids: vec![project.characters[0].id.clone()],
                            comments: vec![Comment {
                                id: id(),
                                text:
                                    "Sample: refine composition and continuity before generation."
                                        .into(),
                                created_at: chrono::Utc::now().to_rfc3339(),
                            }],
                        })
                        .collect(),
                }],
            });
            project.episodes.push(Episode {
                id: id(),
                name: "The Storm".into(),
                scenes: vec![],
            });
        }
        validate(&project)?;
        store.db.execute(
            "INSERT INTO project VALUES(1,0,?1)",
            [serde_json::to_string(&project)?],
        )?;
        store.project(&project)?;
        Ok(store)
    }
    fn open_inner(path: &Path) -> Result<Self> {
        if fs::symlink_metadata(path)?.file_type().is_symlink() {
            return Err("Document package cannot be a symlink".into());
        }
        let root = fs::canonicalize(path)?;
        for f in [
            "project.sqlite",
            "project.sqlite-wal",
            "project.sqlite-shm",
            ".lock",
        ] {
            if fs::symlink_metadata(root.join(f)).is_ok_and(|m| m.file_type().is_symlink()) {
                return Err("Unsafe document path".into());
            }
        }
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(root.join(".lock"))?;
        lock.try_lock_exclusive()
            .map_err(|_| "Project is already open in another process")?;
        for f in [
            "project.sqlite",
            "project.sqlite-wal",
            "project.sqlite-shm",
            ".lock",
        ] {
            if fs::symlink_metadata(root.join(f)).is_ok_and(|m| m.file_type().is_symlink()) {
                return Err("Unsafe document path".into());
            }
        }
        let db = Connection::open(root.join("project.sqlite"))?;
        db.pragma_update(None, "journal_mode", "WAL")?;
        let version: i64 = db.pragma_query_value(None, "user_version", |r| r.get(0))?;
        if version > 5 {
            return Err("Project requires a newer MyMovie Studio".into());
        }
        if version == 0 {
            db.execute_batch(include_str!("../migrations/0001_initial.sql"))?;
        }
        if (1..5).contains(&version) {
            // SQLite creates a consistent backup including WAL data before migration.
            let backup = confined(
                &root,
                &format!("backups/pre-jobs-v{version}-{}.sqlite", id()),
            )?;
            fs::create_dir_all(backup.parent().unwrap())?;
            db.execute("VACUUM INTO ?1", [backup.to_string_lossy().as_ref()])?;
            atomic_json(
                &confined(&root, "backups/pre-jobs-manifest.json")?,
                &serde_json::from_slice::<serde_json::Value>(&fs::read(
                    root.join("manifest.json"),
                )?)?,
            )?;
        }
        if version < 2 {
            db.execute_batch(include_str!("../migrations/0002_job_runs.sql"))?;
        }
        if version < 3 {
            db.execute_batch(include_str!("../migrations/0003_generate.sql"))?;
        }
        if version < 4 {
            db.execute_batch(include_str!("../migrations/0004_workflow_catalogue.sql"))?;
        }
        if version < 5 {
            db.execute_batch(include_str!("../migrations/0005_workflow_wrappers.sql"))?;
        }
        Ok(Self {
            root,
            db,
            _lock: lock,
        })
    }
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        if !path.as_ref().join("manifest.json").is_file()
            || !path.as_ref().join("project.sqlite").is_file()
        {
            return Err("Not a MyMovie document".into());
        }
        let store = Self::open_inner(path.as_ref())?;
        let p = store.read()?;
        validate(&p)?;
        store.project(&p)?;
        Ok(store)
    }
    pub fn path(&self) -> &Path {
        &self.root
    }
    pub fn connection(&self) -> &Connection {
        &self.db
    }
    pub fn read(&self) -> Result<Project> {
        let json: String = self
            .db
            .query_row("SELECT json FROM project WHERE id=1", [], |r| r.get(0))?;
        Ok(serde_json::from_str(&json)?)
    }
    /// Remove archived catalogue entries only. Immutable graph files, revision
    /// history and frozen job receipts remain available for provenance.
    pub fn clear_workflow_trash(&mut self) -> Result<Project> {
        let mut project = self.read()?;
        let revision = project.revision;
        project
            .workflows
            .retain(|w| w.wrapper.archived_at.is_none());
        self.save_inner(project, revision, true)
    }
    pub fn save(&mut self, project: Project, expected_revision: u64) -> Result<Project> {
        self.save_inner(project, expected_revision, false)
    }
    /// UI saves edit metadata; immutable source graphs and compiled profiles stay native-owned.
    /// JavaScript cannot round-trip all JSON numbers without changing their representation.
    pub fn save_metadata(
        &mut self,
        mut project: Project,
        expected_revision: u64,
    ) -> Result<Project> {
        let old = self.read()?;
        if project.workflows.len() != old.workflows.len() {
            return Err("Use import commands to add or remove workflow versions".into());
        }
        for w in &mut project.workflows {
            let original = old
                .workflows
                .iter()
                .find(|x| x.id == w.id && x.version == w.version)
                .ok_or("Imported workflow identity is immutable")?;
            w.graph = original.graph.clone();
            w.editor_graph = original.editor_graph.clone();
            w.editor_hash = original.editor_hash.clone();
            w.profiles = original.profiles.clone();
        }
        self.save(project, expected_revision)
    }
    fn save_inner(
        &mut self,
        mut project: Project,
        expected_revision: u64,
        clear_trash: bool,
    ) -> Result<Project> {
        validate(&project)?;
        let tx = self.db.transaction()?;
        let (rev, json): (i64, String) =
            tx.query_row("SELECT revision,json FROM project WHERE id=1", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })?;
        let old: Project = serde_json::from_str(&json)?;
        if rev < 0 || rev as u64 != expected_revision || project.id != old.id {
            return Err("Revision conflict: reload the project before saving".into());
        }
        // Originals and workflow versions are immutable once imported.
        for a in &old.assets {
            if !project.assets.iter().any(|x| {
                x.id == a.id
                    && x.sha256 == a.sha256
                    && x.path == a.path
                    && x.size == a.size
                    && x.kind == a.kind
            }) {
                return Err("Imported originals are immutable".into());
            }
        }
        for w in &old.workflows {
            if clear_trash
                && w.wrapper.archived_at.is_some()
                && !project.workflows.iter().any(|x| x.id == w.id)
            {
                continue;
            }
            if !project.workflows.iter().any(|x| {
                x.id == w.id
                    && x.version == w.version
                    && x.graph == w.graph
                    && (w.editor_graph.is_none()
                        || (x.editor_graph == w.editor_graph && x.editor_hash == w.editor_hash))
            }) {
                return Err("Imported workflow versions are immutable".into());
            }
        }
        project.revision = (rev + 1) as u64;
        tx.execute(
            "INSERT OR IGNORE INTO history VALUES(?1,?2)",
            params![rev, json],
        )?;
        tx.execute(
            "UPDATE project SET revision=?1,json=?2 WHERE id=1",
            params![project.revision as i64, serde_json::to_string(&project)?],
        )?;
        tx.execute("INSERT OR REPLACE INTO projections VALUES(1,1)", [])?;
        tx.commit()?;
        self.project(&project)?;
        Ok(project)
    }
    fn project(&self, p: &Project) -> Result<()> {
        // Journal remains pending on failure; opening repairs from authoritative SQLite.
        atomic_json(
            &confined(&self.root, "manifest.json")?,
            &serde_json::json!({"schemaVersion":5,"id":p.id,"name":p.name,"revision":p.revision,"application":"MyMovie Studio"}),
        )?;
        for ep in &p.episodes {
            for scene in &ep.scenes {
                atomic_json(
                    &confined(
                        &self.root,
                        &format!(
                            "episodes/{}/scenes/{}/keyframes/board.json",
                            ep.id, scene.id
                        ),
                    )?,
                    &serde_json::json!({"revision":p.revision,"scene":scene}),
                )?;
            }
        }
        for ch in &p.characters {
            atomic_json(
                &confined(
                    &self.root,
                    &format!("library/characters/{}/character.json", ch.id),
                )?,
                ch,
            )?;
        }
        for w in &p.workflows {
            w.wrapper.validate()?;
            atomic_json(
                &confined(
                    &self.root,
                    &format!("workflows/{}/{}/definition.json", w.id, w.version),
                )?,
                w,
            )?;
        }
        atomic_json(&confined(&self.root, "jobs/drafts.json")?, &p.job_drafts)?;
        self.db
            .execute("UPDATE projections SET pending=0 WHERE id=1", [])?;
        Ok(())
    }
    pub fn media_path(&self, relative: &str) -> Result<PathBuf> {
        if !safe_relative(relative) {
            return Err("Unsafe media path".into());
        }
        let candidate = confined(&self.root, relative)?;
        let canonical = fs::canonicalize(candidate)?;
        if !canonical.starts_with(&self.root) {
            return Err("Media escapes document package".into());
        }
        Ok(canonical)
    }
}
impl Drop for ProjectStore {
    fn drop(&mut self) {
        let _ = self.db.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)");
    }
}
pub fn valid_ratio(s: &str) -> bool {
    s.split_once(':').is_some_and(|(a, b)| {
        a.parse::<f64>().is_ok_and(|v| v.is_finite() && v > 0.)
            && b.parse::<f64>().is_ok_and(|v| v.is_finite() && v > 0.)
    })
}
pub fn validate(p: &Project) -> Result<()> {
    if p.name.trim().is_empty() || !valid_ratio(&p.ratio) {
        return Err("Invalid movie name or aspect ratio".into());
    }
    let mut ids = HashSet::new();
    let mut check = |id: &str| -> Result<()> {
        Uuid::parse_str(id)?;
        if !ids.insert(id.to_owned()) {
            return Err("Duplicate entity identity".into());
        }
        Ok(())
    };
    check(&p.id)?;
    for draft in &p.job_drafts {
        check(&draft.id)?;
        if draft.name.trim().is_empty() {
            return Err("Job draft name required".into());
        }
        if !["standalone", "storyboard"].contains(&draft.context.kind.as_str())
            || (draft.context.kind == "standalone" && !draft.frame_id.is_empty())
        {
            return Err("Invalid draft generation context".into());
        }
        for item in &draft.items {
            check(&item.id)?;
        }
    }
    for a in &p.assets {
        check(&a.id)?;
        if a.archived_at
            .as_ref()
            .is_some_and(|s| chrono::DateTime::parse_from_rfc3339(s).is_err())
        {
            return Err("Invalid asset Trash timestamp".into());
        }
        if a.source_path
            .as_ref()
            .is_some_and(|s| !Path::new(s).is_absolute())
        {
            return Err("Linked asset needs an absolute source path".into());
        }
        if !safe_relative(&a.path)
            || a.sha256.len() != 64
            || !a.sha256.bytes().all(|b| b.is_ascii_hexdigit())
        {
            return Err("Invalid asset path/hash".into());
        }
    }
    for w in &p.workflows {
        w.wrapper.validate()?;
        check(&w.id)?;
        if ![
            "unspecified",
            "universal",
            "apple-silicon",
            "cuda",
            "rocm",
            "cpu",
        ]
        .contains(&w.requirements.compatibility.as_str())
        {
            return Err("Unknown workflow compatibility".into());
        }
        let mut destinations = std::collections::HashSet::new();
        for artifact in &w.requirements.artifacts {
            artifact.validate()?;
            if !destinations.insert((&artifact.kind, &artifact.category, &artifact.target)) {
                return Err("Duplicate workflow dependency destination".into());
            }
        }
        if w.version.len() != 64 || !w.version.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err("Invalid workflow hash".into());
        }
    }
    for c in &p.characters {
        check(&c.id)?;
        for a in &c.asset_ids {
            if !p.assets.iter().any(|x| &x.id == a) {
                return Err("Unknown character reference image".into());
            }
        }
    }
    for e in &p.episodes {
        check(&e.id)?;
        if e.name.trim().is_empty() {
            return Err("Episode name required".into());
        }
        for s in &e.scenes {
            check(&s.id)?;
            for c in &s.character_ids {
                if !p.characters.iter().any(|ch| &ch.id == c) {
                    return Err("Unknown scene character".into());
                }
            }
            for shot in &s.shots {
                check(&shot.id)?;
                for f in &shot.frames {
                    check(&f.id)?;
                    if f.ratio.as_ref().is_some_and(|r| !valid_ratio(r)) {
                        return Err("Invalid frame ratio".into());
                    }
                    if f.asset_id
                        .as_ref()
                        .is_some_and(|a| !p.assets.iter().any(|x| &x.id == a))
                    {
                        return Err("Unknown frame asset".into());
                    }
                    for c in &f.character_ids {
                        if !p.characters.iter().any(|x| &x.id == c) {
                            return Err("Unknown frame character".into());
                        }
                    }
                    for c in &f.comments {
                        check(&c.id)?;
                    }
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn metadata_save_keeps_exact_graphs_while_allowing_names_and_board_edits() {
        let tmp = tempfile::tempdir().unwrap();
        let mut store =
            ProjectStore::create(tmp.path().join("film.mymovie"), "Film", true).unwrap();
        let mut p = store.read().unwrap();
        let w: Workflow = serde_json::from_str(&format!(r#"{{"id":"00000000-0000-4000-8000-000000000001","name":"Original","version":"{}","graph":{{"1":{{"inputs":{{"scale":1.0,"seed":9007199254740993}},"class_type":"Test"}}}},"editorGraph":{{"nodes":[{{"widgets_values":[1.0]}}]}},"editorHash":"{}","bindings":[]}}"#, "a".repeat(64), "b".repeat(64))).unwrap();
        p.workflows.push(w.clone());
        let mut p = store.save(p, 0).unwrap();
        p.workflows[0].graph["1"]["inputs"]["scale"] = serde_json::json!(1);
        p.workflows[0].graph["1"]["inputs"]["seed"] = serde_json::json!(9007199254740992_u64);
        p.workflows[0].name = "Renamed wrapper".into();
        p.name = "Renamed movie".into();
        p.characters[0].name = "Renamed character".into();
        p.episodes[0].scenes[0].shots[0].frames[0].name = "Renamed frame".into();
        assert!(store.save(p.clone(), p.revision).is_err());
        let saved = store.save_metadata(p.clone(), p.revision).unwrap();
        assert_eq!(saved.workflows[0].graph, w.graph);
        assert_eq!(saved.workflows[0].editor_graph, w.editor_graph);
        assert_eq!(saved.workflows[0].name, "Renamed wrapper");
        assert_eq!(saved.characters[0].name, "Renamed character");
        assert_eq!(
            saved.episodes[0].scenes[0].shots[0].frames[0].name,
            "Renamed frame"
        );
        assert!(store.save_metadata(p, 1).is_err());
        let mut wrong_version = saved.clone();
        wrong_version.workflows[0].version = "c".repeat(64);
        assert!(store.save_metadata(wrong_version, saved.revision).is_err());
        drop(store);
        assert_eq!(
            ProjectStore::open(tmp.path().join("film.mymovie"))
                .unwrap()
                .read()
                .unwrap()
                .workflows[0]
                .graph,
            w.graph
        );
    }
    #[test]
    fn clear_workflow_trash_preserves_active_graphs_and_history() {
        let tmp = tempfile::tempdir().unwrap();
        let mut store =
            ProjectStore::create(tmp.path().join("film.mymovie"), "Film", false).unwrap();
        let mut p = store.read().unwrap();
        let workflow = |name: &str, archived: bool| -> Workflow {
            serde_json::from_value(serde_json::json!({
                "id": id(), "name": name, "version": "a".repeat(64), "graph": {},
                "bindings": [], "wrapper": {"archivedAt": if archived { Some("123") } else { None }}
            }))
            .unwrap()
        };
        p.workflows = vec![workflow("Active", false), workflow("Trashed", true)];
        let p = store.save(p, 0).unwrap();
        let trashed = &p.workflows[1];
        let original = store.path().join(format!(
            "workflows/{}/{}/definition.json",
            trashed.id, trashed.version
        ));
        let mut invalid = p.clone();
        invalid.workflows.clear();
        assert!(store.save(invalid, p.revision).is_err());
        let cleared = store.clear_workflow_trash().unwrap();
        assert_eq!(cleared.workflows.len(), 1);
        assert_eq!(cleared.workflows[0].id, p.workflows[0].id);
        assert!(original.is_file());
        let history: String = store
            .connection()
            .query_row(
                "SELECT json FROM history WHERE revision=?1",
                [p.revision as i64],
                |r| r.get(0),
            )
            .unwrap();
        assert!(history.contains(&trashed.id));
        drop(store);
        let reopened = ProjectStore::open(tmp.path().join("film.mymovie")).unwrap();
        assert_eq!(reopened.read().unwrap().workflows.len(), 1);
    }
    #[test]
    fn portable_revisioned_document_recovers_projection_and_locks() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("film.mymovie");
        let mut store = ProjectStore::create(&path, "Film", true).unwrap();
        assert!(ProjectStore::open(&path).is_err());
        let mut p = store.read().unwrap();
        let revision = p.revision;
        p.name = "Renamed Film".into();
        p.episodes[0].scenes[0].shots[0].frames.reverse();
        let first = p.episodes[0].scenes[0].shots[0].frames[0].id.clone();
        p = store.save(p, revision).unwrap();
        assert!(store.save(p.clone(), revision).is_err());
        let revision = p.revision;
        drop(store);
        fs::write(path.join("manifest.json"), "interrupted projection").unwrap();
        let moved = tmp.path().join("relocated.mymovie");
        fs::rename(path, &moved).unwrap();
        let reopened = ProjectStore::open(&moved).unwrap();
        let restored = reopened.read().unwrap();
        assert_eq!(restored.revision, revision);
        assert_eq!(restored.name, "Renamed Film");
        assert_eq!(restored.episodes[0].scenes[0].shots[0].frames[0].id, first);
        assert!(
            serde_json::from_slice::<serde_json::Value>(
                &fs::read(moved.join("manifest.json")).unwrap()
            )
            .is_ok()
        );
    }
    #[test]
    fn projection_and_media_paths_reject_traversal_and_symlinks() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(confined(tmp.path(), "../outside").is_err());
        assert!(confined(tmp.path(), "/tmp/outside").is_err());
        #[cfg(unix)]
        {
            let other = tempfile::tempdir().unwrap();
            std::os::unix::fs::symlink(other.path(), tmp.path().join("media")).unwrap();
            assert!(confined(tmp.path(), "media/originals/image.png").is_err());
        }
    }
}

#[cfg(test)]
mod jobs_migration_tests {
    use super::*;
    #[test]
    fn v1_upgrade_preserves_revision_jobs_and_creates_a_restorable_backup() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("old.mymovie");
        let mut store = ProjectStore::create(&path, "Legacy film", true).unwrap();
        let mut p = store.read().unwrap();
        p.name = "Saved revision".into();
        let p = store.save(p, 0).unwrap();
        let mut legacy = serde_json::to_value(&p).unwrap();
        legacy.as_object_mut().unwrap().remove("jobDrafts");
        store
            .db
            .execute("UPDATE project SET json=?1", [legacy.to_string()])
            .unwrap();
        store
            .db
            .execute(
                "INSERT INTO jobs VALUES('legacy-attempt',?1)",
                [r#"{"state":"unknown","remoteId":null}"#],
            )
            .unwrap();
        store
            .db
            .execute_batch("DROP TABLE job_runs; PRAGMA user_version=1;")
            .unwrap();
        atomic_json(
            &path.join("manifest.json"),
            &serde_json::json!({"schemaVersion":1}),
        )
        .unwrap();
        drop(store);
        let upgraded = ProjectStore::open(&path).unwrap();
        assert_eq!(upgraded.read().unwrap().name, "Saved revision");
        assert_eq!(upgraded.read().unwrap().revision, p.revision);
        assert!(upgraded.read().unwrap().job_drafts.is_empty());
        assert_eq!(
            upgraded
                .db
                .query_row("SELECT count(*) FROM jobs", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            upgraded
                .db
                .pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
                .unwrap(),
            5
        );
        let backups = || {
            fs::read_dir(path.join("backups"))
                .unwrap()
                .filter_map(|e| {
                    let p = e.unwrap().path();
                    (p.extension().and_then(|s| s.to_str()) == Some("sqlite")).then_some(p)
                })
                .collect::<Vec<_>>()
        };
        assert_eq!(backups().len(), 1);
        let backup = Connection::open(&backups()[0]).unwrap();
        assert_eq!(
            backup
                .pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            backup
                .query_row("SELECT revision FROM project", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            p.revision as i64
        );
        assert_eq!(
            backup
                .query_row("SELECT count(*) FROM jobs", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert!(path.join("backups/pre-jobs-manifest.json").exists());
        drop(upgraded);
        ProjectStore::open(&path).unwrap();
        assert_eq!(backups().len(), 1);
    }
    #[test]
    fn backup_failure_leaves_version_one_untouched() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("old.mymovie");
        let store = ProjectStore::create(&path, "Legacy", false).unwrap();
        store
            .db
            .execute_batch("DROP TABLE job_runs; PRAGMA user_version=1;")
            .unwrap();
        drop(store);
        fs::write(path.join("backups"), "cannot create a directory here").unwrap();
        assert!(ProjectStore::open(&path).is_err());
        let db = Connection::open(path.join("project.sqlite")).unwrap();
        assert_eq!(
            db.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert!(db.prepare("SELECT * FROM job_runs").is_err());
    }
}
