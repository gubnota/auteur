use super::*;
pub(super) async fn list(
    State(s): State<Shared>,
    h: HeaderMap,
    Path(node): Path<String>,
) -> Reply<Json<Value>> {
    auth(&s, &h, false)?;
    if !s.nodes.contains(&node) {
        return Err((StatusCode::NOT_FOUND, "Node missing".into()));
    }
    let mut db = s.db.lock().unwrap();
    let tx = db.transaction().map_err(failure)?;
    expire(&tx, now())?;
    let rows = {
        let mut st = tx
            .prepare("SELECT json FROM jobs WHERE node=?1 AND json_extract(json,'$.kind')='initialize' ORDER BY rowid DESC LIMIT 100")
            .map_err(failure)?;
        st.query_map([node], |r| r.get::<_, String>(0))
            .map_err(failure)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(failure)?
    };
    let mut results = vec![];
    for row in rows {
        let v: Value = serde_json::from_str(&row).map_err(failure)?;
        if v["kind"] != "initialize" {
            continue;
        }
        results.push(json!({"id":v["id"],"nodeId":v["nodeId"],"kind":v["kind"],"state":v["state"],"createdAt":v["createdAt"],"lastContact":v["lastContact"],"progress":v["progress"],"error":v["error"],"workflowId":v["payload"]["sourceWorkflow"]["id"],"workflowName":v["payload"]["sourceWorkflow"]["name"]}));
    }
    tx.commit().map_err(failure)?;
    Ok(Json(json!(results)))
}
pub(super) fn deduplicate(db: &rusqlite::Connection, v: &Value) -> Reply<Option<Value>> {
    if v["kind"] != "initialize" {
        return Ok(None);
    }
    let mut st = db
        .prepare("SELECT json FROM jobs WHERE node=?1")
        .map_err(failure)?;
    let rows = st
        .query_map([v["nodeId"].as_str()], |r| r.get::<_, String>(0))
        .map_err(failure)?;
    for row in rows {
        let old: Value = serde_json::from_str(&row.map_err(failure)?).map_err(failure)?;
        if old["kind"] == "initialize"
            && matches!(
                old["state"].as_str(),
                Some("queued" | "running" | "cancel_requested" | "unknown")
            )
        {
            if old["payload"]["sourceWorkflow"] == v["payload"]["sourceWorkflow"]
                && old["payload"]["connectionId"] == v["payload"]["connectionId"]
                && old["payload"]["projectId"] == v["payload"]["projectId"]
            {
                return Ok(Some(old));
            }
            return Err((StatusCode::CONFLICT,"This node already has an initialization operation. Reconnect to it before starting another.".into()));
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tests::{headers, state};
    async fn initialize(s: &Shared, node: &str, name: &str) -> Reply<Json<Value>> {
        submit(State(s.clone()), headers("desktop"), Json(json!({"id":project_core::id(),"nodeId":node,"kind":"initialize","payload":{"connectionId":node,"sourceWorkflow":{"id":name,"name":name}}}))).await
    }
    #[tokio::test]
    async fn duplicate_setup_reconnects_but_different_nodes_remain_independent() {
        let s = state();
        let first = initialize(&s, "kaggle-gpu0", "starter").await.unwrap().0;
        let again = initialize(&s, "kaggle-gpu0", "starter").await.unwrap().0;
        assert_eq!(first["id"], again["id"]);
        assert_eq!(
            initialize(&s, "kaggle-gpu0", "different")
                .await
                .unwrap_err()
                .0,
            StatusCode::CONFLICT
        );
        let other = initialize(&s, "kaggle-gpu1", "starter").await.unwrap().0;
        assert_ne!(first["id"], other["id"]);
        let _ = cancel(
            State(s.clone()),
            headers("desktop"),
            Path(first["id"].as_str().unwrap().into()),
        )
        .await
        .unwrap();
        assert_ne!(
            initialize(&s, "kaggle-gpu0", "starter").await.unwrap().0["id"],
            first["id"]
        );
    }
    #[tokio::test]
    async fn history_keeps_initialization_visible_after_many_generation_jobs() {
        let s = state();
        let first = initialize(&s, "kaggle-gpu0", "starter").await.unwrap().0;
        for _ in 0..105 {
            let _ = submit(State(s.clone()),headers("desktop"),Json(json!({"id":project_core::id(),"nodeId":"kaggle-gpu0","kind":"generation","payload":{}}))).await.unwrap();
        }
        let rows = list(State(s), headers("desktop"), Path("kaggle-gpu0".into()))
            .await
            .unwrap()
            .0;
        assert_eq!(rows.as_array().unwrap().len(), 1);
        assert_eq!(rows[0]["id"], first["id"]);
        assert!(rows[0].get("payload").is_none());
    }
}
