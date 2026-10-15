//! Separate from the generation/initialization claim lane.
use super::*;
pub(super) fn schema(db: &rusqlite::Connection) -> rusqlite::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS consoles(id TEXT PRIMARY KEY,node TEXT,json TEXT);",
    )
}
pub(super) fn private(s: &Data) -> Reply<()> {
    let defaults: Value =
        serde_json::from_str(include_str!("../../../deploy/node-auth.defaults.json"))
            .map_err(failure)?;
    if defaults["MYMOVIE_DESKTOP_TOKEN"] == s.desktop || defaults["MYMOVIE_AGENT_TOKEN"] == s.agent
    {
        return Err((StatusCode::FORBIDDEN,"Remote console requires a private token pair and an agent started with --allow-console".into()));
    }
    Ok(())
}
fn load(db: &rusqlite::Connection, id: &str) -> Reply<Value> {
    let raw: String = db
        .query_row("SELECT json FROM consoles WHERE id=?1", [id], |r| r.get(0))
        .map_err(|_| (StatusCode::NOT_FOUND, "Console missing".into()))?;
    serde_json::from_str(&raw).map_err(failure)
}
fn save(db: &rusqlite::Connection, v: &Value) -> Reply<()> {
    db.execute(
        "INSERT INTO consoles VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET json=excluded.json",
        rusqlite::params![v["id"].as_str(), v["nodeId"].as_str(), v.to_string()],
    )
    .map_err(failure)?;
    Ok(())
}
fn public(mut v: Value) -> Value {
    v.as_object_mut().unwrap().remove("commands");
    v
}
async fn open(
    State(s): State<Shared>,
    h: HeaderMap,
    Path(node): Path<String>,
) -> Reply<Json<Value>> {
    auth(&s, &h, false)?;
    private(&s)?;
    if !s.nodes.contains(&node) {
        return Err((StatusCode::NOT_FOUND, "Node missing".into()));
    }
    let db = s.db.lock().unwrap();
    let advertised: Option<String> = db
        .query_row("SELECT json FROM nodes WHERE id=?1", [&node], |r| r.get(0))
        .ok();
    if !advertised
        .and_then(|v| serde_json::from_str::<Value>(&v).ok())
        .is_some_and(|v| v["capabilities"]["console"] == true)
    {
        return Err((StatusCode::CONFLICT,"This agent has not enabled remote console. Use matching private tokens, enable ALLOW_REMOTE_CONSOLE in the notebook and restart the runner.".into()));
    }
    let old: Option<String> = db
        .query_row(
            "SELECT json FROM consoles WHERE node=?1 ORDER BY rowid DESC LIMIT 1",
            [&node],
            |r| r.get(0),
        )
        .ok();
    if let Some(raw) = old {
        let v: Value = serde_json::from_str(&raw).map_err(failure)?;
        if matches!(v["state"].as_str(), Some("opening" | "running"))
            && now() - v["touchedAt"].as_i64().unwrap_or(0) < 1800
        {
            return Ok(Json(public(v)));
        }
    }
    let v = json!({"id":uuid::Uuid::new_v4().to_string(),"nodeId":node,"state":"opening","commands":[],"output":[],"sequence":0,"acked":0,"touchedAt":now(),"lastContact":now()});
    save(&db, &v)?;
    Ok(Json(public(v)))
}
async fn get_session(
    State(s): State<Shared>,
    h: HeaderMap,
    Path(id): Path<String>,
) -> Reply<Json<Value>> {
    auth(&s, &h, false)?;
    let db = s.db.lock().unwrap();
    let mut v = load(&db, &id)?;
    v["touchedAt"] = json!(now());
    save(&db, &v)?;
    if v["state"] == "running" && now() - v["lastContact"].as_i64().unwrap_or(0) > 20 {
        v["state"] = json!("reconnecting");
    }
    Ok(Json(public(v)))
}
async fn input(
    State(s): State<Shared>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(command): Json<Value>,
) -> Reply<Json<Value>> {
    auth(&s, &h, false)?;
    private(&s)?;
    if !matches!(command["type"].as_str(), Some("input" | "resize" | "close"))
        || command.to_string().len() > 8192
    {
        return Err((StatusCode::BAD_REQUEST, "Invalid console command".into()));
    }
    if command["type"] == "input" && command["data"].as_str().is_none_or(|s| s.len() > 4096) {
        return Err((
            StatusCode::BAD_REQUEST,
            "Input exceeds terminal limit".into(),
        ));
    }
    if command["type"] == "resize"
        && (!command["cols"]
            .as_u64()
            .is_some_and(|n| (20..=500).contains(&n))
            || !command["rows"]
                .as_u64()
                .is_some_and(|n| (5..=200).contains(&n)))
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "Invalid terminal dimensions".into(),
        ));
    }
    let db = s.db.lock().unwrap();
    let mut v = load(&db, &id)?;
    if v["state"] == "closed" {
        return Err((StatusCode::CONFLICT, "Console has closed".into()));
    }
    let mut cmd = command;
    let seq = v["inputSequence"].as_u64().unwrap_or(0) + 1;
    cmd["seq"] = json!(seq);
    v["inputSequence"] = json!(seq);
    let commands = v["commands"].as_array_mut().unwrap();
    if commands.len() >= 128 {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            "Console offline; wait for reconnect".into(),
        ));
    }
    commands.push(cmd);
    v["touchedAt"] = json!(now());
    save(&db, &v)?;
    Ok(Json(public(v)))
}
async fn poll(
    State(s): State<Shared>,
    h: HeaderMap,
    Path(node): Path<String>,
    Json(update): Json<Value>,
) -> Reply<Json<Value>> {
    auth(&s, &h, true)?;
    private(&s)?;
    if !s.nodes.contains(&node) {
        return Err((StatusCode::FORBIDDEN, "Wrong node".into()));
    }
    let db = s.db.lock().unwrap();
    let raw: Option<String> = db
        .query_row(
            "SELECT json FROM consoles WHERE node=?1 ORDER BY rowid DESC LIMIT 1",
            [&node],
            |r| r.get(0),
        )
        .ok();
    let Some(raw) = raw else {
        return Ok(Json(Value::Null));
    };
    let mut v: Value = serde_json::from_str(&raw).map_err(failure)?;
    if update["id"] == v["id"] {
        let ack = update["acked"]
            .as_u64()
            .unwrap_or(0)
            .max(v["acked"].as_u64().unwrap_or(0));
        v["acked"] = json!(ack);
        v["commands"]
            .as_array_mut()
            .unwrap()
            .retain(|c| c["seq"].as_u64().unwrap_or(0) > ack);
        if let Some(output) = update["output"].as_str() {
            if output.len() > 65536 {
                return Err((
                    StatusCode::BAD_REQUEST,
                    "Console output exceeds chunk limit".into(),
                ));
            }
            // Sequence IDs make retries idempotent after a broken response.
            let seq = update["sequence"].as_u64().unwrap_or(0);
            if seq > v["sequence"].as_u64().unwrap_or(0) {
                v["sequence"] = json!(seq);
                let rows = v["output"].as_array_mut().unwrap();
                rows.push(json!({"seq":seq,"text":output}));
                while rows.len() > 256
                    || rows
                        .iter()
                        .map(|r| r["text"].as_str().unwrap_or("").len())
                        .sum::<usize>()
                        > 256 * 1024
                {
                    rows.remove(0);
                }
            }
        }
        if matches!(update["state"].as_str(), Some("running" | "closed")) {
            v["state"] = update["state"].clone();
        }
        v["lastContact"] = json!(now());
    }
    if now() - v["touchedAt"].as_i64().unwrap_or(0) > 1800 {
        v["state"] = json!("closed");
    }
    save(&db, &v)?;
    Ok(Json(v))
}
pub(super) fn routes() -> Router<Shared> {
    Router::new()
        .route("/v1/nodes/{node}/console", post(open))
        .route("/v1/consoles/{id}", get(get_session))
        .route("/v1/consoles/{id}/input", post(input))
        .route("/v1/agent/nodes/{node}/console", post(poll))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::{headers, state};
    #[tokio::test]
    async fn reconnect_preserves_pty_and_acknowledges_each_command_and_output_once() {
        let s = state();
        let node = "kaggle-gpu0".to_string();
        let _ = heartbeat(
            State(s.clone()),
            headers("agent"),
            Json(json!({"nodeId":node,"capabilities":{"console":true}})),
        )
        .await
        .unwrap();
        let first = open(State(s.clone()), headers("desktop"), Path(node.clone()))
            .await
            .unwrap()
            .0;
        let id = first["id"].as_str().unwrap().to_string();
        let _ = input(
            State(s.clone()),
            headers("desktop"),
            Path(id.clone()),
            Json(json!({"type":"input","data":"pwd\n"})),
        )
        .await
        .unwrap();
        let report = json!({"id":id,"state":"running","sequence":1,"output":"hello\r\n","acked":1});
        for _ in 0..2 {
            let _ = poll(
                State(s.clone()),
                headers("agent"),
                Path(node.clone()),
                Json(report.clone()),
            )
            .await
            .unwrap();
        }
        let agent = poll(
            State(s.clone()),
            headers("agent"),
            Path(node.clone()),
            Json(json!({})),
        )
        .await
        .unwrap()
        .0;
        assert_eq!(agent["commands"], json!([]));
        assert_eq!(agent["output"].as_array().unwrap().len(), 1);
        let reconnect = open(State(s.clone()), headers("desktop"), Path(node))
            .await
            .unwrap()
            .0;
        assert_eq!(reconnect["id"], first["id"]);
        assert!(reconnect.get("commands").is_none());
        let none = claim(
            State(s),
            headers("agent"),
            Json(json!({"nodeId":"kaggle-gpu0"})),
        )
        .await
        .unwrap()
        .0;
        assert!(
            none.is_null(),
            "terminal commands must never enter the generation queue"
        );
    }
    #[test]
    fn public_test_pair_cannot_enable_remote_shell() {
        let defaults: Value =
            serde_json::from_str(include_str!("../../../deploy/node-auth.defaults.json")).unwrap();
        let mut s = state();
        Arc::get_mut(&mut s).unwrap().desktop =
            defaults["MYMOVIE_DESKTOP_TOKEN"].as_str().unwrap().into();
        assert_eq!(private(&s).unwrap_err().0, StatusCode::FORBIDDEN);
    }
}
