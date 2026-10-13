use project_core::Result;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use studio_contracts::Workflow;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeLock {
    pub schema_version: u32,
    pub image: String,
    pub node_types: Vec<String>,
    pub artifacts: Vec<Artifact>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    pub sha256: String,
    pub size: u64,
    pub source: String,
    pub license: String,
    pub architecture: String,
}
impl RuntimeLock {
    pub fn validate(&self) -> Result<()> {
        if self.schema_version != 1
            || !self.image.contains("@sha256:")
            || self.image.split("@sha256:").last().unwrap_or("").len() != 64
        {
            return Err("Runtime requires an immutable image digest".into());
        }
        for a in &self.artifacts {
            if a.sha256.len() != 64
                || !a.sha256.bytes().all(|b| b.is_ascii_hexdigit())
                || a.size == 0
                || a.license.is_empty()
                || a.architecture.is_empty()
                || !a.source.starts_with("https://")
            {
                return Err("Unresolved artifact hash/source/license/architecture".into());
            }
        }
        Ok(())
    }
}
pub fn plan(workflows: &[Workflow], inventory: &Value, runtime: Option<&RuntimeLock>) -> Value {
    let mut rows = vec![];
    for w in workflows {
        let missing: Vec<_> = w
            .graph
            .as_object()
            .into_iter()
            .flat_map(|g| g.values())
            .filter_map(|n| n["class_type"].as_str())
            .filter(|t| inventory.get(*t).is_none())
            .collect();
        rows.push(json!({"workflowId":w.id,"version":w.version,"missingNodes":missing,"state":if missing.is_empty()&&runtime.is_some_and(|l|l.validate().is_ok()){"ready-for-canary"}else{"BLOCKED"}}));
    }
    json!({"workflows":rows,"runtimePinned":runtime.is_some_and(|l|l.validate().is_ok()),"rule":"Readiness requires pinned runtime, complete node/model inventory and successful canary"})
}
