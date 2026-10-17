# API Contracts

## Project persistence
- Rust DTOs: crates/studio-contracts/src/lib.rs; camelCase serde JSON.
- Manual TS mirror: apps/desktop/src/lib/types.ts; generated parity pending.
- Schema v5: manifest.json + project.sqlite; SQLite authoritative.
- Tables: project(id=1, revision, json), jobs(id,json), history(revision,json), projections(id,pending), job_runs(id,json).
- save_project(project, expectedRevision): UUID identity, revision conflict check, validated references. Metadata-only desktop save restores native graph/editor/hash/profiles for each existing workflow identity/version, avoiding JavaScript number normalization; strict core save still rejects graph mutation.
- Recoverable projections: manifest, scene keyframes/board.json, character.json, versioned workflow definition.json.
- UUID IDs and relative package paths; symlinks/traversal rejected; one native writer.
- close_project releases writer/checkpoints WAL; copy package after closing.

## Media commands
- import_asset(path, linked?): Project; default false copies original.
- import_character_references(characterId, paths, linked?): Project; image-only, deduplicated.
- import_media_drop(paths, frameId?, shotId?, episodeId?, sceneId?, newScene?, characterId?, linked?): Project.
- Batch 1..64; images for storyboard/cast; one image on an existing frame.
- Target membership validated; character+board or newScene+existing target ambiguity rejected.
- Asset fields: id, name, kind, path, sha256, size, sourcePath?, archivedAt? (RFC3339, absent by default).
- import_job_media({draftId,itemId,semantic,paths,linked?}): {project,assetIds}; import and assign exact IDs atomically.
- Verified duplicate size/hash/kind and available content reuse UUID before copy; existing link policy persists. Reimport restores an archived duplicate.
- Trash/Restore changes archivedAt only; frozen references/original bytes/receipts remain valid. New freezes reject archived selections.
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
- Workflow.mediaKind defaults other; optional editorGraph/editorHash preserve paired editor export.
- Backend resolves mapped deployment before submission; frozen receipts preserve destination when account settings change.

## Jobs and integrations
- ExecutionBackend: health, validate_job, stage_asset, submit, status, cancel, collect.
- Job freezes graph/semantic/frame/bindings/connection deployment and scene cast/reference context.
- Durable submission/receipt written before provider request; no blind retry of unknown outcome.
- States include waiting/paused/staging/ready/submitted/queued/running/collecting/completed/failed/cancel_requested/canceled/unknown.
- SubmissionRejected denotes definitive provider refusal; transport/ambiguous outcomes stay unknown.
- reconcile_job(jobId,remoteId?,confirmedAbsent): unknown/no-ID only; verify task in original account or explicitly confirm absent in provider history. Duplicate task attachment is rejected.
- Legacy workflow create + v2 AI App run use typed nodeInfoList; usePersonalQueue is JSON boolean. Both use /task/openapi/upload (apiKey/fileType=input/file multipart, bearer authentication), returning data.fileName for ComfyUI loader overrides; standard-model v2 download URLs are not interchangeable. Image-only staging is bounded to 30 MB.
- Desktop refresh polls every five seconds; ComfyUI transport also exposes WS support.
- Relay /v1/events: authenticated SSE, monotonic id and Last-Event-ID replay.
- Relay typed operations: doctor/inventory/drain/bootstrap/provision/initialize. Remote console is separate, private and explicitly opted-in (0.1.18).
- Runtime lock: schemaVersion/runtime fingerprint or image digest/nodeTypes/artifacts/canary. Managed readiness requires verified installed dependencies and a successful current-session canary.
- Transfer manifest objects: name/sha256/size/url/architecture?/license?.
- Signed manifest URL stored in Keychain; no secrets in .mymovie/settings JSON.
- Settings allow typed connection records; only supported adapters execute generation.
- Connection.hosting accepts local-mac/linux/orbstack/runpod/ssh/colab/kaggle only for kind=relay; absent hosting remains valid for existing connections. Loopback relay HTTP is allowed; remote relays require HTTPS.
- Optional prompt assistants: Google, DeepSeek, OpenRouter; explicit request only.
- Diagnostic history bounded to 300 entries; clearing does not erase job receipts.

