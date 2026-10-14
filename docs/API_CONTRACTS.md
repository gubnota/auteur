# API Contracts

## Project persistence
- Rust DTOs: crates/studio-contracts/src/lib.rs; camelCase serde JSON.
- Manual TS mirror: apps/desktop/src/lib/types.ts; generated parity pending.
- Schema v4: manifest.json + project.sqlite; SQLite authoritative.
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
- Runtime lock: schemaVersion/runtime fingerprint or image digest/nodeTypes/artifacts/canary. Managed readiness requires verified installed dependencies and a successful current-session canary.
- Transfer manifest objects: name/sha256/size/url/architecture?/license?.
- Signed manifest URL stored in Keychain; no secrets in .mymovie/settings JSON.
- Settings allow typed connection records; only supported adapters execute generation.
- Optional prompt assistants: Google, DeepSeek, OpenRouter; explicit request only.
- Diagnostic history bounded to 300 entries; clearing does not erase job receipts.

## Open acceptance gaps
- Full private runner/S3/GPU roundtrip, desktop SSE consumer and deployment hardening.
- Normalized entity migrations/schema parity; variants, derivatives other than video posters, prompt version history.
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

## Release artifact contract (v0.1.5)
- Desktop targets: macOS aarch64/x86_64 DMG; Windows x64 MSI/NSIS EXE; Linux x86_64/aarch64 DEB/AppImage.
- Linux agent archive/metadata names include architecture; archive executable is mymovie-agent.
- Metadata: target/buildOS/commit, archive sha256, binarySha256, bootstrapSha256; ELF architecture must match target.
- Global SHA256SUMS.txt covers every other release file using its exact published filename.
- Agent checksums are SHA256SUMS-agent.txt (x86_64) and SHA256SUMS-agent-aarch64.txt (ARM64).
- Publication requires all checks and native builds; source tag is version-matched and published binaries cannot be replaced by reruns.

## Jobs drafts and batches (v0.1.3)
- Project.jobDrafts defaults empty: {id,name,frameId,items:[JobItem]}; items retain order.
- JobItem: id/workflowId/connectionId, typed values, asset IDs, optional bindings and deployment/family overrides.
- inputText/inputErrors persist raw invalid text keyed semantic:node.input; nonempty errors block native preflight.
- Explicit empty strings, numeric zero, false and parsed JSON are valid exact overrides; absent prompt override composes common/scene/frame text.
- Preview resolves graph and media hash/size without upload; stage resolves provider filenames. Imported graph stays immutable.
- preview_job_draft({draft}) -> JSON; start_job_draft({draftId}) -> Job[] after saving all attempts and run atomically.
- list_job_runs() -> JobRun[]; control_job_run({runId,action:pause|resume|cancel}) -> Job[].
- JobRun: id,name,draftId,jobIds,state,createdAt; Job.runId/itemId optional for legacy jobs.
- Same normalized ComfyUI URL queues FIFO; distinct instances/relay node IDs dispatch concurrently.
- Unknown attempts hold a slot until explicit reconciliation. Pause stops waiting work; cancellation also requests active provider cancellation.
- Unsent work reopens paused; abandoned in-flight submissions become unknown, never automatically replayed.
- open_project({path,allowUpgrade?}): v1/v2 returns UPGRADE_REQUIRED until explicit backup/upgrade approval.
- v1 upgrade creates backups/pre-jobs-v1-<UUID>.sqlite and pre-jobs-manifest.json before transactional schema v2.
- Old app cannot edit schema v2; restore a closed backup copy for rollback. Draft projection: jobs/drafts.json; runs: jobs/runs/<id>.json.

