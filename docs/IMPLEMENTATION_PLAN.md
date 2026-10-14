# Implementation Plan: MyMovie Studio for macOS

> Historical plan: hosted-provider steps are superseded by the 0.1.12 ComfyUI wrapper implementation.

Date: 2026-10-13
Status: Proposed; implementation has not been approved.
Approval scope: Phases 0–3 below, delivered in tested increments: native studio, multi-account jobs/batches, and the private relay/runner/S3 system. Live cloud acceptance requires the selected image/hosting/storage and authorized workflow inputs; paid resource creation is excluded. Later prompt-AI, Homer, browser/training and additional-platform milestones retain separate integration plans.
Design prerequisite: fulfilled by drafts/index.html. Rebuild the exported board as typed components and design the remaining requested views using its shared Fenki shell. Implementation approval is still pending.
Environment decision: user confirmed Docker first using OrbStack; no RunPod rental is needed for initial validation. LTX API/editor and MINIMAX API exports supplied and inspected; Docker CPU smoke remains separate from these model-heavy graphs.

## Goal

Build a real, portable macOS film studio in auteur: Finder document packages, shared assets and characters, an ordered Keyframes storyboard, imported workflow bindings, durable generation jobs, and traceable results. Use Fenki's palette, tidy rem-based layout, an original icon, native progress, English/Russian/French documentation, and verified ARM64 app/DMG packaging. Preserve Apache-2.0 OR MIT licensing and push tested changes to the requested repository.

## Existing behavior

- The repository has the original .gitignore and two license files, planning documents, and the untracked drafts/index.html export; there is no application, test suite, or dependency manifest.
- The six compact project-memory files were absent and have been created as documentation only.
- Origin is https://github.com/gubnota/auteur.git; latest inspected commit is 195713e, dual licensing.
- Node 26.8.2, npm 11.19.1, Rust/Cargo 1.96.0, Xcode 26.6, FFmpeg and FFprobe are installed on this ARM64 Mac. Dependency compatibility still needs build verification.
- OrbStack and Docker commands are available. Read-only health checks could not connect to either 127.0.0.1:8188 or debian.orb.local:8188; this does not establish that ComfyUI is installed or configured elsewhere.
- User currently uses retired hosted provider and selects an ordered storyboard with scene/shot lanes. Base44 board export supplied; the latest eleven requirements expand editing, navigation, multi-account and private-runner scope.
- User supplied LTX API/editor and MINIMAX API exports. Static structural inspection found no missing node references; custom node/runtime validity remains unverified. docs/WORKFLOW_AUDIT.md records exact binding candidates and risks. The supplied retired hosted provider page identifies a separate AI App, with no visible app-specific input mappings; no live provider test has run.
- An API credential was supplied in conversation. It has not been written to files, used, or recorded in this plan. Rotate it and enter its replacement through Keychain-backed settings after implementation.

### Inspected reference patterns

- astrofenki/apps/web/app/globals.css supplies the actual Fenki palette. Reuse colors, not its remote font imports or compressed stylesheet conventions.
- homer_studio uses Tauri document registration, package/legacy audio formats, atomic project metadata, and Ready/Opened event handling that avoids duplicate windows on cold launch. Tier 1 will use supported application opening and exported audio; no internal worker API is assumed public.
- unipuni supplies a real AppKit Dock badge implementation and atomic LoRA publication. Adapt the Dock pattern to aggregate jobs; verify training artifacts by hash and architecture rather than file size alone.
- whatsapp-sender demonstrates isolated LocalAuth identities and a visible browser. It has no general browser-profile manager; do not copy its messaging logic or session files.
- Reference repositories remain unchanged.

## Proposed approach

### Delivery order

1. Phase 0: architecture, contracts, ERD, threat model, supplied-design mapping and approval of this revised plan.
2. Phase 1: native document lifecycle and welcome screen; portable libraries/characters; complete episode/scene/keyframe editing; imported workflow bindings; durable local ComfyUI execution; all requested navigation views and explicit sample content; original icon, native progress, ARM64 app/DMG and three READMEs with actual screenshots.
3. Phase 2: multiple retired hosted provider accounts and ComfyUI connections, account-scoped deployments/uploads, batches, per-target admission limits, failed-only retry, reconciliation and truthful available cost information. Implement Workflow and AI App transports with official fixtures and authorized live acceptance.
4. Phase 3, mandatory and included: real outbound runner/relay, replayable SSE, private S3 LoRA synchronization and output collection, bulk workflow deployment plans, pinned dependency resolution, standard-image bootstrap and shared verified cache. First prove the system in a local Docker integration environment, then validate on the chosen private RunPod image and storage. Live configuration may remain pending; fixture success never substitutes for private-pod acceptance.
5. Phase 4: Ollama structured prompt assistance, continuity, first/last-frame chaining and render comparison/approval.
6. Phase 5: Homer Tier 1, then a versioned opt-in Tier 2 contract where supported; release hardening and signing/notarization path.
7. Phase 6: Intel macOS, Linux x86_64 and Windows x86_64 builds.
8. Subsequent browser/training milestone: isolated manual-login profiles for Flow/other providers; approved per-site automation; remote photo/video LoRA training and private artifact publishing.

Phase 1 includes real editable provider/profile configuration and all requested screens. Runtime actions become available when their phase's backend and connection validation pass. Explicit sample-project data is separate from service state; no fake tasks, connection health or success notifications represent live work. No additional Base44 exports are required.

### Desktop and design

- React 19, strict TypeScript, Vite and Tauri 2; Rust domain crates and SQLite. Use requested Radix, Tailwind, Zustand, TanStack Query, React Hook Form and Zod where each owns a distinct responsibility. dnd-kit supports the ordered board; Lucide provides UI icons.
- Base44 exports are visual references. Rebuild interactions as typed repository components; review any supplied code before reuse. Keep drafts/ out of Git.
- Shared workspace: left navigation for Keyframes, Characters, Library, Workflows, Renders, Servers/Nodes, Notifications, Logs and Settings; top editable movie/episode chooser; contextual right inspector; bottom render queue. Every tab has its own view. Persist pane sizes and support a 14-inch MacBook layout.
- Fenki light palette: ink #171715; paper #f6f3eb; elevated paper #fffdf8; moss #d7ff72; pale moss #efffcf; rust #ffb38e; blush #b9adff; sky #9bdcff; yellow #ffe56d. Semantic colors require readable text and status labels, not color alone.
- Define spacing, typography, radius, border and focus tokens once. Use rem for type and layout spacing; reserve pixel values for actual media dimensions and device-level borders where appropriate. Separate tokens, base rules, layout and feature styles; avoid scattered inline padding or duplicated selectors.
- Bundle legally redistributable Manrope and IBM Plex Mono fonts with their licenses. No runtime remote font dependency. Deliberate dark tokens, visible focus, reduced-motion support and accessible contrast.
- Original film-frame/branching-node icon: SVG source, PNG sizes, .icns and Tauri icons; no default branding.

