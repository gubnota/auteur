//! Portable designer wrappers. No machine profiles, destinations, or vault identities leave the movie.
use project_core::Result;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use studio_contracts::Workflow;
const FORMAT: &str = "mymovie.workflow-collection";
pub fn export(workflows: &[Workflow]) -> Result<Value> {
    if workflows.is_empty() || workflows.len() > 64 {
        return Err("Choose 1–64 workflow variants".into());
    }
    let mut portable = workflows.to_vec();
    for w in &mut portable {
        w.wrapper.validate()?;
        w.profiles.clear();
        w.last_target = None;
        w.deployments.clear();
        for artifact in &mut w.requirements.artifacts {
            artifact.validate()?;
            if !artifact.source_ref.is_empty() && artifact.source_ref != "builtin-mymovie-rembg-v1"
            {
                artifact.source_ref = "configure-private-source".into();
            }
        }
    }
    let value = json!({"format":FORMAT,"schemaVersion":1,"workflows":portable});
    if serde_json::to_vec(&value)?.len() > 16 * 1024 * 1024 {
        return Err("Collection exceeds 16 MiB".into());
    }
    Ok(value)
}
pub fn is_bundle(value: &Value) -> bool {
    value["format"] == FORMAT
}
pub fn import(value: Value) -> Result<Vec<Workflow>> {
    if serde_json::to_vec(&value)?.len() > 16 * 1024 * 1024 {
        return Err("Collection exceeds 16 MiB".into());
    }
    if !is_bundle(&value) || value["schemaVersion"] != 1 {
        return Err("Unsupported workflow collection version".into());
    }
    let mut workflows: Vec<Workflow> = serde_json::from_value(value["workflows"].clone())?;
    if workflows.is_empty() || workflows.len() > 64 {
        return Err("Invalid collection size".into());
    }
    let mut ids = std::collections::HashSet::new();
    for w in &mut workflows {
        uuid_identity(&w.id)?;
        if !ids.insert(w.id.clone()) {
            return Err("Duplicate variant identity".into());
        }
        w.wrapper.validate()?;
        let source = if let Some(editor) = &w.editor_graph {
            let validated = super::import_source(&w.name, editor.clone())?;
            if validated.editor_hash != w.editor_hash {
                return Err("Editor source hash mismatch".into());
            }
            if !w.graph.as_object().is_some_and(|g| g.is_empty()) {
                super::validate_graph(&w.graph)?;
                &w.graph
            } else {
                editor
            }
        } else {
            super::validate_graph(&w.graph)?;
            &w.graph
        };
        if format!("{:x}", Sha256::digest(serde_json::to_vec(source)?)) != w.version {
            return Err("Workflow graph hash mismatch".into());
        }
        if !w.graph.as_object().is_some_and(|g| g.is_empty()) {
            crate::schema::validate_form(&w.graph, &w.bindings, &w.layout)?;
        }
        for a in &mut w.requirements.artifacts {
            a.validate()?;
            if !a.source_ref.is_empty() {
                a.source_ref = "configure-private-source".into();
            }
        }
        // Never trust a foreign machine's preparations or deployment mappings.
        w.profiles.clear();
        w.last_target = None;
        w.deployments.clear();
    }
    Ok(workflows)
}
fn uuid_identity(id: &str) -> Result<()> {
    // Reuse the contracts wrapper validation without introducing a second UUID parser.
    studio_contracts::WorkflowWrapper {
        family_id: id.into(),
        ..Default::default()
    }
    .validate()?;
    if id.is_empty() {
        return Err("Variant identity required".into());
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn roundtrip_variants_preserves_graph_and_optional_false_defaults() {
        let mut a = crate::import(
            "Apple",
            json!({"7":{"class_type":"Output","inputs":{"enabled":false,"count":0,"prompt":""}}}),
        )
        .unwrap();
        a.wrapper.family_id = a.id.clone();
        a.wrapper.readme = "# Illustrated guide\nKeep defaults".into();
        let mut b = crate::import(
            "CUDA",
            json!({"9":{"class_type":"OutputCUDA","inputs":{"enabled":false}}}),
        )
        .unwrap();
        b.wrapper.family_id = a.id.clone();
        b.requirements.compatibility = "cuda".into();
        a.layout.inputs.push(studio_contracts::InputLayout {
            node_id: "7".into(),
            input: "enabled".into(),
            label: "Enabled".into(),
            optional: true,
            group: String::new(),
            hidden: false,
            advanced: false,
            media_role: None,
        });
        a.last_target = Some("private-node".into());
        let encoded = export(&[a.clone(), b.clone()]).unwrap();
        assert!(!encoded.to_string().contains("private-node"));
        let decoded = import(encoded).unwrap();
        assert_eq!(decoded[0].graph, a.graph);
        assert_eq!(decoded[1].graph, b.graph);
        assert_eq!(decoded[0].wrapper.readme, a.wrapper.readme);
        assert!(decoded[0].layout.inputs[0].optional);
        let mut bad = export(&[a]).unwrap();
        bad["workflows"][0]["graph"]["7"]["inputs"]["enabled"] = json!(true);
        assert!(import(bad).is_err());
    }
    #[test]
    fn rejects_unsafe_illustration_and_future_format() {
        let mut w =
            crate::import("fixture", json!({"1":{"class_type":"Output","inputs":{}}})).unwrap();
        w.wrapper.illustration = Some("data:image/svg+xml,<script/>".into());
        assert!(export(&[w]).is_err());
        assert!(import(json!({"format":FORMAT,"schemaVersion":99})).is_err());
    }
    #[test]
    fn rejects_a_portable_binding_to_an_internal_link() {
        let mut w = crate::import("fixture", json!({"1":{"class_type":"LoadImage","inputs":{"image":"x.png"}},"2":{"class_type":"SaveImage","inputs":{"images":["1",0]}}})).unwrap();
        w.bindings.push(studio_contracts::Binding {
            semantic: "Invalid internal link".into(),
            node_id: "2".into(),
            input: "images".into(),
            value_type: "json".into(),
            media: None,
        });
        assert!(import(export(&[w]).unwrap()).is_err());
    }
}
