use project_core::{Result, id};
use serde_json::Value;
use sha2::{Digest, Sha256};
use studio_contracts::{Binding, Workflow};
pub fn validate_graph(graph: &Value) -> Result<()> {
    let nodes = graph.as_object().ok_or("API workflow must be an object")?;
    if nodes.is_empty() || nodes.contains_key("nodes") {
        return Err("Export a ComfyUI API-format graph, not the editor graph".into());
    }
    for (id, node) in nodes {
        if node["class_type"].as_str().is_none() || node["inputs"].as_object().is_none() {
            return Err(format!("Node {id} lacks class_type/inputs").into());
        }
        for value in node["inputs"].as_object().unwrap().values() {
            if let Some(link) = value.as_array() {
                if link.len() == 2 && link[0].is_string() && link[1].is_number() {
                    if !nodes.contains_key(link[0].as_str().unwrap()) || link[1].as_u64().is_none()
                    {
                        return Err(format!("Broken link in node {id}").into());
                    }
                }
            }
        }
    }
    Ok(())
}
pub fn import(name: &str, graph: Value) -> Result<Workflow> {
    validate_graph(&graph)?;
    let version = format!("{:x}", Sha256::digest(serde_json::to_vec(&graph)?));
    Ok(Workflow {
        id: id(),
        name: name.into(),
        version,
        graph,
        bindings: vec![],
    })
}
pub fn bind(graph: &Value, bindings: &[Binding], values: &Value) -> Result<Value> {
    let mut graph = graph.clone();
    for b in bindings {
        let input = graph
            .get_mut(&b.node_id)
            .and_then(|n| n.get_mut("inputs"))
            .and_then(|n| n.get_mut(&b.input))
            .ok_or("Binding node/input missing")?;
        let value = values
            .get(&b.semantic)
            .ok_or("Bound semantic input missing")?;
        match b.value_type.as_str() {
            "string" if value.is_string() => {}
            "number" if value.is_number() => {}
            "boolean" if value.is_boolean() => {}
            "json" => {
                let _: Value = serde_json::from_str(
                    value.as_str().ok_or("JSON binding needs serialized JSON")?,
                )?;
            }
            _ => return Err("Binding value type mismatch".into()),
        }
        if input.is_array() {
            return Err("Cannot overwrite a graph link".into());
        }
        *input = value.clone();
    }
    validate_graph(&graph)?;
    Ok(graph)
}
pub fn composed(project: &str, scene: Option<&str>, frame: &str, include: bool) -> String {
    [
        if include {
            scene.unwrap_or(project)
        } else {
            ""
        },
        frame,
    ]
    .into_iter()
    .filter(|s| !s.trim().is_empty())
    .collect::<Vec<_>>()
    .join("\n")
}

