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
        w.wrapper.archived_at = None;
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
        w.wrapper.archived_at = None;
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
    fn portable_recipe_survives_export_while_trash_does_not() {
        let mut w = crate::import(
            "recipe",
            json!({"1":{"class_type":"SaveImage","inputs":{}}}),
        )
        .unwrap();
        w.wrapper.archived_at = Some("123".into());
        assert!(
            crate::for_setup(&w, "node")
                .unwrap_err()
                .to_string()
                .contains("Trash")
        );
        assert!(
            crate::for_target(&w, "node")
                .unwrap_err()
                .to_string()
                .contains("Trash")
        );
        w.wrapper.initialization = vec![studio_contracts::InitializationStep {
            name: "Check".into(),
            script: "test -d models".into(),
            check_script: None,
            verify_script: None,
            directory: String::new(),
            timeout_seconds: 30,
            policy: "recipe".into(),
        }];
        let result = import(export(&[w]).unwrap()).unwrap();
        assert!(result[0].wrapper.archived_at.is_none());
        assert_eq!(result[0].wrapper.initialization[0].script, "test -d models");
        let mut invalid = result[0].clone();
        invalid.wrapper.initialization[0].directory = "../escape".into();
        assert!(export(&[invalid]).is_err());
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

/// Portable ZIP containers are bounded and validated in memory; nothing is
/// extracted into an arbitrary filesystem path. Legacy JSON remains readable.
pub fn read_file(path: &std::path::Path) -> Result<Vec<Workflow>> {
    use std::io::Read;
    if std::fs::metadata(path)?.len() > 20 * 1024 * 1024 {
        return Err("Workflow package exceeds 20 MiB".into());
    }
    let bytes = std::fs::read(path)?;
    if bytes.len() > 20 * 1024 * 1024 {
        return Err("Workflow package exceeds 20 MiB".into());
    }
    if bytes.starts_with(b"PK\x03\x04") {
        let mut zip = zip::ZipArchive::new(std::io::Cursor::new(bytes))?;
        if zip.len() != 2 {
            return Err("Expected manifest.json and collection.json".into());
        }
        let mut entries = std::collections::HashMap::new();
        for index in 0..zip.len() {
            let mut entry = zip.by_index(index)?;
            let name = entry.name().to_string();
            if !["manifest.json", "collection.json"].contains(&name.as_str())
                || entry.size() > 16 * 1024 * 1024
                || entries.contains_key(&name)
                || entry
                    .unix_mode()
                    .is_some_and(|mode| mode & 0o170000 == 0o120000)
            {
                return Err("Unsafe workflow package entry".into());
            }
            let mut data = vec![];
            entry
                .by_ref()
                .take(16 * 1024 * 1024 + 1)
                .read_to_end(&mut data)?;
            if data.len() > 16 * 1024 * 1024 {
                return Err("Expanded package entry too large".into());
            }
            entries.insert(name, data);
        }
        let manifest: Value =
            serde_json::from_slice(entries.get("manifest.json").ok_or("Missing manifest")?)?;
        let collection = entries.get("collection.json").ok_or("Missing collection")?;
        if manifest["format"] != "mymovie.workflow-package"
            || manifest["schemaVersion"] != 1
            || manifest["sha256"] != format!("{:x}", Sha256::digest(collection))
        {
            return Err("Invalid package manifest or hash".into());
        }
        import(serde_json::from_slice(collection)?)
    } else {
        let value: Value = serde_json::from_slice(&bytes)?;
        if is_bundle(&value) {
            import(value)
        } else {
            Ok(vec![super::import_source(
                path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Imported workflow"),
                value,
            )?])
        }
    }
}
pub fn write_file(path: &std::path::Path, workflows: &[Workflow]) -> Result<()> {
    use std::io::Write;
    let collection = serde_json::to_vec(&export(workflows)?)?;
    if path.extension().and_then(|e| e.to_str()) != Some("mymovie-workflow") {
        atomic_write(path, &collection)?;
        return Ok(());
    }
    let manifest = json!({"format":"mymovie.workflow-package","schemaVersion":1,"sha256":format!("{:x}",Sha256::digest(&collection))});
    let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    zip.start_file("manifest.json", options)?;
    zip.write_all(&serde_json::to_vec(&manifest)?)?;
    zip.start_file("collection.json", options)?;
    zip.write_all(&collection)?;
    let data = zip.finish()?.into_inner();
    atomic_write(path, &data)?;
    Ok(())
}

fn atomic_write(path: &std::path::Path, data: &[u8]) -> Result<()> {
    use std::io::Write;
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(std::path::Path::new("."));
    let temporary = parent.join(format!(".{}.partial", project_core::id()));
    let result = (|| -> Result<()> {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(data)?;
        file.sync_all()?;
        std::fs::rename(&temporary, path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result
}

#[cfg(test)]
mod archive_tests {
    use super::*;
    #[test]
    fn zip_and_legacy_roundtrip_with_integrity_rejection() {
        let temp = tempfile::tempdir().unwrap();
        let workflow = crate::import(
            "Portable",
            json!({"1":{"class_type":"SaveImage","inputs":{}}}),
        )
        .unwrap();
        let path = temp.path().join("portable.mymovie-workflow");
        write_file(&path, &[workflow.clone()]).unwrap();
        assert!(std::fs::read(&path).unwrap().starts_with(b"PK"));
        assert_eq!(read_file(&path).unwrap()[0].graph, workflow.graph);
        let legacy = temp.path().join("legacy.json");
        write_file(&legacy, &[workflow.clone()]).unwrap();
        assert_eq!(read_file(&legacy).unwrap()[0].id, workflow.id);
        use std::io::Write;
        let mut zip = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file("manifest.json", options).unwrap();
        zip.write_all(
            br#"{"format":"mymovie.workflow-package","schemaVersion":1,"sha256":"wrong"}"#,
        )
        .unwrap();
        zip.start_file("collection.json", options).unwrap();
        zip.write_all(&serde_json::to_vec(&export(&[workflow]).unwrap()).unwrap())
            .unwrap();
        zip.finish().unwrap();
        assert!(read_file(&path).unwrap_err().to_string().contains("hash"));
    }
}
