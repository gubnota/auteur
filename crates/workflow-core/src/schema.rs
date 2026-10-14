//! Forms describe literals only. Internal graph links never become upload fields.
use project_core::Result;
use serde_json::Value;
use studio_contracts::{Binding, MediaBinding, WorkflowInput, WorkflowOutput};
// V3 dynamic-combo children are serialized as dotted literals. Describe only
// the active branch; switching branches requires a new frontend compilation.
pub fn field_spec<'a>(definition: &'a Value, field: &str, values: &Value) -> Option<&'a Value> {
    if let Some(spec) = definition["required"]
        .get(field)
        .or_else(|| definition["optional"].get(field))
    {
        return Some(spec);
    }
    let (parent, child) = field.split_once('.')?;
    let spec = definition["required"]
        .get(parent)
        .or_else(|| definition["optional"].get(parent))?;
    if spec[0] != "COMFY_DYNAMICCOMBO_V3" {
        return None;
    }
    let selected = values.get(parent)?;
    let branch = spec[1]["options"]
        .as_array()?
        .iter()
        .find(|o| &o["key"] == selected)?;
    field_spec(&branch["inputs"], child, &serde_json::json!({}))
}
pub fn describe(
    graph: &Value,
    registry: &Value,
) -> Result<(Vec<WorkflowInput>, Vec<WorkflowOutput>)> {
    super::validate_graph(graph)?;
    let mut inputs = vec![];
    let mut outputs = vec![];
    let mut media_order = 0;
    let mut active = std::collections::HashSet::new();
    let mut pending: Vec<String> = graph
        .as_object()
        .unwrap()
        .iter()
        .filter(|(_, n)| registry[n["class_type"].as_str().unwrap()]["output_node"] == true)
        .map(|(id, _)| id.clone())
        .collect();
    let known_outputs = !pending.is_empty();
    while let Some(id) = pending.pop() {
        if !active.insert(id.clone()) {
            continue;
        }
        for v in graph[&id]["inputs"].as_object().unwrap().values() {
            if let Some(parent) = v
                .as_array()
                .filter(|a| a.len() == 2 && a[1].is_u64())
                .and_then(|a| a[0].as_str())
            {
                if graph.get(parent).is_some() {
                    pending.push(parent.into());
                }
            }
        }
    }
    for (id, node) in graph.as_object().unwrap() {
        let ty = node["class_type"].as_str().unwrap();
        let definition = registry
            .get(ty)
            .ok_or_else(|| format!("Missing node type {ty} ({id})"))?;
        let label = node["_meta"]["title"].as_str().unwrap_or(ty);
        if definition["output_node"] == true {
            outputs.push(WorkflowOutput {
                node_id: id.clone(),
                label: label.into(),
                class_type: ty.into(),
            });
        }
        for (field, value) in node["inputs"].as_object().unwrap() {
            if value.as_array().is_some_and(|a| {
                a.len() == 2
                    && a[0].is_string()
                    && a[1].is_u64()
                    && graph.get(a[0].as_str().unwrap()).is_some()
            }) {
                continue;
            }
            let spec = field_spec(&definition["input"], field, &node["inputs"]);
            let unknown = serde_json::json!(["UNKNOWN"]);
            let spec = spec.unwrap_or(&unknown);
            let options = &spec[1];
            let choices = spec[0].as_array().or_else(|| {
                (spec[0] == "COMBO" && options["multiselect"] != true)
                    .then(|| options["options"].as_array())
                    .flatten()
            });
            let media = ["image", "video", "audio"].into_iter().find(|kind| {
                options[format!("{kind}_upload")] == true
                    || matches!(
                        (*kind, ty, field.as_str()),
                        ("image", "LoadImage" | "LoadImageMask", "image")
                            | ("video", "VHS_LoadVideo", "video")
                            | ("audio", "LoadAudio", "audio")
                    )
            });
            let inactive = known_outputs && !active.contains(id);
            let (control, value_type) = if media.is_some() && inactive {
                ("unsupported", "string")
            } else if media.is_some() {
                ("media", "string")
            } else if choices.is_some() {
                (
                    "choice",
                    if value.is_number() {
                        "number"
                    } else if value.is_boolean() {
                        "boolean"
                    } else {
                        "string"
                    },
                )
            } else {
                match spec[0].as_str() {
                    Some("STRING") => (
                        if options["multiline"] == true {
                            "multiline"
                        } else {
                            "text"
                        },
                        "string",
                    ),
                    Some("INT" | "FLOAT") => ("number", "number"),
                    Some("BOOLEAN") => ("boolean", "boolean"),
                    _ if value.is_object() => ("json", "json"),
                    _ => ("unsupported", "json"),
                }
            };
            let semantic = format!("{id}.{field}");
            let media = media.filter(|_| !inactive).map(|kind| {
                let order = media_order;
                media_order += 1;
                MediaBinding {
                    kind: kind.into(),
                    // Enumeration order says nothing about source/reference semantics.
                    role: match kind {
                        "image" => "referenceImage",
                        "video" => "referenceVideo",
                        _ => "referenceAudio",
                    }
                    .into(),
                    order,
                }
            });
            inputs.push(WorkflowInput {
                binding: Binding {
                    semantic,
                    node_id: id.clone(),
                    input: field.clone(),
                    value_type: value_type.into(),
                    media,
                },
                label: format!("{label} · {field}"),
                required: !inactive && definition["input"]["required"].get(field).is_some(),
                control: control.into(),
                default: value.clone(),
                choices: choices.cloned().unwrap_or_default(),
                min: options["min"].as_f64(),
                max: options["max"].as_f64(),
                step: options["step"].as_f64(),
                advanced: inactive || !matches!(control, "media" | "multiline"),
                group: String::new(),
                hidden: inactive,
            });
        }
    }
    Ok((inputs, outputs))
}
/// Hash only execution/serialization schemas used by this graph. Known runtime
/// inventory lists are validated against the resolved job immediately before submit.
pub fn fingerprint(graph: &Value, registry: &Value) -> Result<String> {
    use sha2::{Digest, Sha256};
    super::validate_graph(graph)?;
    let mut used = serde_json::Map::new();
    for node in graph.as_object().unwrap().values() {
        let ty = node["class_type"].as_str().unwrap();
        let definition = registry
            .get(ty)
            .ok_or_else(|| format!("Missing node type {ty}"))?;
        let mut input = definition["input"].clone();
        for group in ["required", "optional"] {
            if let Some(fields) = input[group].as_object_mut() {
                for (field, spec) in fields {
                    let upload = ["image_upload", "video_upload", "audio_upload"]
                        .iter()
                        .any(|key| spec[1][key] == true);
                    let inventory = upload
                        || matches!(
                            (ty, field.as_str()),
                            ("LoadImage" | "LoadImageMask", "image")
                                | ("LoadAudio", "audio")
                                | ("VHS_LoadVideo", "video")
                                | ("CheckpointLoaderSimple" | "CheckpointLoader", "ckpt_name")
                                | ("UNETLoader", "unet_name")
                                | ("VAELoader", "vae_name")
                                | ("LoraLoader" | "LoraLoaderModelOnly", "lora_name")
                                | ("CLIPLoader", "clip_name")
                                | ("DualCLIPLoader", "clip_name1" | "clip_name2")
                                | (
                                    "TripleCLIPLoader",
                                    "clip_name1" | "clip_name2" | "clip_name3"
                                )
                        );
                    if inventory && spec[0].is_array() {
                        spec[0] = Value::String("RUNTIME_INVENTORY".into());
                        if let Some(options) = spec.get_mut(1).and_then(Value::as_object_mut) {
                            options.remove("default");
                        }
                    }
                    if inventory && spec[0] == "COMBO" {
                        if let Some(options) = spec.get_mut(1).and_then(Value::as_object_mut) {
                            options.remove("default");
                            options.insert(
                                "options".into(),
                                Value::String("RUNTIME_INVENTORY".into()),
                            );
                        }
                    }
                }
            }
        }
        let mut schema = serde_json::Map::new();
        schema.insert("input".into(), input);
        for key in [
            "input_order",
            "output",
            "output_is_list",
            "output_name",
            "output_node",
            "is_input_list",
            "python_module",
        ] {
            if let Some(value) = definition.get(key) {
                schema.insert(key.into(), value.clone());
            }
        }
        used.insert(ty.into(), Value::Object(schema));
    }
    Ok(format!(
        "scope-v1:{:x}",
        Sha256::digest(serde_json::to_vec(&used)?)
    ))
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn inventory_schema_without_options_is_valid() {
        let graph = json!({"1":{"class_type":"VAELoader","inputs":{"vae_name":"a.safetensors"}}});
        let mut registry =
            json!({"VAELoader":{"input":{"required":{"vae_name":[["a.safetensors"]]}}}});
        let initial = fingerprint(&graph, &registry).unwrap();
        registry["VAELoader"]["input"]["required"]["vae_name"][0] = json!(["b.safetensors"]);
        assert_eq!(initial, fingerprint(&graph, &registry).unwrap());
        assert_eq!(describe(&graph, &registry).unwrap().0.len(), 1);
    }
    #[test]
    fn fingerprint_ignores_only_known_inventory_and_unrelated_classes() {
        let graph =
            json!({"1":{"class_type":"LoadImage","inputs":{"image":"a.png","channel":"red"}}});
        let mut registry = json!({"LoadImage":{"input":{"required":{"image":[["a.png"],{"image_upload":true}],"channel":[["red","blue"]]}}}});
        let initial = fingerprint(&graph, &registry).unwrap();
        registry["LoadImage"]["input"]["required"]["image"][0] = json!(["a.png", "new-upload.png"]);
        registry["Unrelated"] = json!({"input":{"required":{"x":["FLOAT"]}}});
        assert_eq!(initial, fingerprint(&graph, &registry).unwrap());
        registry["LoadImage"]["input"]["required"]["channel"][0] = json!(["red", "green"]);
        assert_ne!(initial, fingerprint(&graph, &registry).unwrap());
        registry.as_object_mut().unwrap().remove("LoadImage");
        assert!(fingerprint(&graph, &registry).is_err());
    }
    #[test]
    fn v3_choices_and_active_dynamic_dimensions() {
        let graph = json!({"1":{"class_type":"Resize","inputs":{"resize_type":"dimensions","resize_type.width":512,"resize_type.height":512,"resize_type.crop":"center","scale_method":"area","input":["2",0]}},"2":{"class_type":"LoadAudio","inputs":{"audio":"a.wav"}},"3":{"class_type":"LoadImage","inputs":{"image":"a.png"}}});
        let registry = json!({"Resize":{"input":{"required":{"input":["IMAGE"],"scale_method":["COMBO",{"options":["area","bicubic"]}],"resize_type":["COMFY_DYNAMICCOMBO_V3",{"options":[{"key":"dimensions","inputs":{"required":{"width":["INT",{"min":0,"max":16384,"step":1}],"height":["INT",{"min":0,"max":16384,"step":1}],"crop":["COMBO",{"options":["disabled","center"]}]}}},{"key":"multiplier","inputs":{"required":{"multiplier":["FLOAT"]}}}] }]}}},"LoadAudio":{"input":{"required":{"audio":["STRING",{"audio_upload":true}]}}},"LoadImage":{"input":{"required":{"image":["STRING",{"image_upload":true}]}}}});
        let (fields, _) = describe(&graph, &registry).unwrap();
        let width = fields
            .iter()
            .find(|f| f.binding.input == "resize_type.width")
            .unwrap();
        assert_eq!(width.control, "number");
        assert_eq!(width.max, Some(16384.));
        let crop = fields
            .iter()
            .find(|f| f.binding.input == "resize_type.crop")
            .unwrap();
        assert_eq!(crop.choices, vec![json!("disabled"), json!("center")]);
        assert!(
            !fields
                .iter()
                .any(|f| f.binding.input == "input" || f.binding.input.ends_with("multiplier"))
        );
        assert_eq!(
            fields
                .iter()
                .find(|f| f.binding.input == "image")
                .unwrap()
                .binding
                .media
                .as_ref()
                .unwrap()
                .role,
            "referenceImage"
        );
    }
    #[test]
    fn two_loaders_and_linked_tensor() {
        let graph = json!({"1":{"class_type":"LoadImage","inputs":{"image":"a.png"}},"2":{"class_type":"LoadImage","inputs":{"image":"b.png"}},"3":{"class_type":"SaveImage","inputs":{"images":["1",0],"filename_prefix":"x"}}});
        let registry = json!({"LoadImage":{"input":{"required":{"image":[["a.png","b.png"],{"image_upload":true}]}}},"SaveImage":{"output_node":true,"input":{"required":{"images":["IMAGE"],"filename_prefix":["STRING"]}}}});
        let (fields, outputs) = describe(&graph, &registry).unwrap();
        assert_eq!(fields.len(), 3);
        assert_eq!(
            fields[0].binding.media.as_ref().unwrap().role,
            "referenceImage"
        );
        assert!(fields[1].binding.media.is_none());
        assert!(!fields[1].required);
        assert!(fields[1].hidden && fields[1].advanced);
        assert_eq!(fields[1].default, "b.png");
        assert_eq!(outputs[0].node_id, "3");
    }
}