## Generate and managed initialization (current main)
- JobDraft.context: {kind:standalone|storyboard,mode,characterIds}; storyboard frameId is on JobDraft. Legacy contexts default to storyboard.
- WorkflowBinding.media?: {kind:image|video|audio,role,order}; media sources require string bindings and exact asset-kind validation.
- Workflow.requirements defaults {compatibility:unspecified,artifacts:[]}; accepted flags: unspecified/universal/apple-silicon/cuda/rocm/cpu.
- Dependency artifact: kind/category/relative target/SHA256/size/architecture/license plus public HTTPS source or private sourceRef; plugins pin full revision and optional stripPrefix.
- Export setup contains workflows, immutable graphs, bindings and requirements; no credentials/media bytes.
- Agent inventory reports actual ComfyUI runtime fingerprint, hardware, node registry, paths and verified file states.
- Managed provisioning installs only verified bytes into effective folder_paths; conflicting files fail, plugins/wheels require restart and re-inventory.
- Ready attestation binds agent session/profile/workflow/bindings/runtime/dependency hashes; only mapped input changes are allowed at generation.
- Relay stage metadata includes asset kind; wrong-kind references fail before submission.
- renewOnly lease reports refresh running/collecting/cancel_requested leases without overwriting state/progress/remoteId; terminal jobs stay terminal.
- New CI agent archive includes runtime helper, profile builder, tiny paired workflows, model descriptor and deterministic pinned plugin archive. Published v0.1.5 lacks these new files.
- v3 upgrades preserve pre-upgrade SQLite/manifest backups; older clients reject upgraded packages.

## Workflow catalogue and preparation
- Workflow source/version immutable; global catalogue SQLite and portable movie pins have independent ownership.
- Native: list_workflows, catalogue_workflow(workflowId), pin_workflow(workflowId), save_workflow_layout(workflowId,layout), prepare_workflow(workflowId,connectionId), export_workflow(workflowId,path,editor:boolean,connectionId).
- WorkflowProfile: connectionId/sourceHash/apiHash/registryHash/frontendHash/compilerVersion/graph/inputs/outputs. Used-node schema mismatch fails before uploads; frozen jobs retain compiled profile and output layout.
- Inputs describe literal nodeId/input, type/control/default/constraints/choices/media role; graph links are excluded. Layout aliases/groups/order/advanced/hidden are persisted separately.
- ComfyUI V3 COMBO options and active dotted dynamic dimensions supported; changing a dynamic branch requires preparation. Unsupported values require explicit bindings.
- Agent typed workflow-inspect/install/compile operations take bounded editor source, check immutable hash and write confined agent-owned source/compiled/receipt paths.
- Compiler emits graph + registry + hashes; installation does not replace a user's active canvas. No execution during compilation; same-origin read-only browser traffic, no external requests.
- Result output selection filters ComfyUI nodeId metadata; providers lacking node metadata retain all results.

## Studio refinement contracts (0.1.7)
- enqueue_job_draft({draftId}) -> Job[]: preflight/freeze atomically, paused attempts and JobRun.queued=true; zero media uploads/provider submissions. Explicit resume clears queued.
- replace_queued_job_run({draftId,runId}) -> Job[]: only queued/paused runs whose attempts are paused without remote IDs; atomic insert replacement/cancel original, or rollback. Original snapshots remain unchanged.
- JobDraft.queuedRunId optional/null persists pending edits; ordinary enqueue/start rejects associated drafts until replaced or explicitly separated.
- Workflow layout input.mediaRole optional binds semantics to the exact node/input; swap changes labels/roles, never graph identity.
- registryHash `scope-v1:<SHA256>` covers only used node schemas, static choices and Python module identity. Known dynamic model/media choices are excluded; selected models validate live before staging. Legacy profiles require explicit refresh; frontendHash remains separate compilation provenance.
- install_workflow({workflowId,connectionId}) and agent workflow-install --publish-to-comfyui publish only normal editor sources to workflows/MyMovie/<slug>-<hash16>.json. Bounded Userdata GET/POST(overwrite=false)/readback; receipt installed/reused/libraryPath/sourceHash/loadedCanvas=false. Default agent install remains registry-only.
- remove_recent_project({path}), clear_recent_projects(): history only; close_project flushes the frontend save queue before Welcome.
- video_thumbnail({assetId}) generates optional bounded hash-identified JPEG; native poster protocol resolves registered asset IDs and confined derived paths.
- AppSettings.dismissedQueueJobIds defaults []; Clear finished records only completed/failed/canceled IDs. Other states remain visible regardless of IDs. Stored outside movies; job history/results are untouched.
