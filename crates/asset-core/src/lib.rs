use project_core::{Result, confined, id};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::Path,
};
use studio_contracts::Asset;
pub fn import(root: &Path, source: &Path) -> Result<Asset> {
    import_with_mode(root, source, false)
}
pub fn import_with_mode(root: &Path, source: &Path, linked: bool) -> Result<Asset> {
    if fs::symlink_metadata(source)?.file_type().is_symlink() || !source.is_file() {
        return Err("Select a regular media file".into());
    }
    let ext = source
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let kind = match ext.as_str() {
        "png" | "jpg" | "jpeg" | "webp" | "gif" => "image",
        "mp4" | "mov" | "webm" | "mkv" => "video",
        "wav" | "mp3" | "flac" | "m4a" => "audio",
        "safetensors" => "lora",
        _ => return Err("Unsupported media extension".into()),
    };
    if linked {
        let source = fs::canonicalize(source)?;
        let (sha256, size) = hash_file(&source)?;
        return Ok(Asset {
            id: id(),
            name: source
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into(),
            path: format!("media/originals/{sha256}.{ext}"),
            sha256,
            kind: kind.into(),
            size,
            source_path: Some(source.to_string_lossy().into_owned()),
        });
    }
    let dir = confined(root, "media/originals")?;
    fs::create_dir_all(&dir)?;
    let tmp = dir.join(format!(".{}.partial", id()));
    let mut input = File::open(source)?;
    let mut output = OpenOptions::new().write(true).create_new(true).open(&tmp)?;
    let mut hash = Sha256::new();
    let mut size = 0;
    let mut buf = [0u8; 65536];
    let result = (|| -> Result<()> {
        loop {
            let n = input.read(&mut buf)?;
            if n == 0 {
                break;
            }
            size += n as u64;
            hash.update(&buf[..n]);
            output.write_all(&buf[..n])?;
        }
        output.sync_all()?;
        Ok(())
    })();
    if let Err(e) = result {
        let _ = fs::remove_file(tmp);
        return Err(e);
    }
    let sha256 = format!("{:x}", hash.finalize());
    let path = format!("media/originals/{sha256}.{ext}");
    let dest = confined(root, &path)?;
    if dest.exists() {
        let mut existing = File::open(&dest)?;
        let mut h = Sha256::new();
        loop {
            let n = existing.read(&mut buf)?;
            if n == 0 {
                break;
            }
            h.update(&buf[..n]);
        }
        if format!("{:x}", h.finalize()) != sha256 {
            fs::remove_file(tmp)?;
            return Err("Existing immutable original is corrupted".into());
        }
        fs::remove_file(tmp)?;
    } else {
        fs::rename(tmp, dest)?;
        File::open(&dir)?.sync_all()?;
    }
    Ok(Asset {
        id: id(),
        name: source
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into(),
        path,
        sha256,
        kind: kind.into(),
        size,
        source_path: None,
    })
}
pub fn probe(source: &Path) -> Result<serde_json::Value> {
    let output = std::process::Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
        ])
        .arg(source)
        .output()?;
    if !output.status.success() {
        return Err("FFprobe could not inspect media".into());
    }
    Ok(serde_json::from_slice(&output.stdout)?)
}
pub fn thumbnail(source: &Path, dest: &Path) -> Result<()> {
    let status = std::process::Command::new("ffmpeg")
        .args(["-nostdin", "-y", "-v", "error", "-i"])
        .arg(source)
        .args(["-frames:v", "1", "-vf", "scale=640:-2"])
        .arg(dest)
        .status()?;
    if !status.success() {
        return Err("Thumbnail generation failed".into());
    }
    Ok(())
}

