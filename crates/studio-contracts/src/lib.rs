use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub revision: u64,
    pub ratio: String,
    pub positive_prompt: String,
    pub negative_prompt: String,
    pub episodes: Vec<Episode>,
    pub characters: Vec<Character>,
    pub assets: Vec<Asset>,
    pub workflows: Vec<Workflow>,
    #[serde(default)]
    pub job_drafts: Vec<JobDraft>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Episode {
    pub id: String,
    pub name: String,
    pub scenes: Vec<Scene>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scene {
    pub id: String,
    pub name: String,
    pub positive_prompt: Option<String>,
    pub negative_prompt: Option<String>,
    #[serde(default)]
    pub character_ids: Vec<String>,
    pub shots: Vec<Shot>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Shot {
    pub id: String,
    pub name: String,
    pub frames: Vec<Frame>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Frame {
    pub id: String,
    pub name: String,
    pub asset_id: Option<String>,
    pub positive_prompt: String,
    pub negative_prompt: String,
    pub include_common: bool,
    pub ratio: Option<String>,
    pub character_ids: Vec<String>,
    pub comments: Vec<Comment>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: String,
    pub text: String,
    pub created_at: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Character {
    pub id: String,
    pub name: String,
    pub description: String,
    pub asset_ids: Vec<String>,
    pub revision: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub id: String,
    pub name: String,
    pub path: String,
    pub sha256: String,
    pub kind: String,
    pub size: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_path: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Binding {
    pub semantic: String,
    pub node_id: String,
    pub input: String,
    pub value_type: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workflow {
    pub id: String,
    pub name: String,
    pub version: String,
    pub graph: Value,
    pub bindings: Vec<Binding>,
    #[serde(default = "other_media")]
    pub media_kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub editor_graph: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub editor_hash: Option<String>,
    #[serde(default)]
    pub deployments: Vec<WorkflowDeployment>,
}
fn other_media() -> String {
    "other".into()
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowDeployment {
    pub connection_id: String,
    pub deployment_id: String,
    pub api_family: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub url: String,
    pub credential_ref: Option<String>,
    pub deployment_id: Option<String>,
    pub api_family: Option<String>,
    pub concurrency: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hosting: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    pub frame_id: String,
    pub workflow_id: String,
    pub workflow_version: String,
    pub connection_id: String,
    pub state: String,
    pub remote_id: Option<String>,
    pub snapshot: Value,
    pub results: Vec<Asset>,
    pub error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub item_id: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobDraft {
    pub id: String,
    pub name: String,
    pub frame_id: String,
    pub items: Vec<JobItem>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobItem {
    pub id: String,
    pub workflow_id: String,
    pub connection_id: String,
    #[serde(default)]
    pub values: Value,
    /// Preserve invalid editor text across draft switches and document reopening.
    #[serde(default)]
    pub input_text: std::collections::BTreeMap<String, String>,
    #[serde(default)]
    pub input_errors: std::collections::BTreeMap<String, String>,
    /// Semantic -> asset ID; omitted media uses the frame/assigned cast.
    #[serde(default)]
    pub assets: std::collections::BTreeMap<String, String>,
    /// None inherits workflow bindings; Some freezes a per-item binding set.
    #[serde(default)]
    pub bindings: Option<Vec<Binding>>,
    #[serde(default)]
    pub deployment_id: Option<String>,
    #[serde(default)]
    pub api_family: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobRun {
    pub id: String,
    pub name: String,
    pub draft_id: String,
    pub job_ids: Vec<String>,
    pub state: String,
    pub created_at: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub id: String,
    pub level: String,
    pub message: String,
    pub created_at: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub connections: Vec<Connection>,
    pub theme: String,
    pub queue_height: f64,
    pub storage: Value,
    pub notifications: Vec<Diagnostic>,
    pub logs: Vec<Diagnostic>,
}
