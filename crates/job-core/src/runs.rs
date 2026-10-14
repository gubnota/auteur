//! Durable independent batches. Provider I/O belongs to the desktop service.
use crate::{list as jobs, terminal, transition};
use project_core::{ProjectStore, Result, atomic_json, confined};
use std::collections::HashMap;
use studio_contracts::{Connection, Job, JobRun};

pub fn lane(c: &Connection) -> Result<String> {
    let mut url = reqwest::Url::parse(&c.url)?;
    url.set_fragment(None);
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Credentials must not be embedded in endpoint URLs".into());
    }
    let endpoint = url.as_str().trim_end_matches('/').to_string();
    Ok(match c.kind.as_str() {
        "comfyui" => format!("comfyui:{endpoint}"),
        "relay" => format!(
            "relay:{endpoint}:{}",
            c.deployment_id.as_deref().unwrap_or("")
        ),
        _ => return Err("Unsupported execution connection".into()),
    })
}
pub fn list(store: &ProjectStore) -> Result<Vec<JobRun>> {
    let mut stmt = store
        .connection()
        .prepare("SELECT json FROM job_runs ORDER BY rowid DESC")?;
    stmt.query_map([], |r| r.get::<_, String>(0))?
        .map(|r| Ok(serde_json::from_str(&r?)?))
        .collect()
}
pub fn persist(store: &ProjectStore, run: &JobRun) -> Result<()> {
    store.connection().execute("INSERT INTO job_runs(id,json) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET json=excluded.json", rusqlite::params![run.id, serde_json::to_string(run)?])?;
    atomic_json(
        &confined(store.path(), &format!("jobs/runs/{}.json", run.id))?,
        run,
    )
}
pub fn create(store: &ProjectStore, run: &JobRun, attempts: &[Job]) -> Result<()> {
    let tx = store.connection().unchecked_transaction()?;
    tx.execute(
        "INSERT INTO job_runs(id,json) VALUES(?1,?2)",
        rusqlite::params![run.id, serde_json::to_string(run)?],
    )?;
    for j in attempts {
        tx.execute(
            "INSERT INTO jobs(id,json) VALUES(?1,?2)",
            rusqlite::params![j.id, serde_json::to_string(j)?],
        )?;
    }
    tx.commit()?;
    // SQLite is authoritative if projection is interrupted.
    persist(store, run)?;
    for j in attempts {
        crate::persist(store, j)?;
    }
    Ok(())
}
pub fn control(store: &ProjectStore, run_id: &str, action: &str) -> Result<()> {
    let mut run = list(store)?
        .into_iter()
        .find(|r| r.id == run_id)
        .ok_or("Run missing")?;
    let target = match action {
        "pause" => "paused",
        "resume" => "waiting",
        "cancel" => "canceled",
        _ => return Err("Unknown run action".into()),
    };
    if run.state == "canceled" && action != "cancel" {
        return Err("Canceled run cannot resume".into());
    }
    if action == "resume" {
        run.queued = false;
    }
    run.state = if action == "resume" {
        "active"
    } else if action == "pause" {
        "paused"
    } else {
        "canceled"
    }
    .into();
    for mut j in jobs(store)? {
        if j.run_id.as_deref() == Some(run_id) && matches!(j.state.as_str(), "waiting" | "paused") {
            transition(&mut j, target)?;
            crate::persist(store, &j)?;
        }
    }
    persist(store, &run)
}
/// Replace only an explicitly queued, wholly unsent batch. Keep canceled receipts.
pub fn replace_queued(
    store: &ProjectStore,
    old_id: &str,
    run: &JobRun,
    attempts: &[Job],
) -> Result<()> {
    let mut old = list(store)?
        .into_iter()
        .find(|r| r.id == old_id)
        .ok_or("Run missing")?;
    let all = jobs(store)?;
    let mut previous = Vec::new();
    if !old.queued
        || old.state != "paused"
        || !run.queued
        || run.state != "paused"
        || attempts.is_empty()
    {
        return Err(
            "Only an unstarted queued batch can be edited; reuse other runs as a new draft".into(),
        );
    }
    for id in &old.job_ids {
        let mut job = all
            .iter()
            .find(|j| &j.id == id)
            .cloned()
            .ok_or("Queued attempt missing")?;
        if job.state != "paused" || job.remote_id.is_some() {
            return Err("Batch has already started; reuse it as a new draft".into());
        }
        job.state = "canceled".into();
        previous.push(job);
    }
    if attempts.iter().any(|j| {
        j.state != "paused" || j.remote_id.is_some() || j.run_id.as_deref() != Some(&run.id)
    }) {
        return Err("Replacement attempts must remain queued".into());
    }
    old.state = "canceled".into();
    old.queued = false;
    let tx = store.connection().unchecked_transaction()?;
    tx.execute(
        "UPDATE job_runs SET json=?2 WHERE id=?1",
        rusqlite::params![old.id, serde_json::to_string(&old)?],
    )?;
    for j in &previous {
        tx.execute(
            "UPDATE jobs SET json=?2 WHERE id=?1",
            rusqlite::params![j.id, serde_json::to_string(j)?],
        )?;
    }
    tx.execute(
        "INSERT INTO job_runs(id,json) VALUES(?1,?2)",
        rusqlite::params![run.id, serde_json::to_string(run)?],
    )?;
    for j in attempts {
        tx.execute(
            "INSERT INTO jobs(id,json) VALUES(?1,?2)",
            rusqlite::params![j.id, serde_json::to_string(j)?],
        )?;
    }
    tx.commit()?;
    persist(store, &old)?;
    persist(store, run)?;
    for j in previous.iter().chain(attempts) {
        crate::persist(store, j)?;
    }
    Ok(())
}
/// Caller reserves returned attempts under the same project lock before any await.
pub fn eligible(attempts: &[Job], connections: &[Connection]) -> Result<Vec<String>> {
    let mut busy: HashMap<String, usize> = HashMap::new();
    let destination = |j: &Job| -> Result<Connection> {
        if let Some(c) = j.snapshot.get("connection") {
            return Ok(serde_json::from_value(c.clone())?);
        }
        connections
            .iter()
            .find(|c| c.id == j.connection_id)
            .cloned()
            .ok_or_else(|| "Missing destination".into())
    };
    for j in attempts {
        if !terminal(&j.state) && !matches!(j.state.as_str(), "waiting" | "paused") {
            if let Ok(c) = destination(j) {
                *busy.entry(lane(&c)?).or_default() += 1;
            }
        }
    }
    let mut result = vec![];
    // list() returns reverse insertion order; reversing preserves durable FIFO,
    // even if multiple items were created within the same clock tick.
    for j in attempts.iter().rev().filter(|j| j.state == "waiting") {
        let Ok(c) = destination(j) else { continue };
        let key = lane(&c)?;
        let slots = if c.kind == "comfyui" {
            1
        } else {
            c.concurrency.max(1) as usize
        };
        let used = busy.entry(key).or_default();
        if *used < slots {
            *used += 1;
            result.push(j.id.clone());
        }
    }
    Ok(result)
}

