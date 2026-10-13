use async_trait::async_trait;
use project_core::{ProjectStore, Result, atomic_json, confined, id};
use serde_json::{Value, json};
use studio_contracts::*;
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
    async fn submit(&self, attempt: &str, graph: &Value) -> Result<String>;
    async fn status(&self, remote: &str) -> Result<RemoteStatus>;
    async fn cancel(&self, remote: &str) -> Result<()>;
    async fn collect(&self, output: &Value) -> Result<(String, Vec<u8>)>;
    async fn stage_asset(&self, name: &str, bytes: Vec<u8>) -> Result<String>;
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
        if matches!(j.state.as_str(), "ready" | "submitted") && j.remote_id.is_none() {
            transition(&mut j, "unknown")?;
            j.error = Some(
                "Submission outcome unknown after restart. Reconcile before any new attempt."
                    .into(),
            );
            persist(store, &j)?;
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
        };
        let w = Workflow {
            id: id(),
            name: "Safe".into(),
            version: "a".repeat(64),
            graph: json!({}),
            bindings: vec![],
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
