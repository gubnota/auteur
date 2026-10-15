//! Shipped, immutable examples. Pinned movie copies remain ordinary editable wrappers.
use project_core::Result;
use serde_json::{Value, json};
use studio_contracts::{InstallArtifact, Workflow};

pub const REMBG_ARCHIVE: &[u8] = include_bytes!("../../../examples/catalogue/mymovie-rembg.tar.gz");
pub fn rembg_artifact() -> Result<InstallArtifact> {
    Ok(serde_json::from_str(include_str!(
        "../../../examples/catalogue/rembg-plugin.json"
    ))?)
}
pub fn catalogue() -> Result<Vec<Workflow>> {
    let common = "## Connect once\n1. Run all cells in the bundled Colab or Kaggle notebook on a GPU runtime. The notebook installs the base runtime and agent, without workflow weights.\n2. Connections → Connect notebook GPUs: copy the printed relay URL and node ID. Enable Temporary Cloudflare tunnel for a trycloudflare.com address. Keep the notebook running.\n3. Select Run and install on in this workflow window and check its address/node ID. Open Setup → Initialize on your instance. Review dependency destinations, download sizes and licenses.\n4. Install & prepare on your instance. The agent downloads verified models/plugins/wheels, restarts its managed idle ComfyUI if necessary, prepares the original graph, publishes it in this instance’s library and verifies a weight-free canary with collected bytes. No extra Jupyter commands are needed.\n5. Create a job, choose media and destination, Add to queue, then Run selected in Jobs. Results appear as render-tagged Library media.\n## Sessions and custom dependencies\nChecksummed files already present are reused. Readiness belongs to this runtime/session and workflow version; a fresh Colab/Kaggle runtime needs checking again. Kaggle uses independent GPU workers sharing model storage. Never restart while either worker has jobs.\nFor custom LoRAs/models, add exact source, SHA256, byte size, license and category in Setup. For plugins, add an immutable archive and commit; declare exact Python package pins. The agent resolves compatible binary wheels during review. Unsupported wheels or incomplete pins block initialization with a reason. External unmanaged ComfyUI remains read-only.\n## Illustration\nThe preview is an original illustration of this example, not a claimed generation result.";
    let definitions = [
        (
            "00000000-0000-4000-8000-000000000101",
            "connection-test",
            "Connection & collection test",
            "cpu-canary",
            "universal",
            "No input media · no weights · core nodes",
            "A 64×64 solid-color output verifies execution and result collection before downloading any models.",
            include_str!("../../../examples/catalogue/connection-test.data.txt"),
        ),
        (
            "00000000-0000-4000-8000-000000000102",
            "sd15-t4",
            "SD 1.5 · T4 starter",
            "sd15-t4",
            "cuda",
            "Text prompt · 512×512 · batch 1 · 12 steps",
            "Small GPU workload, large first download: 4.27 GB checkpoint (3.97 GiB). No custom plugins or LoRAs. Intended for a T4 CUDA worker, not the Apple Silicon variant.",
            include_str!("../../../examples/catalogue/sd15-t4.data.txt"),
        ),
        (
            "00000000-0000-4000-8000-000000000103",
            "background-removal",
            "Tiny background removal",
            "rembg-u2netp",
            "universal",
            "One image · foreground + mask outputs",
            "CPU background removal with the original MyMovieU2netp plugin and 4.57 MB u2netp ONNX model. Also runs on a CUDA notebook; inference is intentionally CPU. Binary onnxruntime and all dependencies are resolved for the node's Python/OS during review.",
            include_str!("../../../examples/catalogue/background-removal.data.txt"),
        ),
    ];
    let mut result = vec![];
    for (id, example, name, source, compatibility, input_help, description, illustration) in
        definitions
    {
        let editor: Value = serde_json::from_str(match source {
            "cpu-canary" => include_str!("../../../examples/workflows/cpu-canary_editor.json"),
            "sd15-t4" => include_str!("../../../examples/workflows/sd15-t4_editor.json"),
            _ => include_str!("../../../examples/workflows/rembg-u2netp_editor.json"),
        })?;
        let mut w = crate::import_source(name, editor)?;
        w.id = id.into();
        w.media_kind = "image".into();
        w.requirements.compatibility = compatibility.into();
        w.wrapper = serde_json::from_value(
            json!({"exampleId":example,"familyId":id,"variantName":"Example v1","collection":"Getting started","description":description,"readme":format!("# {name}\n{description}\n{input_help}\n{common}"),"illustration":illustration.trim(),"os":if compatibility=="cuda"{"linux"}else{"any"},"architecture":"any","precision":"default","pythonPackages":if example=="background-removal"{vec!["onnxruntime==1.23.2"]}else{vec![]}}),
        )?;
        if example == "sd15-t4" {
            w.requirements
                .artifacts
                .push(serde_json::from_str(include_str!(
                    "../../../examples/catalogue/sd15-model.json"
                ))?);
        }
        if example == "background-removal" {
            w.requirements
                .artifacts
                .push(serde_json::from_str(include_str!(
                    "../../../examples/provision/rembg-u2netp.model.json"
                ))?);
            w.requirements.artifacts.push(rembg_artifact()?);
            w.bindings = serde_json::from_value(
                json!([{"semantic":"image","nodeId":"1","input":"image","valueType":"string","media":{"kind":"image","role":"sourceImage","order":0}}]),
            )?;
            w.layout.inputs = serde_json::from_value(
                json!([{"nodeId":"1","input":"image","label":"Source image","group":"Media","hidden":false,"advanced":false,"mediaRole":"sourceImage"}]),
            )?;
            w.layout.outputs = serde_json::from_value(
                json!([{"nodeId":"3","label":"White background","selected":true},{"nodeId":"5","label":"Foreground mask","selected":true}]),
            )?;
        }
        w.wrapper.validate()?;
        for a in &w.requirements.artifacts {
            a.validate()?;
        }
        result.push(w);
    }
    Ok(result)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn examples_are_portable_and_have_stable_identity() {
        let a = catalogue().unwrap();
        let b = catalogue().unwrap();
        assert_eq!(a.len(), 3);
        for (a, b) in a.iter().zip(b) {
            assert_eq!(a.id, b.id);
            assert_eq!(a.version, b.version);
            assert!(a.editor_graph.is_some());
            assert!(
                a.wrapper
                    .illustration
                    .as_ref()
                    .unwrap()
                    .starts_with("data:image/png;base64,")
            );
            crate::for_setup(a, "new-node").unwrap();
            assert_eq!(
                crate::bundle::import(crate::bundle::export(&[a.clone()]).unwrap()).unwrap()[0]
                    .version,
                a.version
            );
        }
        use sha2::{Digest, Sha256};
        assert_eq!(
            format!("{:x}", Sha256::digest(REMBG_ARCHIVE)),
            rembg_artifact().unwrap().sha256
        );
    }
}
