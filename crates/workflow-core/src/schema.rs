//! Forms describe literals only. Internal graph links never become upload fields.
use project_core::Result;
use serde_json::Value;
use studio_contracts::{Binding, MediaBinding, WorkflowInput, WorkflowOutput};
// V3 dynamic-combo children are serialized as dotted literals. Describe only
// the active branch; switching branches requires a new frontend compilation.
fn field_spec<'a>(definition: &'a Value, field: &str, values: &Value) -> Option<&'a Value> {
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
    let mut image_order = 0;
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
            let (control, value_type) = if media.is_some() {
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
            let media = media.map(|kind| {
                let order = media_order;
                media_order += 1;
                MediaBinding {
                    kind: kind.into(),
                    role: if kind == "image" {
                        let index = image_order;
                        image_order += 1;
                        if index == 0 {
                            "sourceImage"
                        } else {
                            "referenceImage"
                        }
                    } else {
                        kind
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
                required: definition["input"]["required"].get(field).is_some(),
                control: control.into(),
                default: value.clone(),
                choices: choices.cloned().unwrap_or_default(),
                min: options["min"].as_f64(),
                max: options["max"].as_f64(),
                step: options["step"].as_f64(),
                advanced: !matches!(control, "media" | "multiline"),
                group: String::new(),
                hidden: false,
            });
        }
    }
    Ok((inputs, outputs))
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
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
            "sourceImage"
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
            "sourceImage"
        );
        assert_eq!(
            fields[1].binding.media.as_ref().unwrap().role,
            "referenceImage"
        );
        assert_eq!(outputs[0].node_id, "3");
    }
}