/// Validate the reusable public form without altering immutable graph literals.
pub fn validate_form(
    graph: &Value,
    bindings: &[Binding],
    layout: &studio_contracts::WorkflowLayout,
) -> Result<()> {
    let mut names = std::collections::HashSet::new();
    let mut fields = std::collections::HashSet::new();
    for b in bindings {
        let v = graph
            .get(&b.node_id)
            .and_then(|n| n["inputs"].get(&b.input))
            .ok_or("Binding field missing; prepare this target first")?;
        if b.semantic.trim().is_empty()
            || b.semantic.len() > 200
            || !names.insert(&b.semantic)
            || !fields.insert((&b.node_id, &b.input))
        {
            return Err("Inputs need unique nonempty names and fields".into());
        }
        if v.as_array().is_some_and(|a| {
            a.len() == 2
                && a[0].is_string()
                && a[1].is_u64()
                && graph.get(a[0].as_str().unwrap()).is_some()
        }) {
            return Err("Internal graph links cannot be bound as literals".into());
        }
        if !["string", "number", "boolean", "json"].contains(&b.value_type.as_str())
            || b.media.as_ref().is_some_and(|m| {
                b.value_type != "string" || !["image", "video", "audio"].contains(&m.kind.as_str())
            })
        {
            return Err("Invalid input type or media kind".into());
        }
    }
    if bindings.len() > 4096
        || layout.inputs.len() > 4096
        || layout.outputs.len() > 1024
        || layout.inputs.iter().any(|l| {
            l.media_role.as_ref().is_some_and(|r| {
                ![
                    "sourceImage",
                    "startFrame",
                    "endFrame",
                    "referenceImage",
                    "mask",
                    "referenceVideo",
                    "referenceAudio",
                    "sourceVideo",
                    "sourceAudio",
                    "characterReference",
                ]
                .contains(&r.as_str())
            })
        })
        || layout
            .outputs
            .iter()
            .any(|l| l.label.trim().is_empty() || l.label.len() > 200)
        || layout
            .inputs
            .iter()
            .any(|l| l.label.trim().is_empty() || l.label.len() > 200 || l.group.len() > 100)
    {
        return Err("Use short, nonempty input labels".into());
    }
    Ok(())
}

