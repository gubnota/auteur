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
/// Atomic import response: identities are authoritative, never basename matches.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub project: Project,
    pub asset_ids: Vec<String>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<String>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media: Option<MediaBinding>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaBinding {
    pub kind: String,
    pub role: String,
    #[serde(default)]
    pub order: usize,
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
    #[serde(default)]
    pub requirements: WorkflowRequirements,
    #[serde(default)]
    pub inputs: Vec<WorkflowInput>,
    #[serde(default)]
    pub outputs: Vec<WorkflowOutput>,
    #[serde(default)]
    pub profiles: Vec<CompiledProfile>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_target: Option<String>,
    #[serde(default)]
    pub layout: WorkflowLayout,
    #[serde(default)]
    pub wrapper: WorkflowWrapper,
}
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowLayout {
    pub inputs: Vec<InputLayout>,
    pub outputs: Vec<OutputLayout>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InputLayout {
    #[serde(default)]
    pub optional: bool,
    pub node_id: String,
    pub input: String,
    pub label: String,
    pub group: String,
    pub hidden: bool,
    pub advanced: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media_role: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputLayout {
    pub node_id: String,
    pub label: String,
    pub selected: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowInput {
    pub binding: Binding,
    pub label: String,
    pub required: bool,
    pub control: String,
    pub default: Value,
    #[serde(default)]
    pub choices: Vec<Value>,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub step: Option<f64>,
    #[serde(default)]
    pub advanced: bool,
    #[serde(default)]
    pub group: String,
    #[serde(default)]
    pub hidden: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowOutput {
    pub node_id: String,
    pub label: String,
    pub class_type: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompiledProfile {
    pub connection_id: String,
    pub source_hash: String,
    pub api_hash: String,
    pub registry_hash: String,
    pub frontend_hash: String,
    pub compiler_version: String,
    pub graph: Value,
    pub inputs: Vec<WorkflowInput>,
    pub outputs: Vec<WorkflowOutput>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRequirements {
    #[serde(default = "unspecified")]
    pub compatibility: String,
    #[serde(default)]
    pub artifacts: Vec<InstallArtifact>,
}
impl Default for WorkflowRequirements {
    fn default() -> Self {
        Self {
            compatibility: unspecified(),
            artifacts: vec![],
        }
    }
}
fn unspecified() -> String {
    "unspecified".into()
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallArtifact {
    pub kind: String,
    pub category: String,
    pub target: String,
    pub sha256: String,
    pub size: u64,
    pub license: String,
    pub architecture: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub source_ref: String,
    #[serde(default)]
    pub revision: String,
    #[serde(default)]
    pub strip_prefix: String,
}
impl InstallArtifact {
    pub fn validate(&self) -> Result<(), &'static str> {
        let relative = |s: &str| {
            !s.is_empty()
                && !s.starts_with('/')
                && !s.contains(['\\', ':'])
                && s.split('/').all(|p| !p.is_empty() && p != "." && p != "..")
        };
        let hash = |s: &str| s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit());
        if !hash(&self.sha256)
            || self.size == 0
            || self.size > 32 * 1024 * 1024 * 1024
            || self.license.trim().is_empty()
            || !["any", "x86_64", "aarch64", "arm64"].contains(&self.architecture.as_str())
            || !["model", "plugin", "wheel"].contains(&self.kind.as_str())
            || !relative(&self.target)
            || !relative(&self.category)
            || self.category.contains('/')
            || (!self.strip_prefix.is_empty() && !relative(&self.strip_prefix))
            || (self.kind == "wheel" && !self.target.ends_with(".whl"))
            || (self.kind == "plugin"
                && !([40, 64].contains(&self.revision.len())
                    && self.revision.bytes().all(|b| b.is_ascii_hexdigit())))
        {
            return Err(
                "Pin dependency hash, byte size, license, architecture, safe destination and plugin commit",
            );
        }
        if self.source_ref.is_empty() {
            if !self.source.starts_with("https://")
                || self.source[8..].is_empty()
                || self.source.contains(['@', '?', '#'])
                || self.source.chars().any(char::is_whitespace)
            {
                return Err(
                    "Use public HTTPS without credentials/query strings, or a secret source reference",
                );
            }
        } else if !self.source.is_empty() || self.source_ref.chars().any(char::is_whitespace) {
            return Err("Choose one public source or a secret transfer reference");
        }
        Ok(())
    }
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
    #[serde(default)]
    pub queued_run_id: Option<String>,
    #[serde(default)]
    pub queued_job_ids: Vec<String>,
    pub id: String,
    pub name: String,
    pub frame_id: String,
    #[serde(default)]
    pub context: DraftContext,
    pub items: Vec<JobItem>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftContext {
    pub kind: String,
    #[serde(default)]
    pub mode: String,
    #[serde(default)]
    pub character_ids: Vec<String>,
}
impl Default for DraftContext {
    fn default() -> Self {
        Self {
            kind: "storyboard".into(),
            mode: "custom".into(),
            character_ids: vec![],
        }
    }
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
    #[serde(default)]
    pub queued: bool,
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
    #[serde(default)]
    pub dismissed_queue_job_ids: Vec<String>,
    pub storage: Value,
    pub notifications: Vec<Diagnostic>,
    pub logs: Vec<Diagnostic>,
}

/// Designer metadata; every variant has independent immutable graph identity.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowWrapper {
    /// Built-in example provenance survives pinning/export; absent on user workflows.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub example_id: Option<String>,
    #[serde(default)]
    pub python_packages: Vec<String>,
    #[serde(default)]
    pub family_id: String,
    #[serde(default)]
    pub variant_name: String,
    #[serde(default)]
    pub collection: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub readme: String,
    #[serde(default)]
    pub illustration: Option<String>,
    #[serde(default)]
    pub os: String,
    #[serde(default)]
    pub architecture: String,
    #[serde(default)]
    pub precision: String,
}
impl WorkflowWrapper {
    pub fn validate(&self) -> Result<(), String> {
        if self.python_packages.len() > 128
            || self.python_packages.iter().any(|p| {
                let Some((name, version)) = p.split_once("==") else {
                    return true;
                };
                name.is_empty()
                    || version.is_empty()
                    || !name
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
                    || !version
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b"._+-".contains(&b))
            })
        {
            return Err("Use exact Python package pins, for example onnxruntime==1.23.2".into());
        }
        if !self.family_id.is_empty() && uuid::Uuid::parse_str(&self.family_id).is_err() {
            return Err("Invalid workflow family identity".into());
        }
        if self.readme.len() > 128 * 1024
            || self.description.len() > 4096
            || [
                &self.collection,
                &self.variant_name,
                &self.os,
                &self.architecture,
                &self.precision,
            ]
            .iter()
            .any(|v| v.len() > 200)
        {
            return Err("Workflow guide metadata exceeds limits".into());
        }
        if !["", "any", "macos", "linux", "windows"].contains(&self.os.as_str())
            || !["", "any", "arm64", "x86_64"].contains(&self.architecture.as_str())
        {
            return Err("Unsupported workflow platform declaration".into());
        }
        if let Some(image) = &self.illustration {
            if image.len() > 4 * 1024 * 1024
                || ![
                    "data:image/png;base64,",
                    "data:image/jpeg;base64,",
                    "data:image/webp;base64,",
                ]
                .iter()
                .any(|p| image.starts_with(p))
                || !image.split_once(',').is_some_and(|(_, data)| {
                    data.bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b"+/=".contains(&b))
                })
            {
                return Err("Illustration must be a bounded embedded PNG, JPEG or WebP".into());
            }
        }
        Ok(())
    }
}
