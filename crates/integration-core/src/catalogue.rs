//! Immutable sources and editable layouts live beside settings, never credentials.
use super::*;
impl SettingsStore {
    pub fn catalogue(&self) -> Result<Vec<Workflow>> {
        self.db.execute_batch("CREATE TABLE IF NOT EXISTS workflows(id TEXT PRIMARY KEY, source_hash TEXT NOT NULL, json TEXT NOT NULL)")?;
        let mut query = self
            .db
            .prepare("SELECT json FROM workflows ORDER BY rowid DESC")?;
        let mut result = vec![];
        for row in query.query_map([], |r| r.get::<_, String>(0))? {
            result.push(serde_json::from_str(&row?)?);
        }
        Ok(result)
    }
    pub fn put_workflow(&self, workflow: &Workflow) -> Result<Workflow> {
        uuid::Uuid::parse_str(&workflow.id)?;
        let existing = self.catalogue()?;
        if let Some(old) = existing.iter().find(|w| w.id == workflow.id) {
            if old.graph != workflow.graph
                || old.version != workflow.version
                || old.editor_graph != workflow.editor_graph
            {
                return Err("Catalogue originals are immutable; import a new version".into());
            }
        }
        let hash = workflow.editor_hash.as_ref().unwrap_or(&workflow.version);
        self.db.execute("INSERT INTO workflows VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET json=excluded.json",rusqlite::params![workflow.id,hash,serde_json::to_string(workflow)?])?;
        Ok(workflow.clone())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sources_survive_reopen_and_cannot_be_replaced() {
        let path = std::env::temp_dir().join(format!("catalogue-{}.sqlite", project_core::id()));
        let store = SettingsStore::open(&path).unwrap();
        let w:Workflow=serde_json::from_value(json!({"id":project_core::id(),"name":"Editor","version":"a".repeat(64),"graph":{},"bindings":[],"editorGraph":{"nodes":[{"id":1}]}})).unwrap();
        store.put_workflow(&w).unwrap();
        drop(store);
        let store = SettingsStore::open(&path).unwrap();
        assert_eq!(store.catalogue().unwrap()[0].id, w.id);
        let mut changed = w;
        changed.graph = json!({"changed":true});
        assert!(store.put_workflow(&changed).is_err());
        drop(store);
        let _ = std::fs::remove_file(path);
    }
}
