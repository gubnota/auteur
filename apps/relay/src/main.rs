use axum::{
    Json, Router,
    body::Bytes,
    extract::{DefaultBodyLimit, Path, State},
    http::{HeaderMap, StatusCode},
    response::sse::{Event, KeepAlive, Sse},
    routing::{get, post},
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
type Reply<T> = Result<T, (StatusCode, String)>;
struct Data {
    db: Mutex<rusqlite::Connection>,
    root: PathBuf,
    desktop: String,
    agent: String,
    nodes: Vec<String>,
}
type Shared = Arc<Data>;
fn failure(_: impl std::fmt::Display) -> (StatusCode, String) {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        "Relay persistence error".into(),
    )
}
fn auth(s: &Data, h: &HeaderMap, agent: bool) -> Reply<()> {
    let expected = if agent { &s.agent } else { &s.desktop };
    let actual = h
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if actual != format!("Bearer {expected}") {
        return Err((StatusCode::UNAUTHORIZED, "Invalid authentication".into()));
    }
    Ok(())
}
fn either(s: &Data, h: &HeaderMap) -> Reply<()> {
    auth(s, h, false).or_else(|_| auth(s, h, true))
}
fn event(db: &rusqlite::Connection, id: &str, value: &Value) -> Reply<()> {
    db.execute(
        "INSERT INTO events(job,json) VALUES(?1,?2)",
        rusqlite::params![id, value.to_string()],
    )
    .map_err(failure)?;
    Ok(())
}
fn read(db: &rusqlite::Connection, id: &str) -> Reply<Value> {
    let raw = db
        .query_row("SELECT json FROM jobs WHERE id=?1", [id], |r| {
            r.get::<_, String>(0)
        })
        .map_err(|_| (StatusCode::NOT_FOUND, "Job missing".into()))?;
    serde_json::from_str(&raw).map_err(failure)
}
fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}
fn allowed(s: &Data, node: &Value) -> bool {
    node.as_str()
        .is_some_and(|n| s.nodes.iter().any(|id| id == n))
}
fn node_ids(raw: &str) -> Result<Vec<String>, &'static str> {
    let ids: Vec<String> = raw.split(',').map(str::trim).map(str::to_owned).collect();
    if ids.is_empty()
        || ids.len() > 64
        || ids.iter().any(|n| {
            n.is_empty()
                || n.len() > 96
                || !n
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        })
    {
        return Err(
            "Node IDs must be 1–96 ASCII letters/digits/hyphens/underscores; maximum 64 nodes",
        );
    }
    let unique: std::collections::HashSet<_> = ids.iter().collect();
    if unique.len() != ids.len() {
        return Err("Duplicate node IDs");
    }
    Ok(ids)
}
fn expire(db: &rusqlite::Connection, now: i64) -> Reply<()> {
    let mut st = db
        .prepare("SELECT id,json FROM jobs WHERE lease>0 AND lease<?1")
        .map_err(failure)?;
    let expired = st
        .query_map([now], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })
        .map_err(failure)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(failure)?;
    drop(st);
    for (id, raw) in expired {
        let mut j: Value = serde_json::from_str(&raw).map_err(failure)?;
        if matches!(j["state"].as_str(), Some("running" | "cancel_requested")) {
            j["state"] = json!("unknown");
            j["error"] =
                json!("Lease expired. Reconcile agent receipt; no automatic resubmission.");
            db.execute(
                "UPDATE jobs SET json=?1,lease=0 WHERE id=?2",
                rusqlite::params![j.to_string(), id],
            )
            .map_err(failure)?;
            event(db, &id, &j)?;
        }
    }
    Ok(())
}
async fn health(
    State(s): State<Shared>,
    h: HeaderMap,
    Path(node): Path<String>,
) -> Reply<Json<Value>> {
    auth(&s, &h, false)?;
    if !s.nodes.contains(&node) {
        return Err((StatusCode::NOT_FOUND, "Node missing".into()));
    }
    let db = s.db.lock().unwrap();
    let record: Option<String> = db
        .query_row("SELECT json FROM nodes WHERE id=?1", [node], |r| r.get(0))
        .ok();
    let mut record: Value = record
        .and_then(|r| serde_json::from_str(&r).ok())
        .unwrap_or(json!({"connected":false,"state":"awaiting-agent"}));
    if record["lastSeen"].as_i64().is_none_or(|t| now() - t > 60) {
        record["connected"] = json!(false);
        record["state"] = json!("offline");
    }
    Ok(Json(record))
}
async fn submit(
    State(s): State<Shared>,
    h: HeaderMap,
    Json(mut v): Json<Value>,
) -> Reply<Json<Value>> {
    auth(&s, &h, false)?;
    let id = v["id"]
        .as_str()
        .ok_or((StatusCode::BAD_REQUEST, "Attempt ID required".into()))?
        .to_string();
    uuid::Uuid::parse_str(&id)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid attempt ID".into()))?;
    if !allowed(&s, &v["nodeId"])
        || !matches!(
            v["kind"].as_str(),
            Some(
                "generation"
                    | "doctor"
                    | "inventory"
                    | "drain"
                    | "bootstrap"
                    | "provision"
                    | "workflow-inspect"
                    | "workflow-install"
                    | "workflow-compile"
            )
        )
    {
        return Err((StatusCode::BAD_REQUEST, "Invalid target or action".into()));
    }
    if v["kind"] == "workflow-install"
        && (v["payload"]["name"].as_str().is_some_and(|n| n.len() > 200)
            || (!v["payload"]["publishToComfyui"].is_null()
                && !v["payload"]["publishToComfyui"].is_boolean()))
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "Invalid workflow installation options".into(),
        ));
    }
    let mut db = s.db.lock().unwrap();
    let tx = db.transaction().map_err(failure)?;
    if let Ok(old) = read(&tx, &id) {
        if old["payload"] != v["payload"]
            || old["kind"] != v["kind"]
            || old["nodeId"] != v["nodeId"]
        {
            return Err((
                StatusCode::CONFLICT,
                "Idempotency key reused with different request".into(),
            ));
        }
        return Ok(Json(old));
    }
    v["state"] = json!("queued");
    v["outputs"] = json!([]);
    tx.execute(
        "INSERT INTO jobs VALUES(?1,?2,?3,0)",
        rusqlite::params![id, v["nodeId"].as_str(), v.to_string()],
    )
    .map_err(failure)?;
    event(&tx, &id, &v)?;
    tx.commit().map_err(failure)?;
    Ok(Json(v))
}
async fn status(
    State(s): State<Shared>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Reply<Json<Value>> {
    either(&s, &h)?;
    let mut db = s.db.lock().unwrap();
    let tx = db.transaction().map_err(failure)?;
    expire(&tx, now())?;
    let answer = read(&tx, &id)?;
    tx.commit().map_err(failure)?;
    Ok(Json(answer))
}
async fn cancel(
    State(s): State<Shared>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Reply<Json<Value>> {
    auth(&s, &h, false)?;
    let mut db = s.db.lock().unwrap();
    let tx = db.transaction().map_err(failure)?;
    let mut v = read(&tx, &id)?;
    match v["state"].as_str() {
        Some("queued") => v["state"] = json!("canceled"),
        Some("running") => v["state"] = json!("cancel_requested"),
        _ => return Err((StatusCode::CONFLICT, "Cannot cancel this state".into())),
    };
    tx.execute(
        "UPDATE jobs SET json=?1 WHERE id=?2",
        rusqlite::params![v.to_string(), id],
    )
    .map_err(failure)?;
    event(&tx, &id, &v)?;
    tx.commit().map_err(failure)?;
    Ok(Json(v))
}
async fn claim(State(s): State<Shared>, h: HeaderMap, Json(v): Json<Value>) -> Reply<Json<Value>> {
    auth(&s, &h, true)?;
    if !allowed(&s, &v["nodeId"]) {
        return Err((StatusCode::FORBIDDEN, "Wrong node".into()));
    }
    let mut db = s.db.lock().unwrap();
    let tx = db.transaction().map_err(failure)?;
    let now = now();
    expire(&tx, now)?;
    let raw:Option<(String,String)>=tx.query_row("SELECT id,json FROM jobs WHERE json_extract(json,'$.state')='queued' AND node=?1 ORDER BY rowid LIMIT 1",[v["nodeId"].as_str().unwrap()],|r|Ok((r.get(0)?,r.get(1)?))).ok();
    let answer = if let Some((id, raw)) = raw {
        let mut j: Value = serde_json::from_str(&raw).map_err(failure)?;
        j["state"] = json!("running");
        let lease = project_core::id();
        j["leaseToken"] = json!(lease);
        tx.execute(
            "UPDATE jobs SET json=?1,lease=?2 WHERE id=?3",
            rusqlite::params![j.to_string(), now + 120, id],
        )
        .map_err(failure)?;
        event(&tx, &id, &j)?;
        j
    } else {
        Value::Null
    };
    tx.commit().map_err(failure)?;
    Ok(Json(answer))
}
async fn report(
    State(s): State<Shared>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Reply<Json<Value>> {
    auth(&s, &h, true)?;
    let mut db = s.db.lock().unwrap();
    let tx = db.transaction().map_err(failure)?;
    let mut old = read(&tx, &id)?;
    if !allowed(&s, &old["nodeId"])
        || old["nodeId"] != v["nodeId"]
        || old["leaseToken"] != v["leaseToken"]
        || old["leaseToken"].is_null()
    {
        return Err((StatusCode::CONFLICT, "Lease identity mismatch".into()));
    }
    if matches!(
        old["state"].as_str(),
        Some("completed" | "failed" | "canceled")
    ) {
        return Ok(Json(old));
    }
    // Lease renewal must not overwrite progress or terminal submission state.
    if v["renewOnly"] == true {
        let timestamp = now();
        if matches!(
            old["state"].as_str(),
            Some("running" | "collecting" | "cancel_requested")
        ) {
            tx.execute(
                "UPDATE jobs SET lease=?1 WHERE id=?2",
                rusqlite::params![timestamp + 120, id],
            )
            .map_err(failure)?;
            tx.execute(
                "UPDATE nodes SET json=json_set(json,'$.lastSeen',?1) WHERE id=?2",
                rusqlite::params![timestamp, old["nodeId"].as_str()],
            )
            .map_err(failure)?;
        }
        tx.commit().map_err(failure)?;
        return Ok(Json(old));
    }
    if !matches!(
        v["state"].as_str(),
        Some("running" | "collecting" | "completed" | "failed" | "canceled" | "unknown")
    ) {
        return Err((StatusCode::BAD_REQUEST, "Invalid state".into()));
    }
    let cancel = old["state"] == "cancel_requested";
    old["state"] = if cancel && v["state"] == "running" {
        json!("cancel_requested")
    } else {
        v["state"].clone()
    };
    for key in ["outputs", "error", "report", "remoteId"] {
        if v.get(key).is_some() {
            old[key] = v[key].clone();
        }
    }
    let now = now();
    tx.execute(
        "UPDATE jobs SET json=?1,lease=?2 WHERE id=?3",
        rusqlite::params![
            old.to_string(),
            if matches!(old["state"].as_str(), Some("running" | "cancel_requested")) {
                now + 120
            } else {
                0
            },
            id
        ],
    )
    .map_err(failure)?;
    // Generation reports also renew liveness while the agent is busy.
    tx.execute(
        "UPDATE nodes SET json=json_set(json,'$.lastSeen',?1) WHERE id=?2",
        rusqlite::params![now, old["nodeId"].as_str()],
    )
    .map_err(failure)?;
    event(&tx, &id, &old)?;
    tx.commit().map_err(failure)?;
    Ok(Json(old))
}
async fn heartbeat(
    State(s): State<Shared>,
    h: HeaderMap,
    Json(mut v): Json<Value>,
) -> Reply<Json<Value>> {
    auth(&s, &h, true)?;
    if !allowed(&s, &v["nodeId"]) {
        return Err((StatusCode::FORBIDDEN, "Wrong node".into()));
    }
    v["lastSeen"] = json!(now());
    s.db.lock()
        .unwrap()
        .execute(
            "INSERT INTO nodes VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET json=excluded.json",
            rusqlite::params![v["nodeId"].as_str(), v.to_string()],
        )
        .map_err(failure)?;
    Ok(Json(json!({"accepted":true})))
}
async fn upload(State(s): State<Shared>, h: HeaderMap, bytes: Bytes) -> Reply<Json<Value>> {
    either(&s, &h)?;
    let name = h
        .get("x-asset-name")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("result.png");
    let id = project_core::id();
    let metadata = json!({"id":id,"name":name,"kind":h.get("x-asset-kind").and_then(|v|v.to_str().ok()).unwrap_or("image"),"size":bytes.len(),"sha256":format!("{:x}",Sha256::digest(&bytes))});
    let dest = s.root.join("assets").join(&id);
    tokio::fs::write(dest, &bytes).await.map_err(failure)?;
    s.db.lock()
        .unwrap()
        .execute(
            "INSERT INTO assets VALUES(?1,?2)",
            rusqlite::params![id, metadata.to_string()],
        )
        .map_err(failure)?;
    Ok(Json(metadata))
}
async fn asset(
    State(s): State<Shared>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Reply<(HeaderMap, Bytes)> {
    either(&s, &h)?;
    uuid::Uuid::parse_str(&id).map_err(|_| (StatusCode::BAD_REQUEST, "Invalid asset ID".into()))?;
    let raw: String =
        s.db.lock()
            .unwrap()
            .query_row("SELECT json FROM assets WHERE id=?1", [&id], |r| r.get(0))
            .map_err(failure)?;
    let metadata: Value = serde_json::from_str(&raw).map_err(failure)?;
    let mut headers = HeaderMap::new();
    for key in ["name", "kind", "sha256"] {
        headers.insert(
            format!("x-asset-{key}")
                .parse::<axum::http::HeaderName>()
                .map_err(failure)?,
            metadata[key]
                .as_str()
                .unwrap_or("")
                .parse()
                .map_err(failure)?,
        );
    }
    let data = tokio::fs::read(s.root.join("assets").join(id))
        .await
        .map_err(|_| (StatusCode::NOT_FOUND, "Asset missing".into()))?;
    Ok((headers, data.into()))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(std::env::var("MYMOVIE_RELAY_DATA").unwrap_or("relay-data".into()));
    std::fs::create_dir_all(root.join("assets"))?;
    let db = rusqlite::Connection::open(root.join("relay.sqlite"))?;
    db.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,node TEXT,json TEXT,lease INTEGER); CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,job TEXT,json TEXT); CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,json TEXT); CREATE TABLE IF NOT EXISTS nodes(id TEXT PRIMARY KEY,json TEXT);")?;
    let desktop = std::env::var("MYMOVIE_DESKTOP_TOKEN")?;
    let agent = std::env::var("MYMOVIE_AGENT_TOKEN")?;
    if desktop.len() < 24 || agent.len() < 24 || desktop == agent {
        return Err("Set distinct 24+ character desktop and agent tokens".into());
    }
    let s = Arc::new(Data {
        db: Mutex::new(db),
        root,
        desktop,
        agent,
        nodes: node_ids(
            &std::env::var("MYMOVIE_NODE_IDS")
                .unwrap_or_else(|_| std::env::var("MYMOVIE_NODE_ID").unwrap_or("local-cpu".into())),
        )?,
    });
    let router=Router::new().route("/v1/nodes/{node}",get(health)).route("/v1/jobs",post(submit)).route("/v1/jobs/{id}",get(status)).route("/v1/jobs/{id}/cancel",post(cancel)).route("/v1/agent/claim",post(claim)).route("/v1/agent/jobs/{id}",post(report)).route("/v1/agent/heartbeat",post(heartbeat)).route("/v1/assets",post(upload)).route("/v1/assets/{id}",get(asset)).route("/v1/events",get(|State(s):State<Shared>,h:HeaderMap|async move{
 auth(&s,&h,false)?;let mut cursor=h.get("last-event-id").and_then(|v|v.to_str().ok()).and_then(|v|v.parse::<i64>().ok()).unwrap_or(0);
 let stream=async_stream::stream!{loop{let rows={let db=s.db.lock().unwrap();let mut st=db.prepare("SELECT seq,json FROM events WHERE seq>?1 ORDER BY seq LIMIT 100").unwrap();st.query_map([cursor],|r|Ok((r.get::<_,i64>(0)?,r.get::<_,String>(1)?))).unwrap().collect::<Result<Vec<_>,_>>()};match rows{Ok(rows)=>for (seq,raw) in rows{cursor=seq;yield Ok::<_,std::convert::Infallible>(Event::default().id(seq.to_string()).event("job").data(raw));},Err(_)=>break}tokio::time::sleep(std::time::Duration::from_secs(1)).await;}};
 Ok::<_,(StatusCode,String)>(Sse::new(stream).keep_alive(KeepAlive::default()))
 })).layer(DefaultBodyLimit::max(1024*1024*1024)).with_state(s);
    let addr = std::env::var("MYMOVIE_RELAY_BIND").unwrap_or("127.0.0.1:8787".into());
    axum::serve(tokio::net::TcpListener::bind(addr).await?, router).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn state() -> Shared {
        let db = rusqlite::Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE jobs(id TEXT PRIMARY KEY,node TEXT,json TEXT,lease INTEGER); CREATE TABLE events(seq INTEGER PRIMARY KEY AUTOINCREMENT,job TEXT,json TEXT); CREATE TABLE nodes(id TEXT PRIMARY KEY,json TEXT);").unwrap();
        Arc::new(Data {
            db: Mutex::new(db),
            root: PathBuf::new(),
            desktop: "desktop".into(),
            agent: "agent".into(),
            nodes: node_ids("kaggle-gpu0,kaggle-gpu1").unwrap(),
        })
    }
    fn headers(token: &str) -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert("authorization", format!("Bearer {token}").parse().unwrap());
        h
    }
    async fn queue(s: &Shared, node: &str) -> String {
        let id = project_core::id();
        let _ = submit(
            State(s.clone()),
            headers("desktop"),
            Json(json!({"id":id,"nodeId":node,"kind":"generation","payload":{}})),
        )
        .await
        .unwrap();
        id
    }
    #[tokio::test]
    async fn two_nodes_claim_independently_and_reject_cross_node_reports() {
        let s = state();
        let a = queue(&s, "kaggle-gpu0").await;
        let b = queue(&s, "kaggle-gpu1").await;
        let (first, second) = tokio::join!(
            claim(
                State(s.clone()),
                headers("agent"),
                Json(json!({"nodeId":"kaggle-gpu0"}))
            ),
            claim(
                State(s.clone()),
                headers("agent"),
                Json(json!({"nodeId":"kaggle-gpu1"}))
            )
        );
        let first = first.unwrap().0;
        let second = second.unwrap().0;
        assert_eq!(first["id"], a);
        assert_eq!(second["id"], b);
        assert_ne!(first["leaseToken"], second["leaseToken"]);
        assert!(
            claim(
                State(s.clone()),
                headers("agent"),
                Json(json!({"nodeId":"unknown"}))
            )
            .await
            .is_err()
        );
        let bad = report(State(s.clone()),headers("agent"),Path(a.clone()),Json(json!({"nodeId":"kaggle-gpu1","leaseToken":first["leaseToken"],"state":"completed"}))).await;
        assert_eq!(bad.unwrap_err().0, StatusCode::CONFLICT);
        let _ = report(State(s.clone()),headers("agent"),Path(b),Json(json!({"nodeId":"kaggle-gpu1","leaseToken":second["leaseToken"],"state":"completed"}))).await.unwrap();
        assert_eq!(read(&s.db.lock().unwrap(), &a).unwrap()["state"], "running");
    }
    #[tokio::test]
    async fn renewal_preserves_state_and_never_resurrects_completed_jobs() {
        let s = state();
        let id = queue(&s, "kaggle-gpu0").await;
        let lease = claim(
            State(s.clone()),
            headers("agent"),
            Json(json!({"nodeId":"kaggle-gpu0"})),
        )
        .await
        .unwrap()
        .0;
        let mut receipt = json!({"nodeId":"kaggle-gpu0","leaseToken":lease["leaseToken"],"renewOnly":true,"state":"running","remoteId":"should-not-overwrite"});
        s.db.lock()
            .unwrap()
            .execute("UPDATE jobs SET lease=1 WHERE id=?1", [&id])
            .unwrap();
        let renewed = report(
            State(s.clone()),
            headers("agent"),
            Path(id.clone()),
            Json(receipt.clone()),
        )
        .await
        .unwrap()
        .0;
        assert_eq!(renewed, lease);
        let expiry: i64 =
            s.db.lock()
                .unwrap()
                .query_row("SELECT lease FROM jobs WHERE id=?1", [&id], |r| r.get(0))
                .unwrap();
        assert!(expiry > now());
        receipt["renewOnly"] = json!(false);
        receipt["state"] = json!("completed");
        let completed = report(
            State(s.clone()),
            headers("agent"),
            Path(id.clone()),
            Json(receipt.clone()),
        )
        .await
        .unwrap()
        .0;
        receipt["renewOnly"] = json!(true);
        receipt["state"] = json!("running");
        assert_eq!(
            report(State(s.clone()), headers("agent"), Path(id), Json(receipt))
                .await
                .unwrap()
                .0,
            completed
        );
    }
    #[tokio::test]
    async fn lost_runtime_is_offline_and_job_is_unknown_without_requeue() {
        let s = state();
        let id = queue(&s, "kaggle-gpu0").await;
        let _ = claim(
            State(s.clone()),
            headers("agent"),
            Json(json!({"nodeId":"kaggle-gpu0"})),
        )
        .await
        .unwrap();
        {
            let db = s.db.lock().unwrap();
            db.execute("UPDATE jobs SET lease=?1", [now() - 1]).unwrap();
            db.execute(
                "INSERT INTO nodes VALUES(?1,?2)",
                rusqlite::params![
                    "kaggle-gpu0",
                    json!({"connected":true,"lastSeen":now()-61}).to_string()
                ],
            )
            .unwrap();
        }
        assert_eq!(
            health(
                State(s.clone()),
                headers("desktop"),
                Path("kaggle-gpu0".into())
            )
            .await
            .unwrap()
            .0["connected"],
            false
        );
        assert_eq!(
            status(State(s.clone()), headers("desktop"), Path(id))
                .await
                .unwrap()
                .0["state"],
            "unknown"
        );
        assert!(
            claim(
                State(s),
                headers("agent"),
                Json(json!({"nodeId":"kaggle-gpu0"}))
            )
            .await
            .unwrap()
            .0
            .is_null()
        );
    }
    #[test]
    fn explicit_node_allowlist() {
        assert!(node_ids("gpu0,gpu1").is_ok());
        for invalid in ["", "gpu0,gpu0", "../node", "gpu0,"] {
            assert!(node_ids(invalid).is_err());
        }
    }
}