### Supplied prototype audit and required UI behavior

Static source audit of drafts/index.html; the browser refused the local-file preview, so runtime appearance is not yet verified. Keep this export unmodified and untracked. Its bundled application is visual reference, not the source architecture.

- Already represented by source callbacks: modal project/episode/search/scene pickers, rename, empty-episode view, per-frame comments/prompts/character selection/deletion, aspect presets, queue drag handle.
- Missing real behavior: save is a timer; state is memory-only; navigation changes a label but renders the board for every tab; new-project creation is empty; empty-view Open/Import buttons have no callbacks; a newly created episode has no lane, making its first-frame action ineffective.
- Data defects to avoid: cross-lane drag mutates shared arrays and does not update frame.shotId; new IDs use timestamps; job cancel only removes a demo row. Rebuild these around UUIDs and persisted domain transactions.
- Queue resize uses the opposite delta for a bottom divider, lacks pointer-cancel cleanup and keyboard separator controls. Correct the direction and persist bounded expanded/collapsed state.
- Some edit/delete buttons are tiny and hover-only. Expose visible, named, keyboard-reachable actions with comfortable targets.

| User requirement | Planned behavior and acceptance |
| --- | --- |
| 1. Modal selections; names; first frame | Shared large searchable picker for project/episode, scenes, search results, characters, ratio, workflow and account choices. Rename movie and episodes durably without changing UUIDs. Storm and any empty new episode show first-frame/import actions; first-frame creation atomically creates a default scene/shot if needed. |
| 2. Queue divider | Drag upward expands the bottom queue; collapse/expand and keyboard resize work; pointer cancellation restores normal cursor and focus; size persists and clamps after window resize. |
| 3. Comments/common prompts | Add/edit/delete timestamped comments; edit/clear project common positive/negative prompts and optional scene overrides. Save/restart/move preserves edits; old job prompt snapshots remain traceable. |
| 4. Frame editing | Distinct moss Add keyframe action in every lane and empty state; visible frame delete, editable participating character revisions and positive/negative prompts. Delete board membership while retaining assets/results/history. |
| 5. Navigation/demo | Dedicated Characters editor and functioning Library, Workflows, Renders and Settings views. Open sample project includes original image/video fixtures, characters, example definitions and clearly marked sample results. |
| 6. Welcome | Create/open/recent .mymovie packages; native open/save-location dialogs; cancel creates nothing; existing destination is not overwritten. Finder opens bypass welcome into the selected package. |
| 7. Desktop controls | Styled semantic inputs/textareas, custom checkbox/toggle visuals and modal/list choices. No native HTML select appearance or browser-default control CSS. Focus trapping, Escape/cancel, validation and VoiceOver semantics remain intact. Native file dialogs deliberately use macOS controls. |
| 8. Notifications/logs | Dismissable timed toasts pause on hover/focus; notification history has read/dismiss/clear controls. Logs view has filters, redacted detail/export and Clear. Clearing UI history/diagnostics does not remove durable job receipts or cancel work. |
| 9. Ratios | Project default and frame inherit/override: 9:16, 16:9, 1:1, 3:4, 4:3, 2:3, 3:2, 21:9, plus validated custom width:height. Display inherited source. Actual pixel dimensions obey the selected workflow's constraints; changes never rewrite previously submitted jobs. |
| 10. Servers/accounts | Manage multiple ComfyUI nodes and retired hosted provider accounts; test capability/health; choose execution target per job; account-scoped workflow mappings, limits and uploads. Servers view offers connection help, client installation, initialization, Doctor/inventory and setup progress. |
| 11. Private storage/runner | Settings includes S3 endpoints/bucket/prefix, secure credential entry, LoRA manifest/sync and transfers. Servers includes private-pod setup and bulk workflow/profile initialization, dependency diff/approval and readiness. Runner sends outputs through private S3 and outbound relay without public ComfyUI access. |

Modal choice controls share one component with large selectable rows, typeahead, keyboard navigation and explicit apply/cancel for multi-selection. Ordinary text editing remains inline or in focused edit dialogs rather than launching a modal for every keystroke. Custom CSS covers all control states, including disabled/error/focus.

### Portable document and storage

Project core owns the package, migrations, locking and write transactions. SQLite is authoritative. Human-readable snapshots are versioned projections, not a second writable database.

```text
Title.mymovie/
  manifest.json
  project.sqlite
  library/characters/<uuid>/
  library/locations/<uuid>/
  library/props/<uuid>/
  library/styles/<uuid>/
  library/motion-references/<uuid>/
  library/voice-references/<uuid>/
  episodes/<episode-uuid>/screenplay.md
  episodes/<episode-uuid>/production-sheet.json
  episodes/<episode-uuid>/scenes/<scene-uuid>/shots.json
  episodes/<episode-uuid>/scenes/<scene-uuid>/keyframes/board.json
  workflows/<workflow-uuid>/<version>/definition.json
  workflows/<workflow-uuid>/<version>/comfy-api.json
  workflows/<workflow-uuid>/<version>/bindings.json
  jobs/submissions/<attempt-uuid>.json
  jobs/receipts/<attempt-uuid>.json
  media/originals/<sha256>.<ext>
  media/derived/
  media/proxies/
  media/thumbnails/
  media/exports/
  integrations/homer-studio.json
```

Create reserved directories when needed rather than filling them with placeholders. The Homer metadata file is created only when a link exists. Future requirements/lockfiles accompany pinned workflows; do not embed downloaded model weights by default.

- Stable UUIDs and foreign keys; SHA-256 deduplication; package-relative paths for copied media. Explicit external links show missing-file state and support consolidation into the project.
- SQLite transactions, single writer/project lock, migration backup, schema-version checks, bounded writes, foreign-key enforcement and safe WAL checkpoint before portable export/copy.
- Atomic temporary-file promotion. A revisioned projection journal repairs stale JSON after a crash between SQL commit and snapshot write. Never pretend DB and filesystem writes form one atomic transaction.
- Reject traversal, unexpected symlink escapes and untrusted path instructions. Preserve immutable original media and derived provenance.
- Initial tables cover Series, Episode, Scene, Shot, Character, CharacterRevision, Location, Prop, StyleGuide, Asset, AssetVariant, AssetReference, PromptVersion, KeyframeBoard, KeyframeLane, Keyframe, KeyframeComment, KeyframeCharacterReference, WorkflowDefinition, WorkflowVersion, DeploymentBinding, Job, JobAttempt, RemoteUpload, Render and DependencyEdge. Project/scene prompt settings and project/frame ratios are versioned. AudioLink belongs to the later Homer milestone.
- Separate application-data app.sqlite owns global account/connection/profile records, credential references, UI preferences and bounded notifications/diagnostic logs. These are not copied into .mymovie. Phase 3 adds agent inventories, deployment plans and transfer records. Projects pin reproducible workflow/requirements/lock definitions, while account secrets and downloaded model caches stay outside packages.

