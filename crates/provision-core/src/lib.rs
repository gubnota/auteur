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

/// A portable profile describes immutable dependencies; transfer URLs with secrets stay outside it.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvisionProfile {
    pub schema_version: u32,
    pub runtime: RuntimeIdentity,
    pub node_types: Vec<String>,
    pub artifacts: Vec<InstallArtifact>,
    pub canary: Value,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeIdentity {
    pub kind: String,
    #[serde(default)]
    pub image: String,
    #[serde(default)]
    pub fingerprint: String,
}
pub use studio_contracts::InstallArtifact;
pub fn digest(value: &impl Serialize) -> Result<String> {
    use sha2::{Digest, Sha256};
    Ok(format!("{:x}", Sha256::digest(serde_json::to_vec(value)?)))
}
fn hash(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit())
}
impl ProvisionProfile {
    pub fn validate(&self) -> Result<()> {
        if self.schema_version != 1 {
            return Err("Unsupported provisioning profile version".into());
        }
        match self.runtime.kind.as_str() {
            "docker"
                if self
                    .runtime
                    .image
                    .split_once("@sha256:")
                    .is_some_and(|(_, s)| hash(s)) => {}
            "native" if hash(&self.runtime.fingerprint) => {}
            _ => {
                return Err(
                    "Pin the Docker image digest or the native inventory runtime fingerprint"
                        .into(),
                );
            }
        }
        workflow_core::validate_graph(&self.canary)?;
        let mut targets = std::collections::HashSet::new();
        for a in &self.artifacts {
            a.validate()?;
            if !targets.insert((&a.kind, &a.category, &a.target)) {
                return Err("Duplicate dependency destination".into());
            }
        }
        Ok(())
    }
}
pub fn readiness(
    profile: &ProvisionProfile,
    inventory: &Value,
    registry: &Value,
    workflows: &[Workflow],
    session: &str,
    attestation: Option<&Value>,
) -> Result<Value> {
    profile.validate()?;
    let profile_hash = digest(profile)?;
    let runtime_matches = match profile.runtime.kind.as_str() {
        "native" => inventory["runtimeFingerprint"] == profile.runtime.fingerprint,
        "docker" => inventory["dockerImage"] == profile.runtime.image,
        _ => false,
    };
    let mut missing_nodes: Vec<String> = profile
        .node_types
        .iter()
        .filter(|n| registry.get(*n).is_none())
        .cloned()
        .collect();
    for w in workflows {
        for n in w
            .graph
            .as_object()
            .ok_or("Invalid workflow graph")?
            .values()
        {
            if let Some(ty) = n["class_type"].as_str() {
                if registry.get(ty).is_none() && !missing_nodes.iter().any(|n| n == ty) {
                    missing_nodes.push(ty.into());
                }
            }
        }
    }
    let files = inventory["files"].as_array().cloned().unwrap_or_default();
    let missing: Vec<_> = files
        .iter()
        .filter(|f| f["state"] != "verified")
        .cloned()
        .collect();
    let mut unresolved = vec![];
    let mut incompatible = vec![];
    for w in workflows {
        if !compatible(&w.requirements.compatibility, &inventory["devices"]) {
            incompatible.push(w.id.clone());
        }
        for a in &w.requirements.artifacts {
            if !profile.artifacts.iter().any(|p| {
                p.kind == a.kind
                    && p.category == a.category
                    && p.target == a.target
                    && p.sha256 == a.sha256
                    && p.size == a.size
                    && p.revision == a.revision
            }) {
                unresolved.push(format!("{}: unreviewed {}", w.name, a.target));
            }
        }
        for n in w.graph.as_object().ok_or("Invalid graph")?.values() {
            if let Some(ty) = n["class_type"].as_str() {
                if let Some(module) = registry[ty]["python_module"]
                    .as_str()
                    .filter(|m| m.starts_with("custom_nodes."))
                {
                    let folder = module
                        .trim_start_matches("custom_nodes.")
                        .split('.')
                        .next()
                        .unwrap_or("");
                    if !profile.artifacts.iter().any(|a| {
                        a.kind == "plugin"
                            && (a.target == folder || a.target.trim_end_matches(".py") == folder)
                    }) {
                        unresolved.push(format!("{}: pin plugin {folder} for {ty}", w.name));
                    }
                }
            }
            for (input, value) in n["inputs"].as_object().ok_or("Invalid inputs")? {
                if let Some(name) = value.as_str() {
                    if [
                        ".safetensors",
                        ".ckpt",
                        ".pt",
                        ".pth",
                        ".onnx",
                        ".bin",
                        ".gguf",
                    ]
                    .iter()
                    .any(|ext| name.to_lowercase().ends_with(ext))
                        && !profile
                            .artifacts
                            .iter()
                            .any(|a| a.kind == "model" && a.target == name)
                    {
                        unresolved.push(format!("{}: pin {input} = {name}", w.name));
                    }
                }
            }
        }
    }
    let complete = files.len() == profile.artifacts.len()
        && missing.is_empty()
        && missing_nodes.is_empty()
        && runtime_matches
        && unresolved.is_empty()
        && incompatible.is_empty();
    let fingerprint = digest(
        &json!({"inventory":inventory,"nodeTypes":registry.as_object().map(|r|r.keys().collect::<Vec<_>>()),"workflows":workflows.iter().map(|w|(&w.id,&w.version,&w.requirements,&w.bindings)).collect::<Vec<_>>()}),
    )?;
    let cached = complete
        && attestation.is_some_and(|a| {
            a["sessionId"] == session
                && a["profileHash"] == profile_hash
                && a["inventoryFingerprint"] == fingerprint
                && a["state"] == "ready"
        });
    Ok(
        json!({"state":if cached {"ready"} else if complete {"unchecked"} else {"missing-dependencies"},"ready":cached,"sessionId":session,"profileHash":profile_hash,"inventoryFingerprint":fingerprint,"runtimeMatches":runtime_matches,"missingNodes":missing_nodes,"unresolved":unresolved,"incompatibleWorkflows":incompatible,"files":files,"workflows":workflows.iter().map(|w|json!({"id":w.id,"version":w.version})).collect::<Vec<_>>()}),
    )
}
fn compatible(kind: &str, devices: &Value) -> bool {
    if matches!(kind, "universal" | "unspecified") {
        return true;
    }
    devices.as_array().is_some_and(|ds| {
        ds.iter().any(|d| match kind {
            "apple-silicon" => d["type"] == "mps",
            "cuda" => {
                d["type"] == "cuda"
                    && !d["name"]
                        .as_str()
                        .unwrap_or("")
                        .to_lowercase()
                        .contains("hip")
            }
            "rocm" => {
                d["type"] == "hip"
                    || d["name"]
                        .as_str()
                        .unwrap_or("")
                        .to_lowercase()
                        .contains("hip")
            }
            "cpu" => d["type"] == "cpu",
            _ => false,
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (ProvisionProfile, Value, Value, Vec<Workflow>) {
        let w = workflow_core::import(
            "Mask",
            json!({"1":{"class_type":"SolidMask","inputs":{"value":1.0,"width":64,"height":64}}}),
        )
        .unwrap();
        let p = ProvisionProfile {
            schema_version: 1,
            runtime: RuntimeIdentity {
                kind: "native".into(),
                image: String::new(),
                fingerprint: "f".repeat(64),
            },
            node_types: vec![],
            artifacts: vec![],
            canary: w.graph.clone(),
        };
        (
            p,
            json!({"runtimeFingerprint":"f".repeat(64),"files":[],"devices":[{"type":"mps"}]}),
            json!({"SolidMask":{"python_module":"nodes"}}),
            vec![w],
        )
    }
    #[test]
    fn attestation_is_invalidated_by_session_hardware_and_requirements() {
        let (p, i, r, mut ws) = fixture();
        let mut a = readiness(&p, &i, &r, &ws, "session", None).unwrap();
        assert_eq!(a["state"], "unchecked");
        a["state"] = json!("ready");
        assert_eq!(
            readiness(&p, &i, &r, &ws, "session", Some(&a)).unwrap()["ready"],
            true
        );
        assert_eq!(
            readiness(&p, &i, &r, &ws, "new-session", Some(&a)).unwrap()["ready"],
            false
        );
        ws[0].requirements.compatibility = "cuda".into();
        let incompatible = readiness(&p, &i, &r, &ws, "session", Some(&a)).unwrap();
        assert_eq!(incompatible["ready"], false);
        assert_eq!(incompatible["incompatibleWorkflows"][0], ws[0].id);
        ws[0].requirements.compatibility = "apple-silicon".into();
        assert_eq!(
            readiness(&p, &i, &r, &ws, "session", Some(&a)).unwrap()["ready"],
            false
        );
    }
    #[test]
    fn installed_nodes_and_weight_names_are_not_proof_of_reviewed_dependencies() {
        let (p, i, mut r, mut ws) = fixture();
        r["SolidMask"]["python_module"] = json!("custom_nodes.example.nodes");
        ws[0].graph["1"]["inputs"]["model"] = json!("missing.safetensors");
        let a = readiness(&p, &i, &r, &ws, "session", None).unwrap();
        assert_eq!(a["state"], "missing-dependencies");
        assert_eq!(a["unresolved"].as_array().unwrap().len(), 2);
    }
    #[test]
    fn duplicate_targets_and_secret_sources_are_rejected() {
        let (mut p, _, _, _) = fixture();
        let a = InstallArtifact {
            kind: "model".into(),
            category: "loras".into(),
            target: "a.safetensors".into(),
            sha256: "a".repeat(64),
            size: 10,
            license: "MIT".into(),
            architecture: "any".into(),
            source: "https://example.org/weights".into(),
            source_ref: String::new(),
            revision: String::new(),
            strip_prefix: String::new(),
        };
        p.artifacts = vec![a.clone(), a];
        assert!(p.validate().is_err());
        p.artifacts.pop();
        p.artifacts[0].source = "https://example.org/weights?token=private".into();
        assert!(p.validate().is_err());
        p.artifacts[0].source = String::new();
        p.artifacts[0].source_ref = "weights-object".into();
        assert!(p.validate().is_ok());
    }
}
