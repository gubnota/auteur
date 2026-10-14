//! Bounded background poster generation. Derived content never changes originals.
use super::*;
use std::path::PathBuf;
static WORKERS: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(2);
#[tauri::command]
pub async fn video_thumbnail(state: S<'_>, asset_id: String) -> Reply<bool> {
    let (root, asset, session, configured) = {
        let i = state.inner.lock().await;
        let s = store(&i).map_err(err)?;
        let p = s.read().map_err(err)?;
        (
            s.path().to_path_buf(),
            p.assets
                .into_iter()
                .find(|a| a.id == asset_id)
                .ok_or("Video missing")?,
            i.session,
            i.settings.read().map_err(err)?.storage["ffmpegPath"]
                .as_str()
                .map(str::to_string),
        )
    };
    let _permit = WORKERS.acquire().await.map_err(err)?;
    let poster = asset_core::poster_path(&root, &asset).map_err(err)?;
    let verify_root = root.clone();
    let verify_asset = asset.clone();
    let source = tauri::async_runtime::spawn_blocking(move || {
        asset_core::source(&verify_root, &verify_asset, true).map_err(err)
    })
    .await
    .map_err(err)??;
    if poster.is_file() {
        return Ok(true);
    }
    let executable = executable(configured, "ffmpeg");
    let temp = tempfile::tempdir().map_err(err)?;
    let output = temp.path().join("poster.jpg");
    let result = tokio::time::timeout(std::time::Duration::from_secs(25), tokio::process::Command::new(executable)
        .args(["-nostdin", "-y", "-v", "error", "-threads", "1", "-i"]).arg(&source)
        .args(["-frames:v", "1", "-vf", "scale=640:640:force_original_aspect_ratio=decrease", "-threads", "1"])
        .arg(&output).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).kill_on_drop(true).status()).await
        .map_err(|_| "Video preview timed out; the original is still available")?
        .map_err(|_| "Install FFmpeg, or set its executable path in Settings → Media tools, then retry the preview")?;
    if !result.success() {
        return Err("Could not preview this video; the original is still available".into());
    }
    let bytes = std::fs::read(output).map_err(err)?;
    if bytes.len() > 2 * 1024 * 1024 || !bytes.starts_with(&[0xff, 0xd8]) {
        return Err("Invalid video poster".into());
    }
    // Linked files may change while FFmpeg is reading them; never cache the
    // resulting poster under an obsolete source identity.
    let verify_root = root.clone();
    let verify_asset = asset.clone();
    tauri::async_runtime::spawn_blocking(move || {
        asset_core::source(&verify_root, &verify_asset, true).map_err(err)
    })
    .await
    .map_err(err)??;
    let i = state.inner.lock().await;
    if i.session != session
        || store(&i).map_err(err)?.path() != root
        || !store(&i)
            .map_err(err)?
            .read()
            .map_err(err)?
            .assets
            .iter()
            .any(|a| {
                a.id == asset.id
                    && a.sha256 == asset.sha256
                    && a.path == asset.path
                    && a.source_path == asset.source_path
            })
    {
        return Err("Movie or material changed during preview generation".into());
    }
    let dest = asset_core::poster_path(&root, &asset).map_err(err)?;
    std::fs::create_dir_all(dest.parent().ok_or("Poster directory missing")?).map_err(err)?;
    // Revalidate confinement after creating directories; do not follow package symlinks.
    let dest = asset_core::poster_path(&root, &asset).map_err(err)?;
    let partial = dest.with_extension(format!("{}.partial", project_core::id()));
    std::fs::write(&partial, bytes).map_err(err)?;
    std::fs::rename(&partial, dest).map_err(err)?;
    Ok(true)
}

pub(super) fn executable(configured: Option<String>, tool: &str) -> PathBuf {
    let candidates = [
        configured.map(PathBuf::from).map(|p| {
            if tool == "ffmpeg" {
                p
            } else {
                p.with_file_name(tool)
            }
        }),
        Some(PathBuf::from(format!("/opt/homebrew/bin/{tool}"))),
        Some(PathBuf::from(format!("/usr/local/bin/{tool}"))),
        std::env::var_os("HOME")
            .map(|h| PathBuf::from(h).join(format!("local/homebrew/bin/{tool}"))),
        Some(PathBuf::from(format!("/usr/bin/{tool}"))),
    ];
    candidates
        .into_iter()
        .flatten()
        .find(|p| p.is_file())
        .unwrap_or_else(|| PathBuf::from(tool))
}