### Keyframes Board

- One ordered scene board with shot lanes. Frames are ordered within lanes; an overview follows episode scene order. This is not a free-position canvas.
- A frame has UUID, asset reference, optional shot link, prompt-version reference, character-revision references, caption, status and timestamped comments. Its identity survives reordering and replacement of the displayed asset.
- Inspector adds/edits/deletes comments and edits/clears positive/negative prompts and participating character revisions. Character editor creates immutable revisions, edits reference media and retires records without breaking historical links.
- Common prompt composition is explicit: project common text, optional scene replacement, then frame additions with per-frame inclusion controls. Preview the resolved positive/negative prompt before submit and freeze versions/text in the attempt. Clearing common text affects future composition only.
- Project/episode rename changes display metadata, not entity IDs or package location. Frame ratio is either inherited or a positive rational override; project default changes update inheriting frames only. Dimensions are separately validated against graph/provider constraints.
- Drag within/across shot lanes; support keyboard move commands and accessible announcements. Dragged library assets create frame references without duplicating media. File drop imports first and then attaches the resulting asset.
- Reorder contract: board ID, expected revision and complete ordered lane/frame IDs; validate membership/duplicates, update frame.shotId together with lane membership/order in one transaction, increment revision, regenerate board.json. Conflicting revisions return a recoverable conflict instead of overwriting another edit.
- Clear deletion behavior: remove a board reference without deleting shared media; confirm deleting a scene with references/jobs. Cancelled drags and failed saves restore the last persisted order.
- Acceptance: reorder, annotate, restart, move the whole package to another directory and reopen; order, prompts, comments and character links must persist.

### Workflow and provider contracts

- Preserve unknown properties in real ComfyUI API graphs; explicitly map node/field bindings. Separate logical UUID, immutable graph version/hash, graph node ID, account-scoped workflowId/webappId, deployment ID and returned task ID.
- Semantic slots include identity_reference, first_frame, last_frame, motion_video, source_video, audio_track, mask, location_reference and prompt. Type/capability support comes from the graph and provider schema, not guessed node names.
- Supplied LTX: bind positive 121.text, negative 110.text, FPS 285.value, duration 291.value, target dimensions 292/293.value, image 167.image and seed 364.seed only after registry validation. Preserve its two-pass schedule, resize dependencies and unknown fields. MINIMAX: typed parse/edit/re-encode of 29.track_data, preserving tracks, segments, continuity and references; stage nested image paths deliberately. Validate disconnected SaveVideo node 35 rather than silently deleting it. Attached graphs remain distinct from retired hosted provider AI App 2021554630848684033.
- Keep heavy graph originals as user project imports. Exercise safe minimal graph fragments and sanitized multitrack strings in graph_bindings.rs; no original prompt/private-media values in tracked fixtures. No model origins, license rights or runnable deployment are inferred from filenames. Resolve concrete random seed before submission only when the actual node contract supports it.
- The supplied AI App page documents v2 Bearer-authenticated run/ai-app/<id> and query endpoints, task states and 24-hour result URLs. Its example omits nodeInfoList despite listing it as required and uses a string for usePersonalQueue despite a Boolean table type: validate actual schema before submission. Collect results promptly and recover expired transfers without resubmitting billable work.
- Global workflow registry lives in app data; pin an immutable version into each project. Hosted equivalents require explicit mapping; matching model family is not proof of compatibility.
- Rust ExecutionBackend: health, capabilities, stage_assets, validate_job, submit, status, cancel, collect; optional estimate_cost/list_models. Provider-specific payloads stay in adapters.
- Native ComfyUI uses real HTTP APIs plus WebSocket events and history reconciliation. Remote owned relay will use SSE with durable event IDs, Last-Event-ID replay, bounded backoff and history catchup. Commands remain authenticated HTTPS requests. Do not label ComfyUI's native transport SSE.
- retired hosted provider: select the documented API family, retrieve/validate authorized schema, upload real files as documented, capture remote identifiers and return results. Workflow, AI App and standard-model payloads are distinct. Use opaque Keychain credential references; never persist the supplied chat key.
- Multiple selectable retired hosted provider accounts and ComfyUI targets are included in this plan. Admission limits apply per account/target, upload caches are keyed by account and asset hash, and a workflow mapping is never assumed portable across accounts. Batch expansion snapshots each selected frame/variant and execution target; failed-only retry creates explicit new attempts after reconciliation. Redact authorization headers, signed URLs and provider diagnostics.
- Persist immutable submission and attempt state before network submission. Ambiguous submission becomes unknown/reconcile-required; never automatically resubmit a possibly billable request. Cancellation respects provider capability and never globally interrupts a shared ComfyUI instance.
- States: draft, validated, staging, ready, submitted, queued, running, collecting, completed, failed, cancel_requested, canceled, unknown and paused. Reopening resumes reconciliation; retrieved outputs attach to exact scene/shot/frame with graph/prompt/model/account provenance.

### CPU-only ComfyUI verification

- After approval, use Docker on the confirmed OrbStack context for CPU ComfyUI and the relay/storage integration stack. Keep the OrbStack engine running during container builds/tests/services; its GUI window is optional. The Debian machine and native macOS remain alternative endpoints.
- Start with a weight-free image upload/read/preview API graph constructed from the actual node registry or a user-authorized export. Verify staging, submit, events/history, collect and frame attachment without buying a GPU or downloading a large model.
- Pin ComfyUI and Python dependencies only after verifying the actual runtime; document --cpu operation and the tested image/commit. Do not invent an existing Docker image or version.
- This tests the execution pipeline, not diffusion quality/performance. Any small generative model test is a separate authorized fixture with explicit dependencies.
- No RunPod rental or cloud resources are created during this CPU smoke test.

### Media and native behavior

- Detect configured FFmpeg/FFprobe; invoke argument arrays with resource limits and cancellation. Probe media, create thumbnails/proxies/waveform peaks and extract selected keyframes without blocking the UI.
- Tauri commands validate arguments and confine media access to opened packages. Use scoped media URLs; do not give the webview unrestricted filesystem or shell access.
- Register .mymovie UTType, document association and LSTypeIsPackage semantics; test Finder double-click/drop at cold and warm launch. Queue open requests until Ready, deduplicate, and preserve project-lock behavior.
- Aggregate active work for Dock progress. Use determinate progress only when meaningful work units are known; otherwise show active job count/stage. Coalesce main-thread updates and clear badges on terminal/idle states.
- Optional permission-aware terminal success/failure notifications; verify the packaged macOS app and user preference handling.