/// Only explicit user imports may introduce external paths. Originals retain their
/// content identity; collect/relink never accepts changed bytes under the same ID.
fn hash_file(path: &Path) -> Result<(String, u64)> {
    let mut file = File::open(path)?;
    let mut hash = Sha256::new();
    let mut size = 0;
    let mut buf = [0; 65536];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hash.update(&buf[..n]);
        size += n as u64;
    }
    Ok((format!("{:x}", hash.finalize()), size))
}
pub fn source(root: &Path, asset: &Asset, verify: bool) -> Result<std::path::PathBuf> {
    let path = match &asset.source_path {
        Some(path) => std::path::PathBuf::from(path),
        None => confined(root, &asset.path)?,
    };
    if fs::symlink_metadata(&path)?.file_type().is_symlink() || !path.is_file() {
        return Err(
            "Original media is missing or is not a regular file; relink it in Library".into(),
        );
    }
    if verify && hash_file(&path)? != (asset.sha256.clone(), asset.size) {
        return Err(
            "Linked original has changed; relink the original or import it as a new asset".into(),
        );
    }
    Ok(path)
}
pub fn collect(root: &Path, mut p: studio_contracts::Project) -> Result<studio_contracts::Project> {
    // Validate the complete batch before writing or changing metadata.
    let sources = p
        .assets
        .iter()
        .filter(|a| a.source_path.is_some())
        .map(|a| source(root, a, true))
        .collect::<Result<Vec<_>>>()?;
    for (asset, source) in p
        .assets
        .iter_mut()
        .filter(|a| a.source_path.is_some())
        .zip(sources)
    {
        let imported = import(root, &source)?;
        if imported.sha256 != asset.sha256
            || imported.size != asset.size
            || imported.path != asset.path
        {
            return Err("Original changed while collecting media".into());
        }
        asset.source_path = None;
    }
    Ok(p)
}
#[derive(Default)]
pub struct DropTarget<'a> {
    pub frame: Option<&'a str>,
    pub shot: Option<&'a str>,
    pub episode: Option<&'a str>,
    pub scene: Option<&'a str>,
    pub new_scene: bool,
    pub character: Option<&'a str>,
    pub linked: bool,
}
pub fn import_drop(
    root: &Path,
    p: studio_contracts::Project,
    paths: &[String],
    frame_id: Option<&str>,
    shot_id: Option<&str>,
    episode_id: Option<&str>,
) -> Result<studio_contracts::Project> {
    import_target(
        root,
        p,
        paths,
        DropTarget {
            frame: frame_id,
            shot: shot_id,
            episode: episode_id,
            ..Default::default()
        },
    )
}
/// One metadata revision per batch. Failed batches never partially edit the board.
pub fn import_target(
    root: &Path,
    mut p: studio_contracts::Project,
    paths: &[String],
    t: DropTarget<'_>,
) -> Result<studio_contracts::Project> {
    use studio_contracts::{Frame, Scene, Shot};
    if paths.is_empty() || paths.len() > 64 {
        return Err("Drop between one and 64 files".into());
    }
    let storyboard = t.frame.is_some()
        || t.episode.is_some()
        || t.shot.is_some()
        || t.scene.is_some()
        || t.new_scene;
    if (t.character.is_some() && storyboard)
        || (t.new_scene && (t.scene.is_some() || t.shot.is_some() || t.frame.is_some()))
    {
        return Err("Ambiguous import target".into());
    }
    if t.frame.is_some() && paths.len() != 1 {
        return Err("Drop one image onto a keyframe; use New keyframe for several images".into());
    }
    if let Some(id) = t.character {
        if !p.characters.iter().any(|c| c.id == id) {
            return Err("Character no longer exists".into());
        }
    }
    if let Some(id) = t.frame {
        if !p
            .episodes
            .iter()
            .flat_map(|e| &e.scenes)
            .flat_map(|s| &s.shots)
            .flat_map(|s| &s.frames)
            .any(|f| f.id == id)
        {
            return Err("Keyframe no longer exists".into());
        }
    } else if storyboard {
        let ep = p
            .episodes
            .iter()
            .find(|e| Some(e.id.as_str()) == t.episode)
            .ok_or("Episode no longer exists")?;
        if let Some(id) = t.scene {
            if !ep.scenes.iter().any(|s| s.id == id) {
                return Err("Scene no longer exists in this episode".into());
            }
        }
        if let Some(id) = t.shot {
            if !ep
                .scenes
                .iter()
                .filter(|s| t.scene.is_none_or(|id| s.id == id))
                .flat_map(|s| &s.shots)
                .any(|s| s.id == id)
            {
                return Err("Shot no longer exists in this scene".into());
            }
        }
    }
    if (storyboard || t.character.is_some())
        && paths.iter().any(|path| {
            !["png", "jpg", "jpeg", "webp", "gif"].contains(
                &Path::new(path)
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_ascii_lowercase()
                    .as_str(),
            )
        })
    {
        return Err(
            "Keyframes and character references require image files; drop other media into Library"
                .into(),
        );
    }
    let mut asset_ids = vec![];
    for path in paths {
        let asset = import_with_mode(root, Path::new(path), t.linked)?;
        let asset_id = if let Some(old) = p
            .assets
            .iter_mut()
            .find(|a| a.path == asset.path && a.sha256 == asset.sha256)
        {
            // A copy import also collects an already-linked identical original.
            if !t.linked {
                old.source_path = None;
            }
            old.id.clone()
        } else {
            let id = asset.id.clone();
            p.assets.push(asset);
            id
        };
        asset_ids.push(asset_id);
    }
    if let Some(id) = t.character {
        let c = p.characters.iter_mut().find(|c| c.id == id).unwrap();
        let old = c.asset_ids.len();
        for id in asset_ids {
            if !c.asset_ids.contains(&id) {
                c.asset_ids.push(id);
            }
        }
        if c.asset_ids.len() != old {
            c.revision += 1;
        }
    } else if let Some(id) = t.frame {
        p.episodes
            .iter_mut()
            .flat_map(|e| &mut e.scenes)
            .flat_map(|s| &mut s.shots)
            .flat_map(|s| &mut s.frames)
            .find(|f| f.id == id)
            .unwrap()
            .asset_id = Some(asset_ids.remove(0));
    } else if storyboard {
        let ep = p
            .episodes
            .iter_mut()
            .find(|e| Some(e.id.as_str()) == t.episode)
            .unwrap();
        if t.new_scene || ep.scenes.is_empty() {
            let name = if t.new_scene {
                Path::new(&paths[0])
                    .file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned()
            } else {
                "Scene 01".into()
            };
            ep.scenes.push(Scene {
                id: id(),
                name,
                positive_prompt: None,
                negative_prompt: None,
                character_ids: vec![],
                shots: vec![],
            });
        }
        let scene_index = if t.new_scene {
            ep.scenes.len() - 1
        } else if let Some(id) = t.scene {
            ep.scenes.iter().position(|s| s.id == id).unwrap()
        } else if let Some(id) = t.shot {
            ep.scenes
                .iter()
                .position(|s| s.shots.iter().any(|sh| sh.id == id))
                .unwrap()
        } else {
            0
        };
        let scene = &mut ep.scenes[scene_index];
        if scene.shots.is_empty() {
            scene.shots.push(Shot {
                id: id(),
                name: "Shot 01".into(),
                frames: vec![],
            });
        }
        let shot = if let Some(id) = t.shot {
            scene.shots.iter_mut().find(|s| s.id == id).unwrap()
        } else {
            &mut scene.shots[0]
        };
        for asset_id in asset_ids {
            let name = p
                .assets
                .iter()
                .find(|a| a.id == asset_id)
                .map(|a| {
                    Path::new(&a.name)
                        .file_stem()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .into_owned()
                })
                .unwrap_or_else(|| format!("Frame {:02}", shot.frames.len() + 1));
            shot.frames.push(Frame {
                id: id(),
                name,
                asset_id: Some(asset_id),
                positive_prompt: String::new(),
                negative_prompt: String::new(),
                include_common: true,
                ratio: None,
                character_ids: vec![],
                comments: vec![],
            });
        }
    }
    Ok(p)
}

