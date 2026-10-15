use crate::service::Studio;
use std::sync::Arc;
use tauri::http::{Request, Response};
pub async fn respond(state: &Arc<Studio>, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let uri = request.uri().path().trim_start_matches('/');
    let (id, poster) = match uri.split_once('/') {
        Some((id, "thumbnail")) => (id, true),
        Some(_) => return Response::builder().status(404).body(vec![]).unwrap(),
        None => (uri, false),
    };
    let path = {
        let inner = state.inner.lock().await;
        std::iter::once(&inner.workspace)
            .chain(inner.project.as_ref())
            .find_map(|s| {
                let p = s.read().ok()?;
                let a = p.assets.iter().find(|a| a.id == id)?;
                if poster {
                    asset_core::poster_path(s.path(), a).ok()
                } else {
                    asset_core::source(s.path(), a, false).ok()
                }
            })
    };
    let Some(path) = path else {
        return Response::builder().status(404).body(vec![]).unwrap();
    };
    let range = request
        .headers()
        .get("range")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let method = request.method().clone();
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::{Read, Seek, SeekFrom};
        let result = (|| -> std::io::Result<Response<Vec<u8>>> {
            let mut f = std::fs::File::open(&path)?;
            let size = f.metadata()?.len();
            let mime = match path.extension().and_then(|s| s.to_str()).unwrap_or("") {
                "png" => "image/png",
                "jpg" | "jpeg" => "image/jpeg",
                "webp" => "image/webp",
                "gif" => "image/gif",
                "mp4" | "m4v" => "video/mp4",
                "mov" => "video/quicktime",
                "webm" => "video/webm",
                "wav" => "audio/wav",
                "mp3" => "audio/mpeg",
                "m4a" => "audio/mp4",
                "flac" => "audio/flac",
                _ => "application/octet-stream",
            };
            let (mut start, mut end, mut partial) = (0, size.saturating_sub(1), false);
            if let Some(r) = range {
                let parsed = r.strip_prefix("bytes=").and_then(|s| s.split_once('-'));
                if let Some((a, b)) = parsed {
                    if a.is_empty() {
                        if let Ok(n) = b.parse::<u64>() {
                            start = size.saturating_sub(n);
                            partial = true;
                        }
                    } else if let Ok(n) = a.parse::<u64>() {
                        start = n;
                        if !b.is_empty() {
                            end = b.parse::<u64>().unwrap_or(0).min(end);
                        }
                        partial = true;
                    }
                }
                if !partial || start > end || start >= size {
                    return Ok(Response::builder()
                        .status(416)
                        .header("Content-Range", format!("bytes */{size}"))
                        .body(vec![])
                        .unwrap());
                }
            }
            // Serve bounded ranges so a video preview cannot allocate a complete multi-GB film.
            if partial {
                end = end.min(start.saturating_add(8 * 1024 * 1024 - 1));
            }
            let len = if size == 0 { 0 } else { end - start + 1 };
            if len > 1024 * 1024 * 1024 {
                return Ok(Response::builder().status(413).body(vec![]).unwrap());
            }
            let mut body = vec![];
            if method != tauri::http::Method::HEAD {
                f.seek(SeekFrom::Start(start))?;
                f.take(len).read_to_end(&mut body)?;
            }
            let mut response = Response::builder()
                .status(if partial { 206 } else { 200 })
                .header("Content-Type", mime)
                .header("Accept-Ranges", "bytes")
                .header("Content-Length", len.to_string())
                .header("Cache-Control", "no-store")
                .header("Access-Control-Allow-Origin", "*");
            if partial {
                response = response.header("Content-Range", format!("bytes {start}-{end}/{size}"));
            }
            Ok(response.body(body).unwrap())
        })();
        result.unwrap_or_else(|_| Response::builder().status(404).body(vec![]).unwrap())
    })
    .await
    .unwrap_or_else(|_| Response::builder().status(500).body(vec![]).unwrap())
}