### Mandatory private runner, S3 and provisioning

- Rust Linux x86_64 mymovie-agent calls loopback ComfyUI and initiates outbound authenticated HTTPS. An owned Rust/Axum relay with single-host SQLite persistence stores jobs, leases, acknowledgements, desired profiles and replayable events. Desktop consumes authenticated SSE through Rust and forwards typed events to the UI. Durable event IDs, Last-Event-ID replay, bounded backoff and history catchup survive restarts; commands use HTTPS. Multi-host relay HA is outside this scope.
- Enrollment tokens are short-lived and narrowly scoped; store token hashes and revoke instance identities. Separate desktop-control and agent permissions. Agents accept only typed operations, never arbitrary shell strings from jobs, imported graphs or the UI.
- Private S3-compatible object storage carries input/output media and approved model artifacts. Relay creates short-lived object-scoped transfer permissions; verify size/hash before atomic import. Desktop credentials are Keychain references, agent credentials are narrowly scoped runtime secrets. Support resume where compatible, cancellation, bounded concurrency and explicit remote retention/deletion policies. No public bucket or pod input/output endpoint is required.
- LoRA sync manifests record hash, immutable version, model architecture, authorized source/license and destination. Upload/download selected compatible artifacts only; compare manifest/inventory, present conflicts and missing permissions, and update a workflow lock after verification. Sync does not implement LoRA training.
- Deployment profiles reference selected immutable workflow versions, requirements and runtime locks. The resolver needs approved sources, pinned commits/revisions, hashes, licenses and runtime constraints; graph filenames alone cannot identify model origin or compatibility. Unknown dependencies remain BLOCKED. API-only proprietary models remain provider-only. No implicit whole-catalog model download.
- Bulk initialize first produces a per-target plan: workflow hashes, missing node/model/LoRA dependencies, disk/runtime requirements and conflicts. Only reviewed eligible workflow versions are submitted to the runner. Preserve hosted workflow definitions but exclude them from self-hosted installation; report why. Idempotent deployment IDs/revisions and READY_FOR_WORKFLOW gates prevent duplicate installation or premature jobs.
- CLI: mymovie-agent bootstrap, provision --profile <id>, doctor, serve, inventory. Bootstrap is restartable; persist boot ID, version, profile revision, runtime fingerprint, installation progress and provenance. Discover the actual ComfyUI root/registry and model paths, including extra_model_paths.yaml.
- Use a pinned precompiled Linux agent with SHA-256/signature verification. Inspect the chosen standard image's ENTRYPOINT and supervision before writing its startup wrapper; never assume /start.sh. Preserve original image initialization exactly once. A custom image is optional only if the chosen standard hook cannot safely install dependencies.
- Download missing/mismatched authorized nodes, Python dependencies and model artifacts into partial files, enforce free-space/size/hash checks, then atomically promote. Support immutable Hugging Face revisions, approved HTTP sources and private mirrors with secret redaction. Lock per object across concurrent workers; use verified content-addressed cache metadata and rehash on uncertainty.
- Compatible Network Volumes reuse verified weights; runtime/node environments are reused only when fingerprints match. Verify actual region/permissions/attachment support. Keep ephemeral inputs/outputs separate, and never put credentials in shared mounts. Without a volume, exact required resources download onto pod storage.
- Conflicting runtime requirements use isolated pools/profiles. Drain/restart, canary validation and rollback preserve running jobs. A node becomes schedulable only after installed types, bindings, artifacts and a canary workflow validate. Disconnected/unknown jobs reconcile to leases/tasks rather than resubmit blindly.
- Servers/Nodes help generates copyable installation/enrollment instructions for the verified image/profile. Direct ComfyUI connections cannot execute remote initialization commands; those actions require the authenticated runner capability. Typed Doctor, inventory, provision and drain/restart controls show actual setup state/errors. Ordinary fully resolved new-pod setup requires no SSH.
- Local acceptance uses Docker ComfyUI CPU + relay + private S3-compatible test storage and original tiny media. Cloud acceptance then verifies the selected standard RunPod image with no public IP/ComfyUI port, real multi-MB transfers, disconnect/reconnect and fresh-pod provisioning. Docker acceptance is not represented as RunPod acceptance. No paid pod is created without a spending decision.

### Later browser, training and Homer boundaries

- Browser profiles: initially proposed app-owned persistent Chromium directories outside projects, separate locks, manual login and no exported cookies. User has not selected the browser/login-automation scope yet; settle it before this milestone. Installed default Chrome profiles must not be assumed automatable.
- Training: select a model/trainer and immutable training recipe before implementing a job. Track dataset approval, architecture/runtime compatibility, artifact hash and lineage; upload only authorized artifacts to private S3 and reference them in deployment locks. No claim that photo/video LoRAs are interchangeable.
- Homer Tier 1: Launch Services open + user-authorized audio exports/import or explicit watched export folder; support its real folder/legacy package formats. Tier 2 requires a versioned authenticated contract and separate backwards-compatible changes/tests in Homer; no cross-repository edits in the first milestone.

## File changes

The following files cover the revised Phases 0–3 scope. All are proposed, not created. Generated lockfiles/icons are included. No files are deleted; existing licenses and drafts/index.html remain unchanged. Image-specific wrapper content is finalized against the selected immutable image before live deployment.

### Workspace and contracts

| Path | Action | Responsibility/change |
| --- | --- | --- |
| .gitignore | Modify | Ignore drafts/, build output, local credentials/session data and generated test artifacts; preserve tracked fixtures. |
| package.json | Create | npm workspace and typecheck/lint/test/build/desktop scripts. |
| package-lock.json | Create/generated | Lock validated frontend dependencies. |
| Cargo.toml | Create | Rust workspace, shared versions and dual-license metadata. |
| Cargo.lock | Create/generated | Reproducible Rust dependency resolution. |
| rust-toolchain.toml | Create | Pin tested Rust toolchain and required targets/components. |
| .github/workflows/checks.yml | Create | Typed frontend/Rust checks and ARM64 macOS packaging artifact job. |
| packages/schema/package.json | Create | Shared runtime contract package. |
| packages/schema/src/index.ts | Create | Zod DTOs and runtime validation for project/board/workflow/job commands. |
| packages/schema/project.schema.json | Create | Portable manifest and snapshots schema. |
| packages/schema/workflow.schema.json | Create | Definition/version/binding/deployment schema. |
| packages/schema/contracts.test.ts | Create | Schema fixtures and Rust/TS boundary parity. |

### Rust domain

