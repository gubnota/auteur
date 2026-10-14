use job_core::{list, persist, recover, runs};
use project_core::{ProjectStore, id};
use serde_json::json;
use studio_contracts::{Connection, Job, JobRun};
fn c(url: &str) -> Connection {
    Connection {
        id: id(),
        name: "CPU".into(),
        kind: "comfyui".into(),
        url: url.into(),
        credential_ref: None,
        deployment_id: None,
        api_family: None,
        concurrency: 8,
        hosting: None,
    }
}
fn j(c: &Connection, run: &str) -> Job {
    Job {
        id: id(),
        frame_id: id(),
        workflow_id: id(),
        workflow_version: "a".repeat(64),
        connection_id: c.id.clone(),
        state: "waiting".into(),
        remote_id: None,
        snapshot: json!({"connection":c}),
        results: vec![],
        error: None,
        created_at: "same-tick".into(),
        updated_at: "same-tick".into(),
        run_id: Some(run.into()),
        item_id: Some(id()),
    }
}
#[test]
fn fifo_aliases_parallel_slots_unknown_and_recovery() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("queues.mymovie");
    let s = ProjectStore::create(&path, "Queues", true).unwrap();
    let a = c("http://LOCALHOST:8188/");
    let alias = c("http://localhost:8188");
    let b = c("http://localhost:8189");
    assert_eq!(runs::lane(&a).unwrap(), runs::lane(&alias).unwrap());
    let rid = id();
    let mut first = j(&a, &rid);
    let second = j(&alias, &rid);
    let third = j(&b, &rid);
    let run = JobRun {
        id: rid.clone(),
        name: "Batch".into(),
        draft_id: id(),
        job_ids: vec![first.id.clone(), second.id.clone(), third.id.clone()],
        state: "active".into(),
        created_at: "now".into(),
        queued: false,
    };
    runs::create(&s, &run, &[first.clone(), second.clone(), third.clone()]).unwrap();
    assert_eq!(
        runs::eligible(&list(&s).unwrap(), &[]).unwrap(),
        vec![first.id.clone(), third.id.clone()]
    );
    first.state = "staging".into();
    persist(&s, &first).unwrap();
    assert_eq!(
        runs::eligible(&list(&s).unwrap(), &[]).unwrap(),
        vec![third.id.clone()]
    );
    first.state = "unknown".into();
    persist(&s, &first).unwrap();
    assert_eq!(
        runs::eligible(&list(&s).unwrap(), &[]).unwrap(),
        vec![third.id.clone()]
    );
    first.state = "failed".into();
    persist(&s, &first).unwrap();
    assert_eq!(
        runs::eligible(&list(&s).unwrap(), &[]).unwrap(),
        vec![second.id.clone(), third.id.clone()]
    );
    drop(s);
    let s = ProjectStore::open(&path).unwrap();
    recover(&s).unwrap();
    assert!(runs::eligible(&list(&s).unwrap(), &[]).unwrap().is_empty());
    assert_eq!(runs::list(&s).unwrap()[0].state, "paused");
    runs::control(&s, &rid, "resume").unwrap();
    assert_eq!(
        runs::eligible(&list(&s).unwrap(), &[]).unwrap(),
        vec![second.id.clone(), third.id.clone()]
    );
    runs::control(&s, &rid, "cancel").unwrap();
    assert!(
        list(&s)
            .unwrap()
            .iter()
            .all(|j| job_core::terminal(&j.state))
    );
    assert!(runs::control(&s, &rid, "resume").is_err());
    assert!(path.join(format!("jobs/runs/{rid}.json")).is_file());
}
#[test]
fn runninghub_uses_account_capacity_and_reservations_are_not_redispatched() {
    let mut a = c("https://www.runninghub.ai");
    a.kind = "runninghub".into();
    a.concurrency = 2;
    let mut jobs = vec![j(&a, "run"), j(&a, "run"), j(&a, "run")];
    jobs.reverse();
    let eligible = runs::eligible(&jobs, &[]).unwrap();
    assert_eq!(eligible.len(), 2);
    for j in &mut jobs {
        if eligible.contains(&j.id) {
            j.state = "staging".into();
        }
    }
    assert!(runs::eligible(&jobs, &[]).unwrap().is_empty());
}