/// Assigned scene cast is inherited; frame cast adds extra participants.
/// Return only explicit image slots and reject unrelated assets before uploading.
pub fn character_reference_inputs<'a>(
    p: &'a studio_contracts::Project,
    scene: &studio_contracts::Scene,
    frame: &studio_contracts::Frame,
    bindings: &[Binding],
    values: &Value,
) -> Result<Vec<(String, &'a studio_contracts::Asset)>> {
    let references = character_references(p, scene, frame);
    bindings
        .iter()
        .filter(|b| b.semantic.starts_with("characterReference"))
        .map(|b| {
            let slot = b
                .semantic
                .strip_prefix("characterReference")
                .and_then(|s| s.parse::<usize>().ok())
                .filter(|n| (1..=4).contains(n))
                .ok_or("Unknown character reference slot")?;
            if b.value_type != "string" {
                return Err("Character reference slots must bind string image filenames".into());
            }
            let a = if let Some(value) = values.get(&b.semantic) {
                let id = value.as_str().ok_or("Select a character reference image")?;
                references.iter().find(|a| a.id == id).copied()
            } else {
                references.get(slot - 1).copied()
            }
            .ok_or("Assign a character with a reference image to this scene or keyframe")?;
            Ok((b.semantic.clone(), a))
        })
        .collect()
}
pub fn character_references<'a>(
    p: &'a studio_contracts::Project,
    scene: &studio_contracts::Scene,
    frame: &studio_contracts::Frame,
) -> Vec<&'a studio_contracts::Asset> {
    let mut references = vec![];
    for c in p
        .characters
        .iter()
        .filter(|c| scene.character_ids.contains(&c.id) || frame.character_ids.contains(&c.id))
    {
        for id in &c.asset_ids {
            if let Some(a) = p.assets.iter().find(|a| &a.id == id && a.kind == "image") {
                if !references
                    .iter()
                    .any(|old: &&studio_contracts::Asset| old.id == a.id)
                {
                    references.push(a);
                }
            }
        }
    }
    references
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn imports_preserve_unknown_metadata_and_serialized_motion_json() {
        let raw = json!({"1":{"class_type":"Motion","inputs":{"context":"{\"tracks\":[{\"duration\":5}]}"},"_meta":{"privateExtension":"preserve"}},"2":{"class_type":"Output","inputs":{"image":["1",0]}}});
        let w = import("Motion", raw.clone()).unwrap();
        assert_eq!(w.graph, raw);
        let bindings = vec![Binding {
            semantic: "motion".into(),
            node_id: "1".into(),
            input: "context".into(),
            value_type: "json".into(),
        }];
        let result = bind(&w.graph, &bindings, &json!({"motion":"{\"tracks\":[]}"})).unwrap();
        assert_eq!(result["1"]["inputs"]["context"], "{\"tracks\":[]}");
        assert_eq!(w.graph, raw);
        assert!(bind(&raw, &bindings, &json!({"motion":"broken"})).is_err());
        let link = vec![Binding {
            semantic: "image".into(),
            node_id: "2".into(),
            input: "image".into(),
            value_type: "string".into(),
        }];
        assert!(bind(&raw, &link, &json!({"image":"x"})).is_err());
        assert!(
            validate_graph(&json!({"1":{"class_type":"Output","inputs":{"x":["missing",0]}}}))
                .is_err()
        );
    }
    #[test]
    fn scene_override_and_opt_out_compose_without_mutating_prompts() {
        assert_eq!(
            composed("movie", Some("scene"), "frame", true),
            "scene\nframe"
        );
        assert_eq!(composed("movie", None, "frame", true), "movie\nframe");
        assert_eq!(composed("movie", Some("scene"), "frame", false), "frame");
    }
    #[test]
    fn scene_references_inherit_deduplicate_and_only_bind_assigned_images() {
        let dir = tempfile::tempdir().unwrap();
        let mut p =
            project_core::ProjectStore::create(&dir.path().join("Film.mymovie"), "Film", true)
                .unwrap()
                .read()
                .unwrap();
        p.assets.push(studio_contracts::Asset {
            id: "ref".into(),
            name: "Character.png".into(),
            path: "media/originals/ref.png".into(),
            sha256: "a".repeat(64),
            kind: "image".into(),
            size: 1,
            source_path: None,
        });
        p.characters[0].asset_ids = vec!["ref".into(), "ref".into()];
        p.episodes[0].scenes[0].character_ids = vec![p.characters[0].id.clone()];
        let scene = &p.episodes[0].scenes[0];
        let frame = &scene.shots[0].frames[0];
        assert_eq!(character_references(&p, scene, frame).len(), 1);
        let mut bindings = vec![Binding {
            semantic: "characterReference1".into(),
            node_id: "1".into(),
            input: "image".into(),
            value_type: "string".into(),
        }];
        assert_eq!(
            character_reference_inputs(&p, scene, frame, &bindings, &json!({})).unwrap()[0]
                .1
                .id,
            "ref"
        );
        assert!(
            character_reference_inputs(
                &p,
                scene,
                frame,
                &bindings,
                &json!({"characterReference1":"unassigned"})
            )
            .is_err()
        );
        bindings[0].value_type = "number".into();
        assert!(character_reference_inputs(&p, scene, frame, &bindings, &json!({})).is_err());
        bindings[0].value_type = "string".into();
        bindings[0].semantic = "characterReference2".into();
        assert!(character_reference_inputs(&p, scene, frame, &bindings, &json!({})).is_err());
    }
}