| Path | Action | Responsibility/change |
| --- | --- | --- |
| crates/studio-contracts/Cargo.toml | Create | Shared serialization/error dependencies. |
| crates/studio-contracts/src/lib.rs | Create | DTOs, UUID/revision types, redacted structured errors. |
| crates/project-core/Cargo.toml | Create | SQLite/project package dependencies. |
| crates/project-core/src/lib.rs | Create | Public package/record/board operations. |
| crates/project-core/src/package.rs | Create | Safe open/create/lock/checkpoint/consolidate and relative path rules. |
| crates/project-core/src/db.rs | Create | Transactions, migrations/backups and foreign-key checks. |
| crates/project-core/src/board.rs | Create | Frame/comment/common-prompt/ratio/character links and atomic membership/reorder. |
| crates/project-core/src/projections.rs | Create | Atomic JSON projections and crash repair journal. |
| crates/project-core/migrations/0001_initial.sql | Create | Initial implemented entities, constraints and indexes. |
| crates/project-core/tests/project_roundtrip.rs | Create | Restart/move/lock/migration and board conflict tests. |
| crates/asset-core/Cargo.toml | Create | Hash/probe/process dependencies. |
| crates/asset-core/src/lib.rs | Create | Copy/link import, deduplication and derived provenance. |
| crates/asset-core/src/media.rs | Create | FFmpeg/FFprobe argument execution, bounds/cancellation and frame extraction. |
| crates/asset-core/tests/import_safety.rs | Create | Duplicate import, traversal/symlink rejection and interrupted promotion. |
| crates/workflow-core/Cargo.toml | Create | Graph/schema/hash dependencies. |
| crates/workflow-core/src/lib.rs | Create | Immutable import/version, registry and explicit binding validation. |
| crates/workflow-core/tests/graph_bindings.rs | Create | Preserve unknown fields, valid/invalid types and distinct deployment IDs. |
| crates/job-core/Cargo.toml | Create | Async durable job dependencies. |
| crates/job-core/src/lib.rs | Create | ExecutionBackend trait, Per-account/target admission, batches, dependency order and persisted attempts. |
| crates/job-core/tests/reconciliation.rs | Create | Ambiguous submit, restart, scoped cancellation and collection retry. |
| crates/provider-comfyui/Cargo.toml | Create | HTTP/WebSocket adapter dependencies. |
| crates/provider-comfyui/src/lib.rs | Create | Object registry validation, upload/prompt/history/events/collect. |
| crates/provider-comfyui/tests/http_ws_contract.rs | Create | Local fixture server transport and reconnection tests. |
| removed provider adapter/Cargo.toml | Create | HTTP/upload adapter dependencies. |
| removed provider adapter | Create | API-family selection, schema-validated upload/submit/status/results. |
| removed provider adapter/tests/api_contract.rs | Create | Official-shape sanitized fixtures for Workflow/AI App and error/redaction cases. |

### Global integrations and private infrastructure

| Path | Action | Responsibility/change |
| --- | --- | --- |
| crates/integration-core/Cargo.toml | Create | Global settings/account/profile persistence dependencies. |
| crates/integration-core/src/lib.rs | Create | Account/endpoint/profile settings, UI preferences and diagnostic/notification records. |
| crates/integration-core/migrations/0001_app.sql | Create | Application-data tables, opaque secret refs and bounded log retention. |
| crates/integration-core/tests/account_isolation.rs | Create | Per-account mappings/cache/admission and clear-log/audit separation. |
| crates/provision-core/Cargo.toml | Create | Dependency resolver, locks and verification dependencies. |
| crates/provision-core/src/lib.rs | Create | Profile/requirements/runtime locks, dependency diff, gates and typed operations. |
| crates/provision-core/src/download.rs | Create | Bounded resumable hashed downloads, cache locks and atomic promotion. |
| crates/provision-core/tests/provisioning.rs | Create | Unknown/block states, corrupt/partial artifacts, cache concurrency and incompatible profiles. |
| crates/storage-s3/Cargo.toml | Create | S3-compatible transfer/signing dependencies. |
| crates/storage-s3/src/lib.rs | Create | Private object-scoped transfer, manifest sync, hash verification and retries. |
| crates/storage-s3/tests/transfers.rs | Create | Local storage transfer, permission/expiry failures and integrity. |
| crates/provider-relay/Cargo.toml | Create | Desktop relay client dependencies. |
| crates/provider-relay/src/lib.rs | Create | ExecutionBackend adapter, HTTPS commands, SSE replay and reconciliation. |
| crates/provider-relay/tests/replay.rs | Create | Reconnect/restart/event-gap recovery and original task retention. |
| apps/relay/Cargo.toml | Create | Axum relay binary dependencies. |
| apps/relay/src/main.rs | Create | Configuration/TLS-proxy assumptions and service startup. |
| apps/relay/src/lib.rs | Create | Authenticated command/agent routes, leases, desired profiles and durable SSE. |
| apps/relay/migrations/0001_relay.sql | Create | Token hashes, jobs/leases/acks and event journal. |
| apps/relay/tests/lease_recovery.rs | Create | Revocation, lease expiry, duplicate acknowledgements and restart replay. |
| apps/agent/Cargo.toml | Create | Linux x86_64 agent CLI/runtime dependencies. |
| apps/agent/src/main.rs | Create | bootstrap/provision/doctor/serve/inventory command parsing. |
| apps/agent/src/lib.rs | Create | Outbound enrollment/control loop, loopback ComfyUI, provision/collect recovery. |
| apps/agent/tests/typed_operations.rs | Create | Capability/path rejection, no arbitrary shell and idempotent setup. |
| packages/schema/agent.schema.json | Create | Versioned agent operations, leases/events, profile/requirements/lock shapes. |
| deploy/compose.test.yml | Create | Local relay, CPU ComfyUI and private S3-compatible integration services. |
| deploy/relay.env.example | Create | Nonsecret deployment variable names; no usable credentials. |
| deploy/README.md | Create | Local tests and TLS/private-storage/agent deployment steps. |
| scripts/pod-bootstrap/standard-comfyui.sh | Create after image inspection | Verified entrypoint-preserving pinned-agent wrapper for selected standard image. |
| scripts/private-runner-smoke.py | Create | Real local relay/storage/agent job, restart and integrity acceptance. |
| scripts/pod-provision-smoke.py | Create | Chosen image fresh/cache-reuse/corruption/rollback acceptance; user supplies authorized runtime. |
| fixtures/provision/profile.json | Create | Minimal safe resolved deployment profile. |
| fixtures/provision/runtime.lock.json | Create | Pinned fixture runtime/artifact integrity, without private/gated sources. |
| fixtures/provision/blocked-requirements.json | Create | Explicit unresolved dependency fixture. |
| docs/PRIVATE_RUNNER.md | Create | Protocol, bootstrap help, private storage and live acceptance status. |

### Native shell

