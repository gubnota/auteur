pub mod bundle;
pub mod examples;
pub mod schema;
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
        inputs: vec![],
        outputs: vec![],
        profiles: vec![],
        last_target: None,
        layout: Default::default(),
        wrapper: Default::default(),
        bindings: vec![],
        media_kind: "other".into(),
        editor_graph: None,
        editor_hash: None,
        deployments: vec![],
        requirements: studio_contracts::WorkflowRequirements {
            compatibility: "unspecified".into(),
            artifacts: vec![],
        },
    })
}
/// An editor source is retained even when its target is offline/unprepared.
pub fn import_source(name: &str, source: Value) -> Result<Workflow> {
    if source["nodes"].is_array() {
        if source["nodes"].as_array().unwrap().is_empty() {
            return Err("Empty editor workflow".into());
        }
        let mut w = import(
            name,
            serde_json::json!({"placeholder":{"class_type":"PendingCompilation","inputs":{}}}),
        )?;
        w.graph = serde_json::json!({});
        w.version = format!("{:x}", Sha256::digest(serde_json::to_vec(&source)?));
        w.editor_hash = Some(w.version.clone());
        w.editor_graph = Some(source);
        Ok(w)
    } else {
        import(name, source)
    }
}
/// Dependency review accepts an unprepared editor source; execution never does.
pub fn for_setup(w: &Workflow, connection: &str) -> Result<Workflow> {
    if w.editor_graph.is_some()
        && w.graph.as_object().is_some_and(|g| g.is_empty())
        && !w.profiles.iter().any(|p| p.connection_id == connection)
    {
        let source = w.editor_graph.as_ref().unwrap();
        let imported = import_source(&w.name, source.clone())?;
        if imported.version != w.version || imported.editor_hash != w.editor_hash {
            return Err("Editor source differs from immutable version".into());
        }
        return Ok(w.clone());
    }
    for_target(w, connection)
}
pub fn for_target(w: &Workflow, connection: &str) -> Result<Workflow> {
    let mut result = w.clone();
    if let Some(profile) = w.profiles.iter().find(|p| p.connection_id == connection) {
        if profile.source_hash != w.editor_hash.as_ref().unwrap_or(&w.version).as_str() {
            return Err("Compiled source changed; prepare workflow again".into());
        }
        validate_graph(&profile.graph)?;
        if profile.api_hash != format!("{:x}", Sha256::digest(serde_json::to_vec(&profile.graph)?))
        {
            return Err("Compiled API hash mismatch".into());
        }
        result.graph = profile.graph.clone();
        result.version = profile.api_hash.clone();
        result.inputs = profile.inputs.clone();
        result.outputs = profile.outputs.clone();
        for descriptor in &result.inputs {
            if descriptor.control != "unsupported"
                && !result.bindings.iter().any(|b| {
                    b.node_id == descriptor.binding.node_id && b.input == descriptor.binding.input
                })
            {
                result.bindings.push(descriptor.binding.clone());
            }
        }
    } else if w.graph.as_object().is_none_or(|g| g.is_empty()) {
        return Err("Prepare this editor workflow on the selected execution target first".into());
    }
    for input in &mut result.inputs {
        if let Some(binding) = result
            .bindings
            .iter()
            .find(|b| b.node_id == input.binding.node_id && b.input == input.binding.input)
        {
            input.binding = binding.clone();
        }
        if let Some(layout) = w
            .layout
            .inputs
            .iter()
            .find(|l| l.node_id == input.binding.node_id && l.input == input.binding.input)
        {
            input.label = layout.label.clone();
            input.group = layout.group.clone();
            input.hidden = layout.hidden;
            input.advanced = layout.advanced;
            if let (Some(media), Some(role)) = (&mut input.binding.media, &layout.media_role) {
                media.role = role.clone();
            }
        }
    }
    for binding in &mut result.bindings {
        if let Some(role) = w
            .layout
            .inputs
            .iter()
            .find(|l| l.node_id == binding.node_id && l.input == binding.input)
            .and_then(|l| l.media_role.as_ref())
        {
            if let Some(media) = &mut binding.media {
                media.role = role.clone();
            }
        }
    }
    for output in &mut result.outputs {
        if let Some(layout) = w
            .layout
            .outputs
            .iter()
            .find(|l| l.node_id == output.node_id)
        {
            output.label = layout.label.clone();
        }
    }
    Ok(result)
}
pub fn preset(kind: &str) -> Result<Workflow> {
    let (name, api, editor) = match kind {
        "text-to-image" => (
            "Text to image",
            include_str!("../../../examples/workflows/text-to-image_api.json"),
            include_str!("../../../examples/workflows/text-to-image_editor.json"),
        ),
        "masked-edit" => (
            "Masked clothing-region edit",
            include_str!("../../../examples/workflows/masked-edit_api.json"),
            include_str!("../../../examples/workflows/masked-edit_editor.json"),
        ),
        "cpu-canary" => (
            "CPU connection canary",
            include_str!("../../../examples/workflows/cpu-canary_api.json"),
            include_str!("../../../examples/workflows/cpu-canary_editor.json"),
        ),
        _ => return Err("Unknown image preset".into()),
    };
    let mut w = import(name, serde_json::from_str(api)?)?;
    attach_editor(&mut w, serde_json::from_str(editor)?)?;
    w.media_kind = "image".into();
    let fields = match kind {
        "text-to-image" => vec![
            ("positivePrompt", "2", "text", "string"),
            ("negativePrompt", "3", "text", "string"),
            ("seed", "5", "seed", "number"),
            ("width", "4", "width", "number"),
            ("height", "4", "height", "number"),
        ],
        "masked-edit" => vec![
            ("positivePrompt", "2", "text", "string"),
            ("negativePrompt", "3", "text", "string"),
            ("seed", "5", "seed", "number"),
            ("image", "8", "image", "string"),
            ("mask", "9", "image", "string"),
        ],
        _ => vec![],
    };
    w.bindings = fields
        .into_iter()
        .map(|(s, n, i, t)| Binding {
            semantic: s.into(),
            node_id: n.into(),
            input: i.into(),
            value_type: t.into(),
            media: None,
        })
        .collect();
    Ok(w)
}
/// Preserve the supplied editor document; never infer custom-node widget ordering.
pub fn attach_editor(workflow: &mut Workflow, editor: Value) -> Result<()> {
    if workflow.editor_graph.is_some() {
        return Err("Editor original is already attached; import a new workflow version".into());
    }
    let nodes = editor["nodes"]
        .as_array()
        .ok_or("Choose a ComfyUI editor-format export")?;
    for (id, api) in workflow.graph.as_object().ok_or("Invalid API graph")? {
        if !nodes.iter().any(|n| {
            n["id"]
                .as_str()
                .map(str::to_owned)
                .or_else(|| n["id"].as_u64().map(|x| x.to_string()))
                .as_deref()
                == Some(id)
                && n["type"] == api["class_type"]
        }) {
            return Err(format!(
                "Editor/API mismatch at node {id}; export both from the same workflow"
            )
            .into());
        }
    }
    workflow.editor_hash = Some(format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&editor)?)
    ));
    workflow.editor_graph = Some(editor);
    Ok(())
}
/// Credentials come from the current vault identity; the destination comes from the receipt.
pub fn frozen_connection(
    job: &studio_contracts::Job,
    current: &studio_contracts::Connection,
) -> Result<studio_contracts::Connection> {
    let v = &job.snapshot["connection"];
    if v["id"].as_str() != Some(&current.id) {
        return Err("Connection receipt identity mismatch".into());
    }
    let mut c = current.clone();
    c.kind = v["kind"].as_str().ok_or("Receipt kind missing")?.into();
    c.url = v["url"].as_str().ok_or("Receipt endpoint missing")?.into();
    c.deployment_id = v["deploymentId"].as_str().map(str::to_owned);
    c.api_family = v["apiFamily"].as_str().map(str::to_owned);
    Ok(c)
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
            "json" => {}
            _ => return Err("Binding value type mismatch".into()),
        }
        if input
            .as_array()
            .is_some_and(|a| a.len() == 2 && a[0].is_string() && a[1].is_number())
        {
            return Err("Cannot overwrite a graph link".into());
        }
        *input = if b.value_type == "json" && input.is_string() {
            // Custom nodes with serialized JSON widgets retain that wire format.
            if let Some(s) = value.as_str() {
                let _: Value = serde_json::from_str(s)?;
                value.clone()
            } else {
                Value::String(serde_json::to_string(value)?)
            }
        } else {
            value.clone()
        };
    }
    validate_graph(&graph)?;
    Ok(graph)
}
/// Job drafts store parsed JSON values, including JSON strings and null.
/// Legacy bind callers may still provide serialized JSON widget text.
pub fn bind_exact(graph: &Value, bindings: &[Binding], values: &Value) -> Result<Value> {
    let mut wire = values.clone();
    for b in bindings {
        if b.value_type == "json" && graph[&b.node_id]["inputs"][&b.input].is_string() {
            let value = values
                .get(&b.semantic)
                .ok_or("Bound semantic input missing")?;
            wire[&b.semantic] = Value::String(serde_json::to_string(value)?);
        }
    }
    bind(graph, bindings, &wire)
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
                .filter(|n| *n > 0)
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
            media: None,
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
            media: None,
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
            archived_at: None,
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
            media: None,
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

/// Pure resolution: media placeholders are previews, never provider filenames.
pub fn resolve_item(
    p: &studio_contracts::Project,
    draft: &studio_contracts::JobDraft,
    item: &studio_contracts::JobItem,
) -> Result<Value> {
    use serde_json::json;
    if !item.input_errors.is_empty() {
        return Err(format!(
            "Repair invalid draft inputs: {}",
            item.input_errors
                .values()
                .cloned()
                .collect::<Vec<_>>()
                .join("; ")
        )
        .into());
    }
    let target = p
        .episodes
        .iter()
        .flat_map(|e| &e.scenes)
        .flat_map(|s| {
            s.shots
                .iter()
                .flat_map(move |sh| sh.frames.iter().map(move |f| (s, f)))
        })
        .find(|(_, f)| f.id == draft.frame_id);
    let standalone = draft.context.kind == "standalone";
    if standalone && !draft.frame_id.is_empty() {
        return Err("Standalone drafts must have no target keyframe".into());
    }
    if !standalone && target.is_none() {
        return Err("Target keyframe missing".into());
    }
    let cast: Vec<String> = if standalone {
        draft.context.character_ids.clone()
    } else {
        let (scene, frame) = target.unwrap();
        scene
            .character_ids
            .iter()
            .chain(&frame.character_ids)
            .cloned()
            .collect()
    };
    if cast
        .iter()
        .any(|id| !p.characters.iter().any(|c| &c.id == id))
    {
        return Err("Assigned character missing".into());
    }
    let w = p
        .workflows
        .iter()
        .find(|w| w.id == item.workflow_id)
        .ok_or("Workflow missing")?;
    let w = for_target(w, &item.connection_id)?;
    validate_graph(&w.graph)?;
    let bindings = item.bindings.as_ref().unwrap_or(&w.bindings);
    let mut seen = std::collections::HashSet::new();
    let mut fields = std::collections::HashSet::new();
    let mut semantic = json!({});
    let mut media = serde_json::Map::new();
    let references: Vec<_> = p
        .assets
        .iter()
        .filter(|a| {
            a.kind == "image"
                && p.characters
                    .iter()
                    .any(|c| cast.contains(&c.id) && c.asset_ids.contains(&a.id))
        })
        .collect();
    for b in bindings {
        if b.semantic.trim().is_empty()
            || !seen.insert(&b.semantic)
            || !fields.insert((&b.node_id, &b.input))
        {
            return Err("Bindings need unique semantic names and node inputs".into());
        }
        let default = w
            .graph
            .get(&b.node_id)
            .and_then(|n| n["inputs"].get(&b.input))
            .ok_or("Binding input missing")?;
        let is_media = b.media.is_some()
            || matches!(b.semantic.as_str(), "image" | "mask")
            || b.semantic.starts_with("characterReference");
        if is_media {
            if b.value_type != "string" {
                return Err("Media input must bind a string filename".into());
            }
            let asset = if let Some(id) = item.assets.get(&b.semantic) {
                p.assets.iter().find(|a| &a.id == id)
            } else if b.semantic == "image" {
                p.assets
                    .iter()
                    .find(|a| target.and_then(|(_, f)| f.asset_id.as_ref()) == Some(&a.id))
            } else if b.semantic.starts_with("characterReference") {
                let slot = b
                    .semantic
                    .strip_prefix("characterReference")
                    .and_then(|s| s.parse::<usize>().ok())
                    .filter(|n| *n > 0)
                    .ok_or("Unknown character reference slot")?;
                references.get(slot - 1).copied()
            } else {
                None
            };
            let optional = w
                .layout
                .inputs
                .iter()
                .any(|l| l.node_id == b.node_id && l.input == b.input && l.optional);
            let asset = match asset {
                Some(asset) => asset,
                None if optional && !item.assets.contains_key(&b.semantic) => {
                    semantic[&b.semantic] = default.clone();
                    continue;
                }
                None => {
                    return Err(format!("Select media for {} before generation", b.semantic).into());
                }
            };
            if asset.archived_at.is_some() {
                return Err(
                    format!("Restore {} from Library Trash before queueing", asset.name).into(),
                );
            }
            let kind = b.media.as_ref().map(|m| m.kind.as_str()).unwrap_or("image");
            if asset.kind != kind {
                return Err(format!("{} requires {kind} media", b.semantic).into());
            }
            if b.media.as_ref().is_some_and(|m| {
                !["image", "video", "audio"].contains(&m.kind.as_str())
                    || (m.role == "mask" && m.kind != "image")
            }) {
                return Err("Unsupported media binding kind/role".into());
            }
            if (b.semantic.starts_with("characterReference")
                || b.media
                    .as_ref()
                    .is_some_and(|m| m.role == "characterReference"))
                && !references.iter().any(|a| a.id == asset.id)
            {
                return Err(
                    "Character reference must belong to the assigned scene/keyframe cast".into(),
                );
            }
            media.insert(b.semantic.clone(), serde_json::to_value(asset)?);
            semantic[&b.semantic] =
                json!(format!("asset:{} (provider filename pending)", asset.id));
        } else {
            semantic[&b.semantic] = if let Some(value) = item.values.get(&b.semantic) {
                value.clone()
            } else if b.semantic == "positivePrompt" || b.semantic == "negativePrompt" {
                let positive = b.semantic == "positivePrompt";
                let common = if positive {
                    &p.positive_prompt
                } else {
                    &p.negative_prompt
                };
                json!(if let Some((scene, frame)) = target {
                    composed(
                        common,
                        if positive {
                            scene.positive_prompt.as_deref()
                        } else {
                            scene.negative_prompt.as_deref()
                        },
                        if positive {
                            &frame.positive_prompt
                        } else {
                            &frame.negative_prompt
                        },
                        frame.include_common,
                    )
                } else {
                    common.clone()
                })
            } else if b.value_type == "json" && default.is_string() {
                serde_json::from_str(default.as_str().unwrap())?
            } else {
                default.clone()
            };
        }
    }
    for descriptor in &w.inputs {
        let alias = bindings
            .iter()
            .find(|b| {
                b.node_id == descriptor.binding.node_id && b.input == descriptor.binding.input
            })
            .map(|b| &b.semantic)
            .unwrap_or(&descriptor.binding.semantic);
        if let Some(value) = semantic.get(alias) {
            if descriptor.control == "choice" && !descriptor.choices.contains(value) {
                return Err(format!("{}: choose a listed value", descriptor.label).into());
            }
            if let Some(number) = value.as_f64() {
                if descriptor.min.is_some_and(|min| number < min)
                    || descriptor.max.is_some_and(|max| number > max)
                {
                    return Err(format!("{}: outside allowed range", descriptor.label).into());
                }
                if descriptor.step == Some(1.0) && number.fract() != 0.0 {
                    return Err(format!("{}: enter a whole number", descriptor.label).into());
                }
            }
        }
    }
    let graph = bind_exact(&w.graph, bindings, &semantic)?;
    Ok(
        json!({"graph":graph,"originalGraph":w.graph,"semantic":semantic,"media":media,
        "compiledProfile":w.profiles.iter().find(|p|p.connection_id==item.connection_id),
        "outputLayout":w.layout.outputs,"outputs":w.outputs,
        "compatibility":w.requirements.compatibility,"requirements":w.requirements,
        "frame":target.map(|(_,f)|f),"sceneId":target.map(|(s,_)|&s.id),"context":draft.context,"bindings":bindings,"draftItem":item,
        "characters":p.characters.iter().filter(|c| cast.contains(&c.id)).collect::<Vec<_>>() }),
    )
}

#[cfg(test)]
mod jobs_tests {
    use super::*;
    use studio_contracts::{Binding, JobDraft, JobItem};
    #[test]
    fn exact_json_literals_prompts_and_repairable_errors() {
        let tmp = tempfile::tempdir().unwrap();
        let mut store =
            project_core::ProjectStore::create(tmp.path().join("draft.mymovie"), "Draft", true)
                .unwrap();
        let mut p = store.read().unwrap();
        let graph = serde_json::json!({"1":{"class_type":"Example","inputs":{"text":"original","seed":4,"enabled":true,"context":"{}","next":["2",0]}},"2":{"class_type":"Input","inputs":{}}});
        let mut w = import("Exact", graph.clone()).unwrap();
        w.bindings = vec![
            Binding {
                semantic: "positivePrompt".into(),
                node_id: "1".into(),
                input: "text".into(),
                value_type: "string".into(),
                media: None,
            },
            Binding {
                semantic: "context".into(),
                node_id: "1".into(),
                input: "context".into(),
                value_type: "json".into(),
                media: None,
            },
            Binding {
                semantic: "seed".into(),
                node_id: "1".into(),
                input: "seed".into(),
                value_type: "number".into(),
                media: None,
            },
            Binding {
                semantic: "enabled".into(),
                node_id: "1".into(),
                input: "enabled".into(),
                value_type: "boolean".into(),
                media: None,
            },
        ];
        let frame = p.episodes[0].scenes[0].shots[0].frames[0].id.clone();
        let item:JobItem=serde_json::from_value(serde_json::json!({"id":project_core::id(),"workflowId":w.id,"connectionId":"local","values":{"positivePrompt":"","context":"literal string","seed":0,"enabled":false}})).unwrap();
        let mut d = JobDraft {
            queued_run_id: None,
            queued_job_ids: vec![],
            id: project_core::id(),
            name: "Exact".into(),
            frame_id: frame,
            context: Default::default(),
            items: vec![item.clone()],
        };
        p.workflows.push(w);
        p.job_drafts.push(d.clone());
        let preview = resolve_item(&p, &d, &item).unwrap();
        assert_eq!(preview["graph"]["1"]["inputs"]["text"], "");
        assert_eq!(
            preview["graph"]["1"]["inputs"]["context"],
            "\"literal string\""
        );
        assert_eq!(preview["graph"]["1"]["inputs"]["enabled"], false);
        assert_eq!(
            preview["graph"]["1"]["inputs"]["next"],
            serde_json::json!(["2", 0])
        );
        assert_eq!(p.workflows[0].graph, graph);
        let mut invalid = item.clone();
        invalid
            .input_errors
            .insert("seed".into(), "Enter a finite number".into());
        invalid.input_text.insert("seed".into(), "oops".into());
        d.items[0] = invalid.clone();
        p.job_drafts[0] = d.clone();
        assert!(resolve_item(&p, &d, &invalid).is_err());
        store.save(p, 0).unwrap();
        drop(store);
        let reopened = project_core::ProjectStore::open(tmp.path().join("draft.mymovie"))
            .unwrap()
            .read()
            .unwrap();
        assert_eq!(reopened.job_drafts[0].items[0].input_text["seed"], "oops");
        assert!(resolve_item(&reopened, &d, &invalid).is_err());
        let mut wrong = item.clone();
        wrong.values["seed"] = serde_json::json!("3");
        assert!(resolve_item(&reopened, &d, &wrong).is_err());
        let mut media = item.clone();
        media.bindings = Some(vec![Binding {
            semantic: "image".into(),
            node_id: "1".into(),
            input: "text".into(),
            value_type: "string".into(),
            media: None,
        }]);
        assert!(resolve_item(&reopened, &d, &media).is_err());
    }
}

#[cfg(test)]
mod profile_tests {
    use super::*;
    use studio_contracts::CompiledProfile;
    #[test]
    fn target_profiles_preserve_sources_merge_aliases_and_reject_tampering() {
        let source = serde_json::json!({"nodes":[{"id":1,"type":"Custom"}],"links":[]});
        let mut w = import_source("Editor".into(), source.clone()).unwrap();
        assert!(for_target(&w, "mac").is_err());
        let graph =
            serde_json::json!({"1":{"class_type":"Custom","inputs":{"width":64,"height":64}}});
        let reg = serde_json::json!({"Custom":{"input":{"required":{"width":["INT",{"min":16,"max":2048,"step":8}],"height":["INT"]}}}});
        let (inputs, outputs) = schema::describe(&graph, &reg).unwrap();
        w.bindings.push(Binding {
            semantic: "customWidth".into(),
            node_id: "1".into(),
            input: "width".into(),
            value_type: "number".into(),
            media: None,
        });
        w.profiles.push(CompiledProfile {
            connection_id: "mac".into(),
            source_hash: w.editor_hash.clone().unwrap(),
            api_hash: format!("{:x}", Sha256::digest(serde_json::to_vec(&graph).unwrap())),
            registry_hash: "registry".into(),
            frontend_hash: "frontend".into(),
            compiler_version: "test".into(),
            graph,
            inputs,
            outputs,
        });
        w.layout.inputs.push(studio_contracts::InputLayout {
            node_id: "1".into(),
            input: "width".into(),
            label: "Image width".into(),
            group: "Dimensions".into(),
            hidden: true,
            advanced: false,
            media_role: None,
            optional: false,
        });
        let prepared = for_target(&w, "mac").unwrap();
        assert_eq!(prepared.bindings.len(), 2);
        assert_eq!(prepared.bindings[0].semantic, "customWidth");
        assert_eq!(prepared.inputs[1].label, "Image width");
        assert_eq!(prepared.inputs[1].group, "Dimensions");
        assert!(prepared.inputs[1].hidden);
        assert_eq!(w.editor_graph, Some(source));
        assert!(w.graph.as_object().unwrap().is_empty());
        assert!(for_target(&w, "other").is_err());
        w.profiles[0].graph["1"]["inputs"]["width"] = serde_json::json!(128);
        assert!(
            for_target(&w, "mac")
                .unwrap_err()
                .to_string()
                .contains("hash mismatch")
        );
    }
}
