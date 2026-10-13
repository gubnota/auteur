# API Contracts

## Project persistence
- Rust DTOs: crates/studio-contracts/src/lib.rs; camelCase serde JSON.
- Manual TS mirror: apps/desktop/src/lib/types.ts; generated parity pending.
- Schema v2: manifest.json + project.sqlite; SQLite authoritative.
- Tables: project(id=1, revision, json), jobs(id,json), history(revision,json), projections(id,pending), job_runs(id,json).
- save_project(project, expectedRevision): UUID identity, revision conflict check, validated references.
- Recoverable projections: manifest, scene keyframes/board.json, character.json, versioned workflow definition.json.
- UUID IDs and relative package paths; symlinks/traversal rejected; one native writer.
- close_project releases writer/checkpoints WAL; copy package after closing.

## Media commands
- import_asset(path, linked?): Project; default false copies original.
- import_character_references(characterId, paths, linked?): Project; image-only, deduplicated.
- import_media_drop(paths, frameId?, shotId?, episodeId?, sceneId?, newScene?, characterId?, linked?): Project.
- Batch 1..64; images for storyboard/cast; one image on an existing frame.
- Target membership validated; character+board or newScene+existing target ambiguity rejected.
- Asset fields: id, name, kind, path, sha256, size, sourcePath?.
- Linked sourcePath is absolute/canonical; id/path/hash/size/kind stay immutable.
- Native saves own sourcePath changes; ordinary frontend save cannot alter them.
- collect_media(): Project; verify all links, copy into reserved path, clear sourcePath.
- Failed collect does not commit metadata; unused immutable copies can remain after an interrupted operation.
- relink_asset(assetId,path): Project; linked-only, exact original size/hash required.
- asset_availability(verify?): asset ID status map; verify=true includes hash/size check.
- mymovie://localhost/<asset-id>: registered project asset only; supports bounded byte ranges.
- Collect consolidates current project; separate export archive/copy UI is not implemented.

## Cast/bindings
- Scene.characterIds defaults empty for older v1 documents; frame.characterIds adds cast.
- Character.assetIds are shared reference images; revision increments on changed reference set.
- characterReference1..4 are explicit string semantic slots with image validation.
- Selected reference must belong to scene/frame cast; unresolved refs fail before submission.
- Import graph preserves node IDs/types; binding names/types are explicitly edited.
- Workflow id is local UUID; version is graph hash; deployment/account identity is separate.
- Workflow.deployments defaults empty: {connectionId,deploymentId,apiFamily}; one mapping per account.
- RunningHub family is workflow or ai-app; numeric deployment ID must identify this graph/published input schema.
- Workflow.mediaKind defaults other; optional editorGraph/editorHash preserve paired editor export.
- Backend resolves mapped deployment before submission; frozen receipts preserve destination when account settings change.

## Jobs and integrations
- ExecutionBackend: health, validate_job, stage_asset, submit, status, cancel, collect.
- Job freezes graph/semantic/frame/bindings/connection deployment and scene cast/reference context.
- Durable submission/receipt written before provider request; no blind retry of unknown outcome.
- States include waiting/paused/staging/ready/submitted/queued/running/collecting/completed/failed/cancel_requested/canceled/unknown.
- Active/unknown attempts consume a normalized endpoint lane slot; ComfyUI allows one, relay uses URL+node and configured capacity, RunningHub uses account capacity.
- SubmissionRejected denotes definitive provider refusal; transport/ambiguous outcomes stay unknown.
- reconcile_job(jobId,remoteId?,confirmedAbsent): unknown/no-ID only; verify task in original account or explicitly confirm absent in provider history. Duplicate task attachment is rejected.
- RunningHub endpoint allowlist: https://www.runninghub.ai or https://www.runninghub.cn; no arbitrary credential forwarding.
- Legacy workflow create + v2 AI App run use typed nodeInfoList; usePersonalQueue is JSON boolean.
- Desktop refresh polls every five seconds; ComfyUI transport also exposes WS support.
- Relay /v1/events: authenticated SSE, monotonic id and Last-Event-ID replay.
- Relay typed operations: doctor/inventory/drain/bootstrap/provision; no remote shell.
- Runtime lock: schemaVersion/image digest/nodeTypes/artifacts metadata; plan is not attested readiness.
- Transfer manifest objects: name/sha256/size/url/architecture?/license?.
- Signed manifest URL stored in Keychain; no secrets in .mymovie/settings JSON.
- Settings allow typed connection records; only supported adapters execute generation.
- Optional prompt assistants: Google, DeepSeek, OpenRouter; explicit request only.
- Diagnostic history bounded to 300 entries; clearing does not erase job receipts.

## Open acceptance gaps
- Full private runner/S3/GPU roundtrip, desktop SSE consumer and deployment hardening.
- Normalized entity migrations/schema parity; variants, derivatives, prompt version history.
- Browser/training/Homer interfaces require later implementation; no fabricated contract.

## Native document startup
- Finder Opened events may precede Tauri setup/Ready on macOS.
- A shared, deduplicated path inbox exists before the native app is built.
- Studio receives that same inbox during setup; event callbacks never read unregistered managed state.
- Existing opened-projects event / take_opened_projects frontend contract stays unchanged.

## Notebook node contract
- Agent node ID is allowlisted by relay; claims/reports/heartbeats are scoped to that node.
- One agent per GPU worker, CUDA visibility and ComfyUI port isolated; receipt before remote submission.
- Runtime loss -> offline node/unknown attempt, never automatic replay.
- Verified Linux x86_64 artifact + authenticated HTTPS relay + notebook Secrets required.

## Jobs drafts and batches (v0.1.3)
- Project.jobDrafts defaults empty: {id,name,frameId,items:[JobItem]}; items retain order.
- JobItem: id/workflowId/connectionId, typed values, asset IDs, optional bindings and deployment/family overrides.
- inputText/inputErrors persist raw invalid text keyed semantic:node.input; nonempty errors block native preflight.
- Explicit empty strings, numeric zero, false and parsed JSON are valid exact overrides; absent prompt override composes common/scene/frame text.
- Preview resolves graph and media hash/size without upload; stage resolves provider filenames. Imported graph stays immutable.
- preview_job_draft({draft}) -> JSON; start_job_draft({draftId}) -> Job[] after saving all attempts and run atomically.
- list_job_runs() -> JobRun[]; control_job_run({runId,action:pause|resume|cancel}) -> JobRun.
- JobRun: id,name,draftId,jobIds,state,createdAt; Job.runId/itemId optional for legacy jobs.
- Same normalized ComfyUI URL queues FIFO; distinct instances/relay node IDs dispatch concurrently.
- Unknown attempts hold a slot until explicit reconciliation. Pause stops waiting work; cancellation also requests active provider cancellation.
- Unsent work reopens paused; abandoned in-flight submissions become unknown, never automatically replayed.
- open_project({path,allowUpgrade?}): v1 returns UPGRADE_REQUIRED until explicit upgrade approval.
- v1 upgrade creates backups/pre-jobs-v1-<UUID>.sqlite and pre-jobs-manifest.json before transactional schema v2.
- Old app cannot edit schema v2; restore a closed backup copy for rollback. Draft projection: jobs/drafts.json; runs: jobs/runs/<id>.json.
