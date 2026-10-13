mod assistant;
mod media;
mod service;
use service::*;
use std::sync::Arc;
use tauri::{Emitter, Manager};
fn main() {
    let app = tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("mymovie", |ctx, request, responder| {
            let state = ctx.app_handle().state::<Arc<Studio>>().inner().clone();
            tauri::async_runtime::spawn(async move {
                let response = media::respond(&state, request).await;
                responder.respond(response);
            });
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let state =
                Arc::new(Studio::new(&dir).map_err(|e| std::io::Error::other(e.to_string()))?);
            app.manage(state.clone());
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                    let _ = refresh(&state, &handle).await;
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_project,
            open_project,
            get_project,
            save_project,
            import_asset,
            import_media_drop,
            collect_media,
            asset_availability,
            relink_asset,
            import_character_references,
            import_workflow,
            get_settings,
            save_settings,
            save_credential,
            list_jobs,
            submit_job,
            refresh_jobs,
            assistant_request,
            cancel_job,
            connection_health,
            plan_deployment,
            runner_action,
            sync_storage,
            validate_runtime,
            media_tools,
            clear_diagnostics,
            take_opened_projects,
            recent_projects,
            project_history,
            close_project
        ])
        .build(tauri::generate_context!())
        .expect("Cannot initialize MyMovie Studio");
    app.run(|app, event| match event {
        tauri::RunEvent::Ready => {
            let paths: Vec<_> = std::env::args()
                .skip(1)
                .filter(|p| p.ends_with(".mymovie"))
                .collect();
            if !paths.is_empty() {
                app.state::<Arc<Studio>>()
                    .opened
                    .lock()
                    .unwrap()
                    .extend(paths);
            }
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Opened { urls } => {
            let paths: Vec<_> = urls
                .into_iter()
                .filter_map(|u| u.to_file_path().ok())
                .filter(|p| p.extension().is_some_and(|e| e == "mymovie"))
                .map(|p| p.to_string_lossy().into_owned())
                .collect();
            let state = app.state::<Arc<Studio>>();
            {
                let mut queue = state.opened.lock().unwrap();
                for p in &paths {
                    if !queue.contains(p) {
                        queue.push(p.clone());
                    }
                }
            }
            let _ = app.emit("opened-projects", paths);
        }
        _ => {}
    });
}