## Open acceptance gaps
- Full private runner/S3/GPU roundtrip, desktop SSE consumer and deployment hardening.
- Normalized entity migrations/schema parity; derivatives other than video posters, prompt version history.
- Browser/training/Homer interfaces require later implementation; no fabricated contract.

## Native document startup
- Finder Opened events may precede Tauri setup/Ready on macOS.
- A shared, deduplicated path inbox exists before the native app is built.
- Studio receives that same inbox during setup; event callbacks never read unregistered managed state.
- Existing opened-projects event / take_opened_projects frontend contract stays unchanged.

## Notebook node contract
- Agent node ID is allowlisted by relay; claims/reports/heartbeats are scoped to that node.
- Notebook DEVICE=auto selects available CUDA workers up to GPU_COUNT, or one CPU worker. DEVICE=cpu bypasses NVIDIA checks, uses --cpu and a cpu0 node ID; DEVICE=cuda requires GPU_COUNT devices. Per-worker agents/ports remain isolated; receipt before remote submission.
- Runtime loss -> offline node/unknown attempt, never automatic replay.
- Verified Linux x86_64 archive; current CI bundles mymovie-agent, mymovie-relay and runtime/compiler helpers. SHA256 required before extraction; bounded, architecture-validated binaries.
- Notebook defaults to local authenticated relay on custom RELAY_PORT, agent → loopback relay and cloudflared → relay only. ComfyUI stays loopback. Stop owns relay/tunnel/agents/managed servers; Attach leaves an existing ComfyUI alive.
- Temporary trycloudflare.com addresses require explicit desktop polling selection; desktop uses REST polling, without SSE. Session/tunnel changes require new address/node IDs.
- get_runner_tokens({saved?:bool}) -> {MYMOVIE_AGENT_TOKEN, MYMOVIE_DESKTOP_TOKEN}; defaults load without vault access. Only explicit saved=true retrieves the private runner-token-pair. save_runner_tokens({tokens}) writes custom pairs atomically; saving public defaults needs no vault. Distinct 24–512 printable ASCII characters, no spaces.
- deploy/node-auth.defaults.json is the single public, user-selected test pair, embedded into UI/native and generated notebook configuration. Optional env/Secrets overrides are commented out. Custom pairs never enter settings/project JSON or logs.
- Connections using public defaults store a connection:<id>:test-default marker, not a vault item. Existing relay connections with no credentialRef resolve the bundled desktop default without vault access; other provider types still require their own credentials. New/missing-credential agent forms inherit the active Node access pair, including explicit private selections; saving an empty new relay field selects that pair. Custom desktop tokens use a connection vault reference and process-local cache; agents receive only the agent token. Passive polling never unlocks an uncached private credential; explicit Check/Initialize unlocks it for this session. Updating node tokens does not rotate saved connection credentials.
- Editing an exact connection:<id>:test-default marker fills the bundled desktop test token, regardless of the active Node access pair. Show/Hide and Copy operate only on the form value; they never retrieve a private connection credential. Connection fields reopen masked. Copy does not save or change credentials.

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
- Installation rehashes source/destination bytes (including plugin files), bypassing timestamp-based inventory caches before reuse or conflict decisions.
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
- registryHash `scope-v1:<SHA256>` covers only used node schemas, static choices and Python module identity. Known dynamic model/media choices are excluded; selected models validate live before staging. New preview/freeze refreshes legacy/changed profiles; frontendHash remains separate compilation provenance. Historical attempts keep their final dispatch guard.
- install_workflow({workflowId,connectionId}) and agent workflow-install --publish-to-comfyui publish only normal editor sources to workflows/MyMovie/<slug>-<hash16>.json. Bounded Userdata GET/POST(overwrite=false)/readback; receipt installed/reused/libraryPath/sourceHash/loadedCanvas=false. Default agent install remains registry-only.
- remove_recent_project({path}), clear_recent_projects(): history only; close_project flushes the frontend save queue before Welcome.
- video_thumbnail({assetId}) generates optional bounded hash-identified JPEG; native poster protocol resolves registered asset IDs and confined derived paths.
- AppSettings.dismissedQueueJobIds defaults []; Clear finished records only completed/failed/canceled IDs. Other states remain visible regardless of IDs. Settings saves union persisted dismissal IDs, and native save_settings returns the merged value. UI refreshes preserve the same monotonic union. Stored outside movies; job history/results are untouched.

