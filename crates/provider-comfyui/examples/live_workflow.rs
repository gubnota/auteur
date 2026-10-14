//! Explicit local acceptance harness using the same document/resolver/provider as the desktop.
//! Inputs and results stay in the chosen private, disposable document; no automatic resubmit.
use job_core::ExecutionBackend;
use project_core::{ProjectStore, Result};
use serde_json::json;
use studio_contracts::{Job, JobDraft, JobItem, Workflow};

#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 4 {
        return Err("Usage: live_workflow SETUP.json MEDIA_MAP.json NEW.mymovie COMFY_URL".into());
    }
    let setups: Vec<Workflow> = serde_json::from_slice(&std::fs::read(&args[0])?)?;
    if setups.len() != 1 {
        return Err("Supply one reviewed workflow".into());
    }
    let workflow = setups[0].clone();
    let media: std::collections::BTreeMap<String, String> =
        serde_json::from_slice(&std::fs::read(&args[1])?)?;
    let mut store = ProjectStore::create(&args[2], "Local generation acceptance", false)?;
    let mut project = store.read()?;
    let mut item: JobItem = serde_json::from_value(
        json!({"id":project_core::id(),"workflowId":workflow.id,"connectionId":"local-acceptance","values":{}}),
    )?;
    for (semantic, path) in media {
        let asset = asset_core::import(store.path(), std::path::Path::new(&path))?;
        item.assets.insert(semantic, asset.id.clone());
        project.assets.push(asset);
    }
    let draft: JobDraft = serde_json::from_value(
        json!({"id":project_core::id(),"name":"Safe local acceptance","frameId":"","context":{"kind":"standalone","mode":"image-edit","characterIds":[]},"items":[item]}),
    )?;
    project.workflows.push(workflow.clone());
    project.job_drafts.push(draft.clone());
    project = store.save(project, 0)?;
    let snapshot = workflow_core::resolve_item(&project, &draft, &draft.items[0])?;
    let comfy = provider_comfyui::ComfyUi::new(&args[3])?;
    comfy
        .validate_compatibility(&workflow.requirements.compatibility)
        .await?;
    comfy
        .validate_media(&snapshot["graph"], &workflow.bindings)
        .await?;
    let mut values = snapshot["semantic"].clone();
    for (semantic, value) in snapshot["media"].as_object().ok_or("Missing media")? {
        let asset = serde_json::from_value::<studio_contracts::Asset>(value.clone())?;
        let bytes = std::fs::read(asset_core::source(store.path(), &asset, true)?)?;
        values[semantic] = json!(comfy.stage_asset(&asset, bytes).await?);
    }
    let graph = workflow_core::bind_exact(&workflow.graph, &workflow.bindings, &values)?;
    comfy.validate_job(&graph).await?;
    let mut job: Job = serde_json::from_value(
        json!({"id":project_core::id(),"frameId":"","workflowId":workflow.id,"workflowVersion":workflow.version,"connectionId":"local-acceptance","state":"unknown","remoteId":null,"snapshot":snapshot,"results":[],"error":null,"createdAt":"acceptance","updatedAt":"acceptance"}),
    )?;
    job.snapshot["submittedGraph"] = graph.clone();
    job_core::persist(&store, &job)?; // Before POST, never retry a lost response.
    let remote = comfy.submit(&job.id, &graph).await?;
    job.remote_id = Some(remote.clone());
    job.state = "running".into();
    job_core::persist(&store, &job)?;
    println!("Submitted {remote}; receipt stored in the disposable movie.");
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(1800);
    loop {
        let status = comfy.status(&remote).await?;
        if status.state == "collecting" {
            job.state = "collecting".into();
            job_core::persist(&store, &job)?;
            for output in status.outputs {
                let (name, bytes) = comfy.collect(&output).await?;
                let relative = format!("media/acceptance/{}-{name}", job.id);
                let path = project_core::confined(store.path(), &relative)?;
                std::fs::create_dir_all(path.parent().unwrap())?;
                std::fs::write(&path, bytes)?;
                let asset = asset_core::import(store.path(), &path)?;
                job.results.push(asset.clone());
                project.assets.push(asset);
            }
            let revision = project.revision;
            store.save(project, revision)?;
            job.state = "completed".into();
            job_core::persist(&store, &job)?;
            println!(
                "Completed: {} result(s), imported with hashes and provenance.",
                job.results.len()
            );
            return Ok(());
        }
        if status.state == "failed" {
            job.state = "failed".into();
            job.error = status.error;
            job_core::persist(&store, &job)?;
            return Err("Server execution failed; inspect its diagnostics".into());
        }
        if status.state == "unknown" || std::time::Instant::now() > deadline {
            job.state = "unknown".into();
            job_core::persist(&store, &job)?;
            return Err("Reconcile the saved remote ID; do not resubmit".into());
        }
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    }
}