#[cfg(test)]
mod drop_tests {
    use super::*;
    #[test]
    fn library_batch_is_portable_atomic_and_deduplicated() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("Library.mymovie");
        let mut store = project_core::ProjectStore::create(&root, "Library", false).unwrap();
        let source = dir.path().join("still.png");
        fs::write(&source, include_bytes!("../../../fixtures/cpu-canary.png")).unwrap();
        let paths = vec![source.to_string_lossy().into_owned(); 2];
        let p = store.read().unwrap();
        let revision = p.revision;
        let imported = import_drop(&root, p, &paths, None, None, None).unwrap();
        assert_eq!(imported.assets.len(), 1);
        let saved = store.save(imported, revision).unwrap();
        let unsupported = dir.path().join("invalid.txt");
        fs::write(&unsupported, "unsupported").unwrap();
        assert!(
            import_drop(
                &root,
                saved.clone(),
                &[paths[0].clone(), unsupported.to_string_lossy().into_owned()],
                None,
                None,
                None
            )
            .is_err()
        );
        assert_eq!(store.read().unwrap().revision, saved.revision);
        drop(store);
        fs::remove_file(source).unwrap();
        let relocated = dir.path().join("Moved.mymovie");
        fs::rename(&root, &relocated).unwrap();
        let reopened = project_core::ProjectStore::open(&relocated).unwrap();
        let p = reopened.read().unwrap();
        assert_eq!(p.assets.len(), 1);
        assert_eq!(
            fs::read(relocated.join(&p.assets[0].path)).unwrap(),
            include_bytes!("../../../fixtures/cpu-canary.png")
        );
    }
    #[test]
    fn drops_assign_preserve_metadata_create_empty_episode_and_deduplicate() {
        let dir = tempfile::tempdir().unwrap();
        let mut document =
            project_core::ProjectStore::create(&dir.path().join("Film.mymovie"), "Film", true)
                .unwrap();
        let mut p = document.read().unwrap();
        let image = dir.path().join("still.png");
        std::fs::write(&image, include_bytes!("../../../fixtures/cpu-canary.png")).unwrap();
        let paths = vec![image.to_string_lossy().into_owned()];
        let frame = &mut p.episodes[0].scenes[0].shots[0].frames[0];
        frame.positive_prompt = "Preserve this prompt".into();
        let frame_id = frame.id.clone();
        let character_ids = frame.character_ids.clone();
        let updated = import_drop(document.path(), p, &paths, Some(&frame_id), None, None).unwrap();
        let original = &updated.episodes[0].scenes[0].shots[0].frames[0];
        assert_eq!(original.positive_prompt, "Preserve this prompt");
        assert_eq!(original.character_ids, character_ids);
        assert!(original.asset_id.is_some());
        let storm_id = updated.episodes[1].id.clone();
        let revision = updated.revision;
        let saved = document.save(updated, revision).unwrap();
        let next =
            import_drop(document.path(), saved, &paths, None, None, Some(&storm_id)).unwrap();
        assert_eq!(next.assets.len(), 1);
        assert_eq!(next.episodes[1].scenes[0].shots[0].frames.len(), 1);
        assert!(
            import_drop(
                document.path(),
                next.clone(),
                &paths,
                Some("missing"),
                None,
                None
            )
            .is_err()
        );
        assert!(
            import_drop(
                document.path(),
                next,
                &[paths[0].clone(), paths[0].clone()],
                Some(&frame_id),
                None,
                None
            )
            .is_err()
        );
    }
    #[test]
    fn linked_media_collects_without_losing_assignments_and_relocates() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("Film.mymovie");
        let mut store = project_core::ProjectStore::create(&root, "Film", true).unwrap();
        let image = dir.path().join("Reference.png");
        fs::write(&image, include_bytes!("../../../fixtures/cpu-canary.png")).unwrap();
        let paths = vec![image.to_string_lossy().into_owned()];
        let p = store.read().unwrap();
        let character = p.characters[0].id.clone();
        let p = import_target(
            &root,
            p,
            &paths,
            DropTarget {
                character: Some(&character),
                linked: true,
                ..Default::default()
            },
        )
        .unwrap();
        let asset_id = p.assets[0].id.clone();
        assert_eq!(p.characters[0].asset_ids, vec![asset_id.clone()]);
        assert!(!root.join(&p.assets[0].path).exists());
        let episode = p.episodes[0].id.clone();
        let mut p = import_target(
            &root,
            p,
            &paths,
            DropTarget {
                episode: Some(&episode),
                new_scene: true,
                linked: true,
                ..Default::default()
            },
        )
        .unwrap();
        let scene = p.episodes[0].scenes.last_mut().unwrap();
        scene.character_ids = vec![character];
        assert_eq!(scene.name, "Reference");
        assert_eq!(scene.shots[0].frames[0].asset_id.as_ref(), Some(&asset_id));
        let p = store.save(p.clone(), p.revision).unwrap();
        fs::write(&image, b"changed").unwrap();
        assert!(collect(&root, p.clone()).is_err());
        assert!(store.read().unwrap().assets[0].source_path.is_some());
        fs::write(&image, include_bytes!("../../../fixtures/cpu-canary.png")).unwrap();
        let collected = collect(&root, p.clone()).unwrap();
        assert_eq!(collected.assets[0].id, asset_id);
        assert!(collected.assets[0].source_path.is_none());
        assert_eq!(
            serde_json::to_value(&collected.characters).unwrap(),
            serde_json::to_value(&p.characters).unwrap()
        );
        let revision = collected.revision;
        store.save(collected, revision).unwrap();
        drop(store);
        fs::remove_file(image).unwrap();
        let moved = dir.path().join("Moved.mymovie");
        fs::rename(&root, &moved).unwrap();
        let reopened = project_core::ProjectStore::open(&moved)
            .unwrap()
            .read()
            .unwrap();
        assert!(source(&moved, &reopened.assets[0], true).is_ok());
        assert!(
            !reopened.episodes[0]
                .scenes
                .last()
                .unwrap()
                .character_ids
                .is_empty()
        );
    }
    #[test]
    fn missing_link_and_invalid_target_leave_saved_document_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("Film.mymovie");
        let mut store = project_core::ProjectStore::create(&root, "Film", true).unwrap();
        let image = dir.path().join("Reference.png");
        fs::write(&image, b"original").unwrap();
        let p = store.read().unwrap();
        let paths = vec![image.to_string_lossy().into_owned()];
        assert!(
            import_target(
                &root,
                p.clone(),
                &paths,
                DropTarget {
                    episode: Some(&p.episodes[0].id),
                    scene: Some(&p.episodes[0].scenes[0].id),
                    new_scene: true,
                    ..Default::default()
                }
            )
            .is_err()
        );
        let next = import_target(
            &root,
            p.clone(),
            &paths,
            DropTarget {
                linked: true,
                ..Default::default()
            },
        )
        .unwrap();
        let saved = store.save(next, p.revision).unwrap();
        fs::remove_file(image).unwrap();
        assert!(source(&root, &saved.assets[0], false).is_err());
        assert!(collect(&root, saved.clone()).is_err());
        assert_eq!(store.read().unwrap().revision, saved.revision);
    }
}