| Path | Action | Responsibility/change |
| --- | --- | --- |
| apps/desktop/package.json | Create | React/Tauri scripts and UI dependencies. |
| apps/desktop/index.html | Create | Desktop webview entry. |
| apps/desktop/tsconfig.json | Create | Strict TS and workspace resolution. |
| apps/desktop/vite.config.ts | Create | Desktop bundling and Vitest configuration. |
| apps/desktop/eslint.config.js | Create | Typed lint rules. |
| apps/desktop/playwright.config.ts | Create | Browser interaction/visual harness, distinct from native acceptance. |
| apps/desktop/src-tauri/Cargo.toml | Create | Shell/core integration and scoped plugins. |
| apps/desktop/src-tauri/build.rs | Create | Tauri build hook. |
| apps/desktop/src-tauri/tauri.conf.json | Create | ARM64 app/DMG, icon, CSP and document association. |
| apps/desktop/src-tauri/Info.plist | Create | UTType exports and Finder package semantics. |
| apps/desktop/src-tauri/capabilities/default.json | Create | Minimal command/dialog/media permissions. |
| apps/desktop/src-tauri/src/main.rs | Create | Native binary entry. |
| apps/desktop/src-tauri/src/lib.rs | Create | Ready/Opened lifecycle and plugin registration. |
| apps/desktop/src-tauri/src/commands.rs | Create | Validated typed UI/domain bridge and event dispatch. |
| apps/desktop/src-tauri/src/credentials.rs | Create | Keychain accounts, opaque references and redaction. |
| apps/desktop/src-tauri/src/macos.rs | Create | Native menus/Dock aggregate progress and permission-aware notifications. |
| apps/desktop/src-tauri/icons/icon.png | Create/generated | Main raster icon. |
| apps/desktop/src-tauri/icons/32x32.png | Create/generated | Small icon. |
| apps/desktop/src-tauri/icons/128x128.png | Create/generated | Standard icon. |
| apps/desktop/src-tauri/icons/128x128@2x.png | Create/generated | High-DPI icon. |
| apps/desktop/src-tauri/icons/icon.icns | Create/generated | Native macOS icon set. |
| assets/brand/mymovie.svg | Create | Original editable film/node artwork. |
| assets/brand/mymovie-1024.png | Create/generated | Master raster icon. |

### Frontend and tests

| Path | Action | Responsibility/change |
| --- | --- | --- |
| apps/desktop/src/main.tsx | Create | React entry and query/state providers. |
| apps/desktop/src/App.tsx | Create | Project opening and workspace routes. |
| apps/desktop/src/lib/desktop.ts | Create | Typed Tauri calls/events; no direct filesystem/network credentials. |
| apps/desktop/src/lib/store.ts | Create | Local selection/pane/filter state; persisted records stay backend-owned. |
| apps/desktop/src/i18n/en.ts | Create | English UI strings and translation keys. |
| apps/desktop/src/components/Workspace.tsx | Create | Responsive/resizable panes and navigation. |
| apps/desktop/src/components/MediaPreview.tsx | Create | Scoped media preview, timecodes and waveform. |
| apps/desktop/src/components/Inspector.tsx | Create | Accessible contextual forms and validation. |
| apps/desktop/src/components/PickerDialog.tsx | Create | Shared large searchable single/multi-choice modal with focus/keyboard semantics. |
| apps/desktop/src/components/FormControls.tsx | Create | Styled input/textarea/checkbox/toggle primitives and error states. |
| apps/desktop/src/components/ToastHost.tsx | Create | Dismissable ephemeral notifications with hover/focus pause. |
| apps/desktop/src/features/projects/ProjectHome.tsx | Create | Real create/open/recent and package error states. |
| apps/desktop/src/features/library/AssetLibrary.tsx | Create | Grid/import/filter/drag source and asset details. |
| apps/desktop/src/features/library/CharacterLibrary.tsx | Create | Character revisions and location records. |
| apps/desktop/src/features/keyframes/KeyframesBoard.tsx | Create | Ordered scene/shot lanes and accessible drag/drop. |
| apps/desktop/src/features/keyframes/FrameInspector.tsx | Create | Comments, prompt versions, character refs and persistence feedback. |
| apps/desktop/src/features/workflows/WorkflowEditor.tsx | Create | Real graph import, slot binder, deployment validation/dry run. |
| apps/desktop/src/features/jobs/JobQueue.tsx | Create | Durable status/progress, scoped controls and sanitized errors. |
| apps/desktop/src/features/renders/RenderReview.tsx | Create | Imported results, provenance and frame attachment. |
| apps/desktop/src/features/settings/ProviderSettings.tsx | Create | Multiple provider accounts, credential entry, connection tests, limits and capabilities. |
| apps/desktop/src/features/projects/ProjectSettings.tsx | Create | Movie/episode naming, common prompts and inherited aspect defaults. |
| apps/desktop/src/features/keyframes/EmptyEpisode.tsx | Create | First-frame/import actions that create valid default lanes transactionally. |
| apps/desktop/src/features/servers/ServersView.tsx | Create | ComfyUI nodes/private agents, health, inventory, Doctor and setup timeline. |
| apps/desktop/src/features/servers/SetupHelp.tsx | Create | Verified client/bootstrap help, typed operations and capability states. |
| apps/desktop/src/features/servers/DeploymentPlanner.tsx | Create | Bulk selected-workflow diffs, readiness gates and profile deployment. |
| apps/desktop/src/features/settings/StorageSettings.tsx | Create | Private S3 connection, LoRA manifest sync and transfer/retention controls. |
| apps/desktop/src/features/settings/AppSettings.tsx | Create | Theme, notifications, paths and desktop preferences. |
| apps/desktop/src/features/notifications/NotificationsView.tsx | Create | Persistent bounded history with read/dismiss/clear. |
| apps/desktop/src/features/logs/LogsView.tsx | Create | Filtered redacted diagnostics, export and clear. |
| apps/desktop/src/styles/tokens.css | Create | Fenki light/dark/rem design tokens. |
| apps/desktop/src/styles/base.css | Create | Reset, fonts, focus and accessible defaults. |
| apps/desktop/src/styles/layout.css | Create | Workspace/pane responsiveness and consistent padding. |
| apps/desktop/src/styles/components.css | Create | Shared forms/cards/dialogs/status/board rules. |
| apps/desktop/src/test/setup.ts | Create | UI test environment. |
| apps/desktop/src/features/keyframes/KeyframesBoard.test.tsx | Create | Pointer/keyboard reorder, failed save and reference retention. |
| apps/desktop/tests/workspace.spec.ts | Create | Project/asset/board/workflow interactions with an explicitly test-only bridge. |
| apps/desktop/tests/controls.spec.ts | Create | Modal/keyboard accessibility, renaming, first-frame, prompt/comment edits, resize and notifications/logs. |
| apps/desktop/tests/connections.spec.ts | Create | Multiple accounts, storage/private-node setup and bulk validation against test-only transport. |
| apps/desktop/public/fonts/Manrope-Variable.woff2 | Create | Licensed local text font. |
| apps/desktop/public/fonts/Manrope-OFL.txt | Create | Font redistribution license. |
| apps/desktop/public/fonts/IBMPlexMono-Regular.woff2 | Create | Licensed local timecode font. |
| apps/desktop/public/fonts/IBMPlexMono-OFL.txt | Create | Font redistribution license. |