## Reusable forms (0.1.8)
- save_workflow_form({workflowId,connectionId?,bindings,layout}) -> Project: validated base form and selected-profile layout, exact node/input identity; graph/source hash immutable.
- Explicit bindings replace generated descriptors for the same literal field; duplicate field/semantic assignments, graph links and incompatible media/type pairs fail.
- Hidden/Advanced values remain submitted; unreachable loader media is inactive and its imported literal is retained.
- Preparation preserves saved layouts/values and uses session/revision checks around outside-lock registry/compiler I/O. Structural errors retain the draft for correction.
- Generate uses Custom for new standalone drafts; older mode/context values remain readable. Jobs Edit/Reuse restores exact values/media into Generate.
- Render tags/provenance derive from job.results asset IDs; Renders contains unique shared assets and links all producing attempts.

## Designer wrappers and selected tasks (0.1.12)
- Workflow.wrapper defaults: familyId/variantName/collection/description/readme/illustration?/os/architecture/precision. Family identity is a UUID; every variant retains immutable graph/version and independent requirements.
- Illustrations: embedded PNG/JPEG/WebP only, <=4 MiB data URL; UI imports <=2 MiB. README <=128 KiB, no raw HTML execution.
- InputLayout.optional defaults false. Unassigned optional media preserves the literal default; explicit invalid assignment still fails.
- Portable JSON: format=mymovie.workflow-collection, schemaVersion=1, workflows[1..64], <=16 MiB. Hashes/identities validated; preparations/lastTarget/deployments stripped; private sourceRef replaced with configure-private-source.
- export_workflow_bundle({workflowId,collection,path}) writes .mymovie-workflow.json. import_workflows accepts editor/API JSON or this wrapper; same immutable graph identities reuse catalogue entries.
- JobDraft.queuedJobIds defaults []; subset queue edits replace only these paused unsent attempts atomically. queuedRunId retains whole-idle-batch replacement.
- control_job_tasks({jobIds,action:resume|cancel}) validates all selected attempts before atomic mutation; started/unknown/terminal tasks are excluded.
- notebook_setup_script({host:colab|kaggle}) returns configuration/start code, excluding the notebook Stop cell.
- Notebook release_artifact(repository,tag,download_token,require_relay=True) returns {source,sha256,tag}; published prereleases are eligible. Source URLs are constructed GitHub asset API endpoints. Metadata target/checksum and available GitHub digest must agree; local relay mode requires relayBinarySha256 and an actual relay in the verified archive. Blank source/hash selects discovery; custom source requires an explicit SHA256.
- Notebook prepare_runtime(binary,comfy_root,revision,work_dir,tunnel_source?,tunnel_sha256?,cpu=false) returns {python,cloudflared}. Existing conflicting checkouts are preserved; stage markers include CPU/CUDA mode and require live device/browser validation. NotebookRunner.start(python=...) uses that interpreter for ComfyUI and agent runtime/compiler operations. Generated Run all reuses healthy workers and never invokes Stop or bounded shutdown by default.
- for_setup permits validated immutable pending editor sources for dependency review; for_target rejects unprepared execution. Agent returns needs-restart or needs-preparation before readiness/canary.
- Settings migration converts the retired provider kind to retired, retaining IDs/names/vault references. No generation adapter handles retired destinations.
- Schema v5 upgrade backs up existing package database and manifest before migration; older apps cannot edit v5.

