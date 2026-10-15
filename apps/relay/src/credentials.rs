//! One-use, lease-bound model credentials. Never stored in SQLite or events.
use super::*;
pub(super) struct Handoff {
    node: String,
    token: String,
    expires: i64,
}
pub(super) fn routes() -> Router<Shared> {
    Router::new()
        .route(
            "/v1/nodes/{node}/credentials/{id}",
            post(put).delete(discard),
        )
        .route("/v1/agent/credentials/{id}", post(take))
}
async fn put(
    State(s): State<Shared>,
    h: HeaderMap,
    Path((node, id)): Path<(String, String)>,
    Json(v): Json<Value>,
) -> Reply<Json<Value>> {
    auth(&s, &h, false)?;
    console::private(&s).map_err(|_| (StatusCode::FORBIDDEN, "Model credential delivery requires a private desktop/agent token pair; configure matching private values on Studio and the node".into()))?;
    uuid::Uuid::parse_str(&id)
        .map_err(|_| (StatusCode::BAD_REQUEST, "Invalid operation identity".into()))?;
    if !s.nodes.contains(&node) {
        return Err((StatusCode::NOT_FOUND, "Node missing".into()));
    }
    let advertised: Option<String> =
        s.db.lock()
            .unwrap()
            .query_row("SELECT json FROM nodes WHERE id=?1", [&node], |r| r.get(0))
            .ok();
    if !advertised
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .is_some_and(|v| {
            v["capabilities"]["modelCredentials"] == true
                && v["lastSeen"].as_i64().is_some_and(|t| now() - t < 60)
        })
    {
        return Err((StatusCode::CONFLICT, "Update/reconnect the agent: temporary model credentials are not supported by this node".into()));
    }
    let token = v["hfToken"]
        .as_str()
        .filter(|t| {
            t.starts_with("hf_")
                && t.len() >= 8
                && t.len() < 1024
                && !t.chars().any(char::is_whitespace)
        })
        .ok_or((StatusCode::BAD_REQUEST, "Invalid Hugging Face token".into()))?;
    let mut entries = s.credentials.lock().unwrap();
    entries.retain(|_, v| v.expires > now());
    if entries.len() >= 64 || entries.contains_key(&id) {
        return Err((
            StatusCode::CONFLICT,
            "Credential handoff unavailable; retry installation".into(),
        ));
    }
    entries.insert(
        id,
        Handoff {
            node,
            token: token.into(),
            expires: now() + 600,
        },
    );
    // Entries expire even when nobody polls the relay.
    let weak = Arc::downgrade(&s);
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(601)).await;
        if let Some(s) = weak.upgrade() {
            s.credentials
                .lock()
                .unwrap()
                .retain(|_, v| v.expires > now());
        }
    });
    Ok(Json(json!({"accepted":true})))
}
async fn take(
    State(s): State<Shared>,
    h: HeaderMap,
    Path(id): Path<String>,
    Json(v): Json<Value>,
) -> Reply<Json<Value>> {
    auth(&s, &h, true)?;
    let db = s.db.lock().unwrap();
    let job = read(&db, &id)?;
    let lease: i64 = db
        .query_row("SELECT lease FROM jobs WHERE id=?1", [&id], |r| r.get(0))
        .map_err(failure)?;
    if lease <= now()
        || job["kind"] != "initialize"
        || job["state"] != "running"
        || job["nodeId"] != v["nodeId"]
        || job["leaseToken"] != v["leaseToken"]
        || v["leaseToken"].as_str().is_none()
    {
        return Err((
            StatusCode::CONFLICT,
            "Credential lease identity mismatch".into(),
        ));
    }
    let mut entries = s.credentials.lock().unwrap();
    entries.retain(|_, v| v.expires > now());
    if entries
        .get(&id)
        .is_none_or(|entry| Some(entry.node.as_str()) != v["nodeId"].as_str())
    {
        return Err((
            StatusCode::GONE,
            "Model credential expired or already consumed; restart installation from Studio".into(),
        ));
    }
    let entry = entries.remove(&id).unwrap();
    Ok(Json(json!({"hfToken":entry.token})))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::{headers, state};
    #[tokio::test]
    async fn credentials_expire_and_cancellation_discards_unconsumed_values() {
        let s = state();
        s.db.lock()
            .unwrap()
            .execute(
                "INSERT INTO nodes VALUES(?1,?2)",
                rusqlite::params![
                    "kaggle-gpu0",
                    json!({"lastSeen":now(),"capabilities":{"modelCredentials":true}}).to_string()
                ],
            )
            .unwrap();
        for cancel_it in [true, false] {
            let id = project_core::id();
            let _ = put(
                State(s.clone()),
                headers("desktop"),
                Path(("kaggle-gpu0".into(), id.clone())),
                Json(json!({"hfToken":"hf_test_private"})),
            )
            .await
            .unwrap();
            let _ = submit(
                State(s.clone()),
                headers("desktop"),
                Json(json!({"id":id,"nodeId":"kaggle-gpu0","kind":"initialize","payload":{}})),
            )
            .await
            .unwrap();
            if cancel_it {
                let _ = cancel(State(s.clone()), headers("desktop"), Path(id.clone()))
                    .await
                    .unwrap();
                assert!(!s.credentials.lock().unwrap().contains_key(&id));
            } else {
                let job = claim(
                    State(s.clone()),
                    headers("agent"),
                    Json(json!({"nodeId":"kaggle-gpu0"})),
                )
                .await
                .unwrap()
                .0;
                s.credentials.lock().unwrap().get_mut(&id).unwrap().expires = now() - 1;
                assert_eq!(
                    take(
                        State(s.clone()),
                        headers("agent"),
                        Path(id),
                        Json(json!({"nodeId":"kaggle-gpu0","leaseToken":job["leaseToken"]}))
                    )
                    .await
                    .unwrap_err()
                    .0,
                    StatusCode::GONE
                );
            }
        }
    }
    #[tokio::test]
    async fn old_agent_and_public_test_tokens_cannot_receive_private_credentials() {
        let mut s = state();
        let id = project_core::id();
        assert_eq!(
            put(
                State(s.clone()),
                headers("desktop"),
                Path(("kaggle-gpu0".into(), id.clone())),
                Json(json!({"hfToken":"hf_test_private"}))
            )
            .await
            .unwrap_err()
            .0,
            StatusCode::CONFLICT
        );
        let defaults: Value =
            serde_json::from_str(include_str!("../../../deploy/node-auth.defaults.json")).unwrap();
        Arc::get_mut(&mut s).unwrap().desktop =
            defaults["MYMOVIE_DESKTOP_TOKEN"].as_str().unwrap().into();
        assert_eq!(
            put(
                State(s.clone()),
                headers(defaults["MYMOVIE_DESKTOP_TOKEN"].as_str().unwrap()),
                Path(("kaggle-gpu0".into(), id)),
                Json(json!({"hfToken":"hf_test_private"}))
            )
            .await
            .unwrap_err()
            .0,
            StatusCode::FORBIDDEN
        );
        assert!(s.credentials.lock().unwrap().is_empty());
    }
    #[tokio::test]
    async fn handoff_is_lease_bound_one_use_and_absent_from_database() {
        let s = state();
        s.db.lock()
            .unwrap()
            .execute(
                "INSERT INTO nodes VALUES(?1,?2)",
                rusqlite::params![
                    "kaggle-gpu0",
                    json!({"lastSeen":now(),"capabilities":{"modelCredentials":true}}).to_string()
                ],
            )
            .unwrap();
        let id = project_core::id();
        let _ = put(
            State(s.clone()),
            headers("desktop"),
            Path(("kaggle-gpu0".into(), id.clone())),
            Json(json!({"hfToken":"hf_test_private"})),
        )
        .await
        .unwrap();
        let job = submit(
            State(s.clone()),
            headers("desktop"),
            Json(json!({"id":id,"nodeId":"kaggle-gpu0","kind":"initialize","payload":{}})),
        )
        .await
        .unwrap()
        .0;
        assert!(!job.to_string().contains("hf_test_private"));
        let lease = claim(
            State(s.clone()),
            headers("agent"),
            Json(json!({"nodeId":"kaggle-gpu0"})),
        )
        .await
        .unwrap()
        .0;
        let request = json!({"nodeId":"kaggle-gpu0","leaseToken":lease["leaseToken"]});
        assert!(
            take(
                State(s.clone()),
                headers("desktop"),
                Path(id.clone()),
                Json(request.clone())
            )
            .await
            .is_err()
        );
        assert!(
            take(
                State(s.clone()),
                headers("agent"),
                Path(id.clone()),
                Json(json!({"nodeId":"kaggle-gpu1","leaseToken":lease["leaseToken"]}))
            )
            .await
            .is_err()
        );
        assert!(
            take(
                State(s.clone()),
                headers("agent"),
                Path(id.clone()),
                Json(json!({"nodeId":"kaggle-gpu0","leaseToken":"wrong-lease"}))
            )
            .await
            .is_err()
        );
        assert_eq!(
            take(
                State(s.clone()),
                headers("agent"),
                Path(id.clone()),
                Json(request.clone())
            )
            .await
            .unwrap()
            .0["hfToken"],
            "hf_test_private"
        );
        assert_eq!(
            take(
                State(s.clone()),
                headers("agent"),
                Path(id.clone()),
                Json(request)
            )
            .await
            .unwrap_err()
            .0,
            StatusCode::GONE
        );
        assert!(
            !read(&s.db.lock().unwrap(), &id)
                .unwrap()
                .to_string()
                .contains("hf_test_private")
        );
        let raw: String =
            s.db.lock()
                .unwrap()
                .query_row("SELECT group_concat(json) FROM events", [], |r| r.get(0))
                .unwrap();
        assert!(!raw.contains("hf_test_private"));
    }
}

async fn discard(
    State(s): State<Shared>,
    h: HeaderMap,
    Path((node, id)): Path<(String, String)>,
) -> Reply<Json<Value>> {
    auth(&s, &h, false)?;
    let mut entries = s.credentials.lock().unwrap();
    if entries.get(&id).is_some_and(|entry| entry.node == node) {
        entries.remove(&id);
    }
    Ok(Json(json!({"discarded":true})))
}