#[cfg(test)]
mod form_tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn public_form_rejects_links_duplicate_fields_and_invalid_media_types() {
        let graph = json!({"1":{"class_type":"LoadImage","inputs":{"image":"x.png"}},"2":{"class_type":"SaveImage","inputs":{"images":["1",0]}}});
        let layout = studio_contracts::WorkflowLayout::default();
        let b = Binding {
            semantic: "source".into(),
            node_id: "1".into(),
            input: "image".into(),
            value_type: "string".into(),
            media: Some(MediaBinding {
                kind: "image".into(),
                role: "sourceImage".into(),
                order: 0,
            }),
        };
        assert!(validate_form(&graph, &[b.clone()], &layout).is_ok());
        assert!(
            validate_form(
                &graph,
                &[
                    b.clone(),
                    Binding {
                        semantic: "other".into(),
                        ..b.clone()
                    }
                ],
                &layout
            )
            .is_err()
        );
        assert!(
            validate_form(
                &graph,
                &[Binding {
                    node_id: "2".into(),
                    input: "images".into(),
                    ..b.clone()
                }],
                &layout
            )
            .is_err()
        );
        assert!(
            validate_form(
                &graph,
                &[Binding {
                    value_type: "number".into(),
                    ..b
                }],
                &layout
            )
            .is_err()
        );
    }
}