## Guided example initialization (0.1.16)
- WorkflowWrapper adds optional exampleId and default-empty pythonPackages (bounded exact name==version pins); older movie JSON defaults remain readable.
- Built-in examples use stable UUIDs ending 0101/0102/0103; pinning reuses an existing movie copy. Portable export preserves only the known built-in rembg sourceRef exception.
- plan_deployment accepts guided=true and optional reviewId. Guided mode derives requirements from the selected workflows instead of a legacy manually saved profile.
- Review returns reviewId, profile, inventory, plan, managedRuntime, restartSupported and restartRequired. Apply must match the exact review, workflow digest, session and runtime fingerprint.
- Initialization may return needs-restart or needs-preparation; neither permits generation. Only a prepared graph plus verified dependencies and a current-session canary establishes readiness.
- runtime-restart is an allowlisted control action. Agent --supervisor uses UUID file requests; notebook supervisor supports restart-comfyui only and refuses busy/shared or unmanaged workers.
- restart-required.json is written before plugin/wheel mutations and removed only after all managed workers become ready. runtime-epoch.json invalidates earlier attestations after restart.
- Python dependencies resolve to a full binary wheel closure: exact version, HTTPS files.pythonhosted.org URL, public PyPI verified SHA256/size/license and native architecture. No arbitrary remote shell or source builds.
- Agent manifests advertise guidedSetupVersion=1 and managedRestartVersion=1. Matching 0.1.16 binaries are required; local implementation does not imply hosted release or live GPU acceptance.

## Guided desktop orchestration (0.1.17)
- No protocol change. Initialize inspects with guided=true/apply=false; Install & prepare consumes reviewId, applies, requests managed restart if required, prepares/publishes on that same connection, then obtains a fresh review and verifies readiness. Maximum three apply passes.
- A changed selection invalidates the review. Busy operations lock the modal target and setup/editor tabs; identity/unmount guards stop subsequent steps after navigation.
- Direct ComfyUI Userdata publication preserves immutable hashed names/readback and reports unreachable/timeout/HTTP refusal distinctly with the selected base URL.

## Durable initialization and private console (0.1.18)
- WorkflowWrapper adds archivedAt?: string and initialization: [{name, script, directory, timeoutSeconds, policy}]. Defaults preserve existing documents. Max 32 steps; timeout 1–3600; policy recipe/session; working folders confined beneath canonical ComfyUI root. Portable exports carry recipes and clear archivedAt/profiles.
- clear_workflow_trash() -> Project removes only archived movie workflow catalogue entries. Immutable source files, revisions and frozen job receipts remain; ordinary save still rejects source removal.
- Native: start_initialization(connectionId,workflowId,reviewId), list_initializations(connectionId), cancel_initialization(connectionId,operationId), apply_initialization(connectionId,operationId), archive_workflow(workflowId,archived), console_request(connectionId,sessionId?,command?).
- Relay command kind initialize snapshots workflows/sourceWorkflow/projectId/connectionId/reviewId. Identical active requests reuse the operation; different active initialization on the node returns 409. GET /v1/nodes/{node}/operations lists latest 100 initializations without payloads.
- Agent reports progress {stage,detail,startedAt,updatedAt,bytes?,totalBytes?,log[]} (latest 128 rows), lastContact, terminal report/error through the existing lease. Cancellation stops helpers; completed files/step receipts remain. Agent restart reconciles local interrupted receipts as failed, never replays scripts automatically.
- Shared workers may rebind after waiting only if reviewed artifacts/nodeTypes/canary remain identical; changed resolution needs user review. Readiness remains full runtime/session-bound; recipe success keys exclude Python dependencyHash to avoid self-invalidating scripts.
- POST /v1/nodes/{node}/console; GET /v1/consoles/{id}; POST /v1/consoles/{id}/input; POST /v1/agent/nodes/{node}/console. Input/output sequence ACKs are monotonic, repeated output is idempotent. Commands input/resize/close; max 128 queued, output 256 KiB, session 30 min.
- Console/custom scripts require non-default tokens at relay and agent plus --allow-console. Agent heartbeat advertises initialization/console/customScripts capabilities. Console opening invalidates attestation/requires restart; tokens excluded from child environments.
- Agent release metadata adds initializationVersion=1 and consoleVersion=1. Matching 0.1.18 agent/relay required; a desktop build alone is insufficient.

