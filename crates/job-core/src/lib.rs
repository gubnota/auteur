use async_trait::async_trait;
use project_core::{ProjectStore, Result, atomic_json, confined, id};
use serde_json::{Value, json};
use studio_contracts::*;
pub mod runs;
/// The provider explicitly refused creation; unlike transport failure this frees admission.
#[derive(Debug)]
pub struct SubmissionRejected(pub String);
impl std::fmt::Display for SubmissionRejected {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}
impl std::error::Error for SubmissionRejected {}
#[derive(Debug, Clone)]
pub struct RemoteStatus {
    pub state: String,
    pub outputs: Vec<Value>,
    pub error: Option<String>,
}
#[async_trait]
pub trait ExecutionBackend: Send + Sync {
    async fn health(&self) -> Result<Value>;
    async fn validate_job(&self, graph: &Value) -> Result<()>;
    async fn validate_media(&self, _graph: &Value, _bindings: &[Binding]) -> Result<()> {
        Ok(())
    }
    async fn validate_compatibility(&self, compatibility: &str) -> Result<()> {
        if matches!(compatibility, "universal" | "unspecified") {
            return Ok(());
        }
        Err(
            "This provider does not report hardware compatibility; choose a verified ComfyUI node"
                .into(),
        )
    }
    async fn submit(&self, attempt: &str, graph: &Value) -> Result<String>;
    async fn status(&self, remote: &str) -> Result<RemoteStatus>;
    async fn cancel(&self, remote: &str) -> Result<()>;
    async fn collect(&self, output: &Value) -> Result<(String, Vec<u8>)>;
    async fn stage_asset(&self, asset: &studio_contracts::Asset, bytes: Vec<u8>) -> Result<String>;
}
pub fn list(store: &ProjectStore) -> Result<Vec<Job>> {
    let mut stmt = store
        .connection()
        .prepare("SELECT json FROM jobs ORDER BY rowid DESC")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    rows.map(|r| Ok(serde_json::from_str(&r?)?)).collect()
}
pub fn persist(store: &ProjectStore, job: &Job) -> Result<()> {
    store.connection().execute(
        "INSERT INTO jobs(id,json) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET json=excluded.json",
        rusqlite::params![job.id, serde_json::to_string(job)?],
    )?;
    atomic_json(
        &confined(store.path(), &format!("jobs/receipts/{}.json", job.id))?,
        job,
    )?;
    Ok(())
}
pub fn prepare(
    store: &ProjectStore,
    frame: &Frame,
    workflow: &Workflow,
    connection: &Connection,
    graph: Value,
    semantic: Value,
) -> Result<Job> {
    let jobs = list(store)?;
    if jobs
        .iter()
        .filter(|j| j.connection_id == connection.id && !terminal(&j.state))
        .count()
        >= connection.concurrency.max(1) as usize
    {
        return Err("Connection admission limit reached; wait for active jobs or reconcile unknown submissions".into());
    }
    let now = chrono::Utc::now().to_rfc3339();
    let job = Job {
        id: id(),
        frame_id: frame.id.clone(),
        workflow_id: workflow.id.clone(),
        workflow_version: workflow.version.clone(),
        connection_id: connection.id.clone(),
        state: "ready".into(),
        remote_id: None,
        snapshot: json!({"graph":graph,"semantic":semantic,"frame":frame,"bindings":workflow.bindings,"connectionKind":connection.kind,"deploymentId":connection.deployment_id,"apiFamily":connection.api_family}),
        results: vec![],
        error: None,
        created_at: now.clone(),
        updated_at: now,
        run_id: None,
        item_id: None,
    };
    atomic_json(
        &confined(store.path(), &format!("jobs/submissions/{}.json", job.id))?,
        &job,
    )?;
    persist(store, &job)?;
    Ok(job)
}
pub fn terminal(state: &str) -> bool {
    matches!(state, "completed" | "failed" | "canceled")
}
pub fn transition(job: &mut Job, state: &str) -> Result<()> {
    if terminal(&job.state) && job.state != state {
        return Err("Terminal attempt cannot be resubmitted".into());
    }
    if ![
        "draft",
        "validated",
        "staging",
        "ready",
        "submitted",
        "queued",
        "running",
        "collecting",
        "completed",
        "failed",
        "cancel_requested",
        "canceled",
        "unknown",
        "paused",
        "waiting",
    ]
    .contains(&state)
    {
        return Err("Unknown job state".into());
    }
    job.state = state.into();
    job.updated_at = chrono::Utc::now().to_rfc3339();
    Ok(())
}
pub fn recover(store: &ProjectStore) -> Result<()> {
    for mut j in list(store)? {
        if matches!(j.state.as_str(), "waiting" | "staging") {
            transition(&mut j, "paused")?;
            persist(store, &j)?;
        }
        if matches!(j.state.as_str(), "ready" | "submitted") && j.remote_id.is_none() {
            transition(&mut j, "unknown")?;
            j.error = Some(
                "Submission outcome unknown after restart. Reconcile before any new attempt."
                    .into(),
            );
            persist(store, &j)?;
        }
    }
    for mut run in runs::list(store)? {
        if run.state == "active" {
            run.state = "paused".into();
            runs::persist(store, &run)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn crash_recovery_blocks_blind_retry_and_keeps_snapshot() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("recovery.mymovie");
        let s = ProjectStore::create(&path, "Recovery", true).unwrap();
        let p = s.read().unwrap();
        let frame = &p.episodes[0].scenes[0].shots[0].frames[0];
        let c = studio_contracts::Connection {
            id: id(),
            name: "CPU".into(),
            kind: "comfyui".into(),
            url: "http://127.0.0.1:8188".into(),
            credential_ref: None,
            deployment_id: None,
            api_family: None,
            concurrency: 1,
            hosting: None,
        };
        let w = Workflow {
            id: id(),
            name: "Safe".into(),
            version: "a".repeat(64),
            graph: json!({}),
            bindings: vec![],
            media_kind: "other".into(),
            editor_graph: None,
            editor_hash: None,
            deployments: vec![],
            requirements: studio_contracts::WorkflowRequirements {
                compatibility: "unspecified".into(),
                artifacts: vec![],
            },
        };
        let graph = json!({"frozen":"graph"});
        let j = prepare(&s, frame, &w, &c, graph.clone(), json!({"seed":17})).unwrap();
        drop(s);
        let s = ProjectStore::open(path).unwrap();
        recover(&s).unwrap();
        let jobs = list(&s).unwrap();
        assert_eq!(jobs[0].id, j.id);
        assert_eq!(jobs[0].state, "unknown");
        assert_eq!(jobs[0].snapshot["graph"], graph);
        assert!(prepare(&s, frame, &w, &c, json!({}), json!({})).is_err());
        let mut recovered = jobs[0].clone();
        transition(&mut recovered, "completed").unwrap();
        assert!(transition(&mut recovered, "ready").is_err());
    }
}

/// Immutable provider filenames retain only a supported extension, avoiding path injection.
pub fn staging_name(asset: &Asset) -> Result<String> {
    if asset.sha256.len() != 64 || !asset.sha256.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err("Invalid media hash".into());
    }
    let ext = std::path::Path::new(&asset.name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let allowed: &[&str] = match asset.kind.as_str() {
        "image" => &["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff"],
        "video" => &["mp4", "mov", "webm", "mkv", "avi"],
        "audio" => &["wav", "mp3", "flac", "ogg", "m4a", "aac"],
        _ => return Err("Unsupported media kind".into()),
    };
    if !allowed.contains(&ext.as_str()) {
        return Err("Unsupported media extension; convert the source to a supported format".into());
    }
    Ok(format!("mymovie-{}.{}", asset.sha256, ext))
}

/// Device labels are declarations from ComfyUI, not assumptions from a hosting name.
pub fn compatible(compatibility: &str, devices: &Value) -> bool {
    if matches!(compatibility, "universal" | "unspecified") {
        return true;
    }
    devices.as_array().is_some_and(|rows| {
        rows.iter().any(|d| match compatibility {
            "apple-silicon" => d["type"] == "mps",
            "cuda" => {
                d["type"] == "cuda"
                    && !d["name"]
                        .as_str()
                        .unwrap_or("")
                        .to_lowercase()
                        .contains("hip")
            }
            "rocm" => {
                d["type"] == "hip"
                    || d["name"]
                        .as_str()
                        .unwrap_or("")
                        .to_lowercase()
                        .contains("hip")
            }
            "cpu" => d["type"] == "cpu",
            _ => false,
        })
    })
}