#[test]
fn private_runpod_nodes_share_relay_but_dispatch_independently() {
    let mut a = c("https://relay.example.test/");
    a.kind = "relay".into();
    a.deployment_id = Some("runpod-gpu0".into());
    a.concurrency = 1;
    let mut alias = a.clone();
    alias.id = id();
    alias.url = "https://relay.example.test".into();
    let mut b = a.clone();
    b.id = id();
    b.deployment_id = Some("runpod-gpu1".into());
    assert_eq!(runs::lane(&a).unwrap(), runs::lane(&alias).unwrap());
    assert_ne!(runs::lane(&a).unwrap(), runs::lane(&b).unwrap());
    let mut first = j(&a, "run");
    let next = j(&alias, "run");
    let other = j(&b, "run");
    assert_eq!(
        runs::eligible(&[other.clone(), next.clone(), first.clone()], &[]).unwrap(),
        vec![first.id.clone(), other.id.clone()]
    );
    first.state = "unknown".into();
    assert_eq!(
        runs::eligible(&[other.clone(), next, first], &[]).unwrap(),
        vec![other.id]
    );
}

#[test]
fn queued_run_survives_reopen_without_admission_until_start() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("queued.mymovie");
    let store = ProjectStore::create(&path, "Queue", true).unwrap();
    let connection = c("http://localhost:8188");
    let rid = id();
    let mut attempt = j(&connection, &rid);
    attempt.state = "paused".into();
    let run = JobRun {
        id: rid.clone(),
        name: "Queued".into(),
        draft_id: id(),
        job_ids: vec![attempt.id.clone()],
        state: "paused".into(),
        created_at: "now".into(),
        queued: true,
    };
    runs::create(&store, &run, &[attempt.clone()]).unwrap();
    assert!(
        runs::eligible(&list(&store).unwrap(), &[])
            .unwrap()
            .is_empty()
    );
    drop(store);
    let store = ProjectStore::open(&path).unwrap();
    recover(&store).unwrap();
    assert!(runs::list(&store).unwrap()[0].queued);
    assert!(
        runs::eligible(&list(&store).unwrap(), &[])
            .unwrap()
            .is_empty()
    );
    runs::control(&store, &rid, "resume").unwrap();
    assert!(!runs::list(&store).unwrap()[0].queued);
    assert_eq!(
        runs::eligible(&list(&store).unwrap(), &[]).unwrap(),
        vec![attempt.id]
    );
}

#[test]
fn queue_edits_are_atomic_idle_and_preserve_original_receipts() {
    let tmp = tempfile::tempdir().unwrap();
    let s = ProjectStore::create(&tmp.path().join("edit.mymovie"), "Edit", false).unwrap();
    let first_node = c("http://localhost:8188");
    let next_node = c("http://localhost:8189");
    let rid = id();
    let mut before = j(&first_node, &rid);
    before.state = "paused".into();
    let old = JobRun {
        id: rid,
        name: "Before".into(),
        draft_id: id(),
        job_ids: vec![before.id.clone()],
        state: "paused".into(),
        created_at: "now".into(),
        queued: true,
    };
    runs::create(&s, &old, &[before.clone()]).unwrap();
    let new_id = id();
    let mut after = j(&next_node, &new_id);
    after.state = "paused".into();
    let replacement = JobRun {
        id: new_id,
        name: "After".into(),
        draft_id: id(),
        job_ids: vec![after.id.clone()],
        state: "paused".into(),
        created_at: "later".into(),
        queued: true,
    };
    // A database conflict rolls back cancellation of the original batch.
    let mut conflict = after.clone();
    conflict.id = before.id.clone();
    assert!(runs::replace_queued(&s, &old.id, &replacement, &[conflict]).is_err());
    assert_eq!(runs::list(&s).unwrap()[0].state, "paused");
    assert_eq!(list(&s).unwrap()[0].state, "paused");
    runs::replace_queued(&s, &old.id, &replacement, &[after.clone()]).unwrap();
    let original = list(&s)
        .unwrap()
        .into_iter()
        .find(|j| j.id == before.id)
        .unwrap();
    assert_eq!(original.state, "canceled");
    assert_eq!(original.snapshot, before.snapshot);
    assert_eq!(list(&s).unwrap()[0].connection_id, next_node.id);
    assert!(runs::eligible(&list(&s).unwrap(), &[]).unwrap().is_empty());
    runs::control(&s, &replacement.id, "resume").unwrap();
    // An already started batch cannot be replaced, even before its next poll.
    assert!(runs::replace_queued(&s, &replacement.id, &replacement, &[after]).is_err());
    assert_eq!(runs::list(&s).unwrap().len(), 2);
}