/// Selectively start/remove or replace idle tasks atomically. Historical receipts remain intact.
pub fn control_selected(
    store: &ProjectStore,
    ids: &[String],
    action: &str,
    replacement: Option<(&JobRun, &[Job])>,
) -> Result<()> {
    if ids.is_empty() || !["resume", "cancel"].contains(&action) {
        return Err("Select idle jobs and a supported action".into());
    }
    let unique: std::collections::HashSet<_> = ids.iter().collect();
    if unique.len() != ids.len() {
        return Err("Duplicate job selection".into());
    }
    let mut all = jobs(store)?;
    for id in ids {
        let job = all
            .iter()
            .find(|j| &j.id == id)
            .ok_or("Selected receipt missing")?;
        if job.state != "paused" || job.remote_id.is_some() {
            return Err("Only paused, unsubmitted tasks can be changed".into());
        }
        if action == "resume" {
            let c: Connection = serde_json::from_value(job.snapshot["connection"].clone())?;
            lane(&c)?;
        }
    }
    if let Some((run, attempts)) = replacement {
        if action != "cancel"
            || !run.queued
            || run.state != "paused"
            || attempts.is_empty()
            || attempts.iter().any(|j| {
                j.state != "paused" || j.remote_id.is_some() || j.run_id.as_deref() != Some(&run.id)
            })
        {
            return Err("Replacement must be an idle queue".into());
        }
    }
    for job in &mut all {
        if ids.contains(&job.id) {
            transition(
                job,
                if action == "resume" {
                    "waiting"
                } else {
                    "canceled"
                },
            )?;
        }
    }
    let mut parents = list(store)?;
    parents.retain(|r| {
        all.iter()
            .any(|j| ids.contains(&j.id) && j.run_id.as_deref() == Some(&r.id))
    });
    for run in &mut parents {
        let children: Vec<_> = all
            .iter()
            .filter(|j| j.run_id.as_deref() == Some(&run.id))
            .collect();
        let idle = children.iter().any(|j| j.state == "paused");
        let active = children
            .iter()
            .any(|j| !terminal(&j.state) && j.state != "paused");
        run.queued = idle && run.queued;
        run.state = if active {
            "active"
        } else if idle {
            "paused"
        } else {
            "finished"
        }
        .into();
    }
    let tx = store.connection().unchecked_transaction()?;
    for j in all.iter().filter(|j| ids.contains(&j.id)) {
        tx.execute(
            "UPDATE jobs SET json=?2 WHERE id=?1",
            rusqlite::params![j.id, serde_json::to_string(j)?],
        )?;
    }
    for r in &parents {
        tx.execute(
            "UPDATE job_runs SET json=?2 WHERE id=?1",
            rusqlite::params![r.id, serde_json::to_string(r)?],
        )?;
    }
    if let Some((run, attempts)) = replacement {
        tx.execute(
            "INSERT INTO job_runs(id,json) VALUES(?1,?2)",
            rusqlite::params![run.id, serde_json::to_string(run)?],
        )?;
        for j in attempts {
            tx.execute(
                "INSERT INTO jobs(id,json) VALUES(?1,?2)",
                rusqlite::params![j.id, serde_json::to_string(j)?],
            )?;
        }
    }
    tx.commit()?;
    for j in all.iter().filter(|j| ids.contains(&j.id)) {
        crate::persist(store, j)?;
    }
    for r in &parents {
        persist(store, r)?;
    }
    if let Some((run, attempts)) = replacement {
        persist(store, run)?;
        for j in attempts {
            crate::persist(store, j)?;
        }
    }
    Ok(())
}