### Fixtures, tooling and deliverable documentation

| Path | Action | Responsibility/change |
| --- | --- | --- |
| fixtures/contracts/board-v1.json | Create | Synthetic nonprivate contract fixture. |
| fixtures/workflows/cpu-image-roundtrip.json | Create after registry verification | Real weight-free ComfyUI graph, never a guessed executable graph. |
| fixtures/retired hosted provider/workflow.json | Create | Sanitized official contract fixture; live ownership separately required. |
| fixtures/retired hosted provider/ai-app.json | Create | Sanitized distinct AI App contract fixture. |
| fixtures/assets/test-frame.svg | Create | Original tiny fixture asset. |
| fixtures/assets/test-clip.mp4 | Create/generated | Short original FFmpeg sample for Library/Renders and video-transfer checks. |
| scripts/comfyui-cpu-smoke.py | Create | CPU smoke setup/check, hash/version report, submit/collect and cleanup. |
| scripts/create-example-project.ts | Create | Generate schema-valid portable sample without credentials. |
| scripts/native-smoke.sh | Create | Packaged cold/warm open/drop and artifact checklist. |
| scripts/capture-screenshots.ts | Create | Deterministic UI reference captures; native screenshots separately verified. |
| ARCHITECTURE.md | Create | Module/data-flow diagrams and detailed architecture entry. |
| docs/DATA_MODEL.md | Create | Entity ERD, constraints and migration strategy. |
| docs/THREAT_MODEL.md | Create | Concrete package/provider/native/privacy boundaries. |
| docs/RELEASE.md | Create | ARM64 packaging, ffmpeg licensing, signing/notarization and native verification. |
| docs/screenshots/keyframes-macos.png | Create after actual app runs | Real native Keyframes Board screenshot, no credential/private data. |
| README.md | Create | English install/use/test/capability status, licensing and screenshot. |
| README.ru.md | Create | Equivalent Russian README. |
| README.fr.md | Create | Equivalent French README. |
| docs/PROJECT_CONTEXT.md | Modify | Current verified milestone, commands and constraints. |
| docs/ARCHITECTURE_INDEX.md | Modify | Implemented file/navigation map. |
| docs/MODULE_OWNERSHIP.md | Modify | Accepted dependencies and owners. |
| docs/API_CONTRACTS.md | Modify | Actual schemas, event names and implemented adapters. |
| docs/DECISIONS.md | Modify | Approved and implemented ADRs. |
| docs/TASK_LOG.md | Modify | Commit/test evidence and unfinished acceptance. |
| docs/IMPLEMENTATION_PLAN.md | Modify | Approved scope/status and justified minor changes. |
| docs/DESIGN_HANDOFF.md | Modify | Export mapping and design review evidence. |
| docs/WORKFLOW_AUDIT.md | Modify | Verified imported graph requirements, binding candidates and live acceptance status. |

## Implementation steps

1. **Approve revised scope.** Map drafts/index.html using docs/DESIGN_HANDOFF.md; record approval in DECISIONS.md. No further exports required. No source/config/dependency edits before approval.
2. **Workspace and contracts.** Root npm/Cargo configs, studio-contracts, schema package and architecture/ERD/threat documentation. Ignore drafts and local artifacts before staging; validate DTO parity and licensing.
3. **Document lifecycle.** project-core package/db/projections and native shell: welcome, create/open/native destination selection, Ready/Opened deduplication, locks, relative paths, crash repair and migrations. Test cancel/collision, unsafe paths and whole-package relocation.
4. **Global settings and shell.** integration-core app.sqlite; Workspace, PickerDialog, FormControls, ToastHost, ProjectSettings and all navigation routes. Implement durable naming/common prompts/ratio settings, pane resize and notification/log clearing. Test modal keyboard/focus, absent browser-default selectors, persistence and diagnostic redaction.
5. **Assets/characters/sample.** asset-core, AssetLibrary, CharacterLibrary and sample generator: immutable imports/dedup/proxies, revisioned characters, missing links/consolidation, original sample image/video and labelled sample results. Verify no sample provider health/tasks can enter the live scheduler.
6. **Ordered board.** board.rs, KeyframesBoard, EmptyEpisode and FrameInspector: first-frame transaction, visible add/delete/edit, character refs/comments/prompt revisions, inherited ratios and atomic cross-lane membership/order. Test mouse/keyboard moves, pointer cancel, save conflicts, restart and relocated-project roundtrip.
7. **Workflow binding.** workflow-core, schemas and WorkflowEditor: actual API import, unknown-property preservation, semantic node-field binding, immutable versions and per-account deployment distinction. Validate against real registry/schema; unresolved bindings block submit.
8. **Durable local jobs.** job-core/provider-comfyui, JobQueue and RenderReview: attempt before submit, staging, WS/history, scoped cancel and verified result import. Fixture servers test ambiguous POST/restart/disconnect; actual weight-free CPU workflow verifies prompt ID/output hash/provenance.
9. **Accounts/batches/retired hosted provider.** provider-retired hosted provider, integration-core, credentials and ProviderSettings: multiple selectable accounts, explicit family/schema, scoped uploads/mappings, limits/budgets and matrix batches. Test account isolation, expired uploads/results, unknown outcomes, failed-only retry and official API-family differences; test supplied-graph bindings and nested serialized tracks using safe fragments. Live jobs require an authorized export/schema and reviewed submission.
10. **Private runner and S3.** storage-s3/provider-relay, apps/relay, apps/agent, protocol schema and local Docker deployment: scoped auth, outbound leases/acks, SSE replay, signed private media transfers and immutable LoRA manifests. Wire ServersView, SetupHelp, StorageSettings and DeploymentPlanner to real commands. Local smoke proves original task recovery and hash-verified output without public ComfyUI.
11. **Provision and bulk initialize.** provision-core, profile/lock fixtures and standard-image wrapper: approved dependency resolution, missing-only downloads, typed initialization, inventory/Doctor, READY gates, cache locks, runtime isolation and canary rollback. Inspect selected image before its wrapper; test fresh/cached/corrupt/partial/conflicting cases. Complete real private RunPod acceptance once image, relay/S3 and authorized artifacts are selected. Do not create paid infrastructure implicitly.
12. **Native release.** Styles, icon, Info.plist, capabilities and macos.rs: readable Fenki light/dark, rem sizing, menus, coalesced Dock progress and permission-aware notifications. Build ARM64 app/DMG; verify Finder cold/warm opening, media, Keychain and progress cleanup.
13. **Document and deliver.** Actual native screenshots, portable sample, EN/RU/FR READMEs, deployment/release instructions and updated compact docs. Run checks, inspect staging for secrets/drafts, make small tested commits and push codex/mymovie-studio to origin without force. Report any pending live acceptance separately and accurately.