## Notebook export (0.1.19)
- `export_notebook(host: colab|kaggle, path: .ipynb)` writes the bundled notebook atomically; no runtime/credential installation occurs. UI filenames include app version. Notebook `NOTEBOOK_VERSION` must match package version.
- Terminal `resize` uses measured rows/columns in Fit window mode (20–300 columns, 5–120 rows), debounced 150 ms. Closing restores the prior native full-screen state without closing the remote session.

## Global Studio (0.1.20)
- get_workspace/save_workspace: application Project-compatible DTO with no Movie prerequisite. get_project/save_project: selected Movie only. close_project does not stop global workers.
- workspace.sqlite owns global entities/receipts; movie_migrations journals source identity/revision/historyHash and stable workflow-ID mappings. Historical nonterminal submissions become unknown for reconciliation.
- JobDraft.context may retain frozen Movie episode/character/prompt provenance; standalone generation requires none. Attach uses global source paths; Collect materializes linked originals for portability.
- ZIP .mymovie-workflow: manifest + collection JSON, SHA256, <=20 MiB archive/16 MiB collection. All family variants exported together; complete graphs retained. Legacy schema-1 JSON accepted.
- WorkflowWrapper.sampleMedia defaults []: nodeId/input/name/label/sha256/image. Up to 8 PNG data URLs, <=4 MiB each, validated digest; content-addressed import reuses existing assets.
- Metrics: sampledAt, cpuPercent?, ramUsedBytes?, ramTotalBytes?, memoryKind, gpus[]. No reading is represented as an unavailable sample, never fabricated zero utilization.
- Console lifecycle: open/reuse private session; input/resize/close ordered; detach preserves session. Input is never replayed after transport errors.
- Local supervisor ports: ComfyUI 8191, relay 8789, agent no inbound listener. Private tokens persisted 0600; custom scripts and console opt in.

## Model credential handoff (0.1.21)
- Native model_token_status() -> bool (no vault read), save_model_token(token), remove_model_token(). settings.storage.huggingFaceTokenConfigured is non-secret status, preserved across stale Settings saves. Secret reference model:huggingface never returns to React.
- Desktop POST /v1/nodes/{node}/credentials/{operationId} {hfToken}: private token pair, allowlisted node, fresh capability modelCredentials=true. UUID operation; 64-entry bound; memory only; expires after 600 seconds. DELETE same path discards abandoned handoff.
- Agent POST /v1/agent/credentials/{operationId} {nodeId,leaseToken}: agent auth, matching unexpired running initialize lease, consumes value once. Expired/missing value -> 410, lease mismatch -> 409. Cancellation discards unconsumed values. No SQLite, events or job payload contains the secret.
- Durable initialize payload adds modelCredentialRequired:true only; handoff precedes queue submission and is deleted on dedup/refusal. Agent task-local scope ends with initialization. Node-local HF_TOKEN/HF_TOKEN_PATH/HF_HOME remains fallback.
- Shared public defaults cannot forward desktop model secrets. Matching agent/relay 0.1.21 required; release metadata modelCredentialsVersion=1. HF redirects never carry authorization across origins. Gated access must be granted to the token's account.
