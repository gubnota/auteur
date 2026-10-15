mod assistant;
mod media;
mod service;
use service::*;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
fn main() {
    // macOS can deliver Opened before Tauri's Ready/setup event on a cold launch.
    // Keep the document inbox outside managed state until setup has completed.
    let opened = Arc::new(Mutex::new(Vec::<String>::new()));
    let setup_opened = opened.clone();
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
        .setup(move |app| {
            let dir = app.path().app_data_dir()?;
            let state = Arc::new(
                Studio::new(&dir, setup_opened.clone())
                    .map_err(|e| std::io::Error::other(e.to_string()))?,
            );
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
            import_job_media,
            import_media_drop,
            collect_media,
            asset_availability,
            video_thumbnail,
            relink_asset,
            import_character_references,
            import_workflow,
            list_workflows,
            pin_workflow,
            catalogue_workflow,
            save_workflow_layout,
            save_workflow_form,
            prepare_workflow,
            install_workflow,
            export_workflow,
            export_workflow_bundle,
            export_workflow_setup,
            notebook_setup_script,
            get_settings,
            save_settings,
            save_credential,
            get_runner_tokens,
            save_runner_tokens,
            list_jobs,
            submit_job,
            preview_job_draft,
            start_job_draft,
            enqueue_job_draft,
            replace_queued_job_run,
            list_job_runs,
            control_job_run,
            control_job_tasks,
            refresh_jobs,
            assistant_request,
            cancel_job,
            reconcile_job,
            connection_health,
            plan_deployment,
            runner_operation,
            start_initialization,
            list_initializations,
            cancel_initialization,
            apply_initialization,
            console_request,
            archive_workflow,
            clear_workflow_trash,
            validate_profile,
            runner_action,
            sync_storage,
            validate_runtime,
            media_tools,
            clear_diagnostics,
            take_opened_projects,
            recent_projects,
            remove_recent_project,
            clear_recent_projects,
            project_history,
            close_project
        ])
        .build(tauri::generate_context!())
        .expect("Cannot initialize MyMovie Studio");
    app.run(move |app, event| match event {
        tauri::RunEvent::Ready => {
            let paths: Vec<_> = std::env::args()
                .skip(1)
                .filter(|p| p.ends_with(".mymovie"))
                .collect();
            if !paths.is_empty() {
                enqueue_documents(&opened, paths);
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
            enqueue_documents(&opened, paths.clone());
            let _ = app.emit("opened-projects", paths);
        }
        _ => {}
    });
}
fn enqueue_documents(inbox: &Mutex<Vec<String>>, paths: Vec<String>) {
    let mut queue = inbox.lock().unwrap_or_else(|poison| poison.into_inner());
    for path in paths {
        if !queue.contains(&path) {
            queue.push(path);
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cold_launch_documents_survive_setup_and_ready_without_duplicates() {
        let inbox = Arc::new(Mutex::new(vec![]));
        enqueue_documents(&inbox, vec!["Movie.mymovie".into()]);
        let setup_inbox = inbox.clone();
        enqueue_documents(
            &inbox,
            vec!["Movie.mymovie".into(), "Second.mymovie".into()],
        );
        assert_eq!(
            *setup_inbox.lock().unwrap(),
            vec!["Movie.mymovie", "Second.mymovie"]
        );
    }
}