## Verification

Commands are proposed scripts to be created during implementation; they cannot pass in the empty repository today.

```text
npm ci
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run build
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
npm run tauri:build -- --target aarch64-apple-darwin
python3 scripts/comfyui-cpu-smoke.py --url http://127.0.0.1:8188
bash scripts/native-smoke.sh
docker compose -f deploy/compose.test.yml config
python3 scripts/private-runner-smoke.py --compose deploy/compose.test.yml
```

- Unit/integration checks exercise behavior and failure boundaries, not trivial mirrors of implementation.
- UI acceptance covers every row of the eleven-item table: distinct routes, empty-new-episode first frame, persistent rename/common prompts/comment and character edits, project/frame ratios, large custom choices, usable add/delete actions, expandable queue and clearable notifications/logs. Verify 14-inch layout, narrow window, keyboard/focus and reduced motion.
- Account tests ensure matching workflow IDs/uploads/tasks in one account never leak into another and batch limits are enforced.
- Runner tests exercise multi-MB image/video integrity, S3 permission/expiry, relay restart/SSE catchup, agent interruption/lease recovery and no duplicate billable task.
- Provision acceptance covers fresh supported image, second compatible worker/cache reuse, absent-volume partial resume, corrupt LoRA repair, concurrent cache writers, missing authorization, unresolved source/runtime BLOCKED states and restart/canary rollback. Record Docker and RunPod results separately; RunPod evidence is required for the complete Phase 3 claim.
- Browser test-only bridge is never shipped as an active provider. Browser screenshot/harness success does not establish native Tauri behavior.
- Packaged acceptance: real .app/.dmg, correct icon and Finder package appearance, double-click/drop cold/warm opening, no duplicate window, moved-project roundtrip, library deduplication, media playback, board drag/comment/prompt persistence, keychain credentials/redaction, Dock/notification cleanup.
- CPU test must show actual prompt/task ID, fetched output/hash and project provenance; failure or missing service stays explicitly pending.
- retired hosted provider fixture checks can pass without a key; actual live generation acceptance stays pending until an authorized workflow/schema and reviewed budget are available. Never present fixture success as a live test.
- Capture docs/screenshots/keyframes-macos.png only from the running native app with safe sample data; inspect it at normal and high-DPI sizes. Verify all three READMEs accurately label later features.
- Ensure drafts, browser profiles, credentials, user exports and build artifacts are absent from staged changes before every push.

## Risks / edge cases

- The supplied single-file export is a bundled prototype; rebuild typed components and verify the actual app visually. Its source inspection does not establish runtime appearance or working persistence.
- No current ComfyUI service was reachable at the two tested endpoints. Setup/version compatibility must be verified; CPU smoke is not a performance benchmark.
- Real retired hosted provider workflow access/schema may be unavailable for seed URLs; register URLs and return explicit authorization/export requirements instead of fabricated graphs.
- A conversation credential cannot be removed from already stored chat history by editing the repository. It will not be reused or copied; replacement belongs in Keychain.
- Provider timeouts after POST require reconciliation before retry; result collection must be retryable without creating another job.
- JSON projections and SQLite need a recovery journal; external modification of board.json is not silently merged into the database in this milestone.
- Finder package association, document events and notification permissions require native packaged testing; Tauri browser tests alone are insufficient.
- FFmpeg/codecs and fonts need redistribution checks. Initial builds may be ad-hoc signed; notarized distribution cannot be claimed without Apple signing credentials and successful verification.
- Later shared-cache/profile conflicts can break runtime compatibility unless immutable artifacts and isolated environments are enforced.

## Out of scope

For this revised Phases 0–3 approval: paid pod creation or automatic start/stop, multi-host relay HA, local prompt LLM, advanced editing timeline, Homer source changes, browser login/automation, LoRA training and additional OS binaries. Preserve these requested later workflows in the roadmap; LoRA sync and private runner provisioning are included now. No reference repository or supplied draft is modified.

## Inputs and decisions still needed

### Before implementation

- Explicit approval of this revised plan. The design prerequisite is fulfilled; no additional Base44 exports are required.

### Before live integration acceptance

- Supplied graph exports satisfy the graph-inspection input. Live retired hosted provider acceptance still needs an account-accessible deployment and its verified input schema; AI App 2021554630848684033 is separate from LTX/MINIMAX and exposes no app-specific input mappings in the public page. Resolve this through authenticated discovery/secure app settings after approval. Local studio and fixture verification can proceed without live credentials.
- Heavy graph execution needs a compatible GPU runtime, verified custom node registry, approved model sources and actual staged reference media. Docker CPU smoke uses a weight-free graph; no rental needed for initial validation.
- Confirmed CPU environment: Docker via OrbStack, with proposed loopback port 8188 after checking availability and verified setup. Existing Debian/native endpoints remain configurable.
- Replacement credentials entered through secure app settings, never source/drafts/chat.
- Private RunPod: selected standard ComfyUI image/template with immutable digest/version, relay host/TLS endpoint, private S3 provider/bucket and approved dependency sources/runtime. Until supplied, implement/test the protocol against local Docker services and label cloud acceptance pending. No paid GPU is rented without a spending decision.

### Before later milestones

- Browser: app-owned Chromium or installed browser, manual-login scope versus approved generation automation and initial provider.
- Training: first model/trainer, dataset authorization, immutable recipe and LoRA compatibility/retention policy.
- Homer Tier 2/signing: separate Homer change authorization and Apple signing access if notarized public distribution is requested.

## Primary technical references

- [Tauri document/bundle configuration](https://v2.tauri.app/reference/config/)
- [Tauri notification permissions](https://v2.tauri.app/plugin/notification/)
- [ComfyUI server transport/routes](https://github.com/Comfy-Org/ComfyUI/blob/master/server.py)
- retired hosted provider current API families (retired external deployment)
- Supplied retired hosted provider AI App API (retired external deployment)
- [OrbStack headless operation](https://docs.orbstack.dev/headless)
- [RunPod templates](https://docs.runpod.io/pods/templates/overview)
- [RunPod storage constraints](https://docs.runpod.io/pods/storage/types)
- [Persistent browser context restrictions](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context)

Plan ready. Approve it and I will implement it.
