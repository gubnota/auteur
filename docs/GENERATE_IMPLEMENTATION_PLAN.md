# Implementation Plan: Generate and first-session node readiness

> Historical plan: hosted-provider steps are superseded by the 0.1.12 ComfyUI wrapper implementation.

Status: Implemented and locally verified; live cloud acceptance pending. Date: 2026-10-14.
Extends the approved original IMPLEMENTATION_PLAN.md. Work sequentially on main.

## Goal

Provide a Generate workspace for image/video creation and editing with custom media, exact imported workflow inputs, persisted batches and parallel execution across nodes. Make first-session initialization verify and provision the required workflows, plugins and model files before generation. Validate locally with the supplied Flux2 FaceSwap workflow and then with a small Colab test; keep RunPod as the primary deployment target.

## Existing behavior

- React/Tauri desktop, Rust providers, SQLite document packages and durable Jobs already exist. Only root cpu-canary.png is unrelated untracked work.
- Jobs requires a keyframe; media semantics currently support image/mask and four cast references. Standalone video/audio references are not available.
- Exact literals, immutable graph versions, separate provider deployments, account secrets, endpoint FIFO, concurrent independent endpoints and result receipts already exist; reuse them.
- ComfyUI stages via /upload/image. The installed server writes uploaded bytes without image decoding, but loader compatibility must still be checked for each mapped input. Relay currently stages every input under reference.png, which loses its real media format.
- Provision currently saves workflows and evaluates a plan. It does not install dependencies or attest models; doctor incorrectly conflates health with readiness.
- Colab/Kaggle notebooks already deploy checksummed Linux agents. Their bootstrap rejects Quick Tunnel addresses; a polling-only test connection needs an explicit option.
- Local ComfyUI at http://127.0.0.1:8188 reports MPS and all node types/model names used by Flux2_Klein_4B_AppleSilicon_FaceSwap. Names do not prove integrity or execution.
- That workflow is an editor export. Obtain its API export through ComfyUI's own frontend, preserving custom-node serialization and bypass behavior; do not guess widget order.
- Approved test images: source /Users/vm/ComfyUI-Shared/output/faceswap/ReActor_00005_.png; reference /Users/vm/Movies/MyFun/ComfyUI_Workflows/FaceSwap/female_character34.webp. Keep both outside Git, screenshots and test fixtures.
- Base44 Generate was inspected: mode tabs, media tiles, preview/results, prompt composer and workflow controls. Adopt this layout with Fenki colors and existing custom modal controls.

## Proposed approach

### Generate and media contracts

- Add Generate navigation and Image Create/Edit, Video Create/Edit (T2V/I2V/V2V/A2V/multi-reference), and Custom modes. Modes filter/select compatible imported workflows; they do not imply a model or provider supports them.
- Reuse saved JobDraft/JobItem and Jobs execution. Add defaulted draft context: storyboard or standalone, generation mode, optional character selection. Keep frameId for legacy drafts; empty frameId is permitted only for explicit standalone context.
- Extend Binding with optional media metadata: kind (image/video/audio), role (startFrame/endFrame/referenceImage/referenceVideo/referenceAudio/mask/characterReference), and order. Every slot maps to one actual node/input. Multiple references use ordered mapped slots rather than a fixed four-slot UI. Array inputs require an explicit schema; no synthetic graph links.
- Keep existing image/mask/characterReference1..4 semantics as compatible defaults. Storyboard cast restrictions remain; standalone references use the draft's explicitly selected cast or generic reference slots.
- Show only bound/supported prompt, dimensions, seed, duration, FPS, strength and LoRA controls. Preserve exact literals and graph defaults; distinguish model/LoRA dependencies from image references.
- Preview media with native import/drop, Library selection, replace/remove/reorder and Copy/Keep original location. Results enter Library/Renders with run/item/workflow/node/input provenance; attach to a keyframe only when explicitly targeted.
- Extract the shared workflow input editor from Jobs; avoid a second resolver or scheduler. Add to batch and Run all routes through the existing reviewed batch submission. One endpoint queues; distinct instances run in parallel.
- Add rem spacing around ratio controls, including margin above the ratio summary below Apply ratio. Use existing custom modal pickers/toggles, keyboard focus, accessible names and original SVG symbol.
- Upgrade document format to v3 with a consistent SQLite/manifest backup and the existing upgrade dialog. Even though data stays JSON, older readers must reject v3 rather than silently discard standalone/media metadata. Preserve all v1/v2 jobs and draft defaults; use a temporary copied document for acceptance.

### Media staging and capability validation

- Make staging metadata explicit (name, kind, MIME type and hash); preserve real extensions and hash-based safe filenames across ComfyUI and relay. Deduplicate same immutable asset within a dispatch.
- Check node registry/input schema and loader compatibility before submission. Use /upload/image byte staging only for tested compatible loaders; unsupported folder/batch/plugin loaders show an actionable mapping error.
- retired hosted provider remains a test adapter. Advertise only verified upload kinds/API families; block unsupported video/audio slots before uploading or charging. Configuration-only providers remain configuration-only.
- Mask slots preserve alpha/channel semantics; upload alone does not establish a usable mask. Include a known mask graph and exact binding demonstration.
- Bound transfer size/time; retain existing linked-file integrity checks and immutable receipts. Cancellation must not interrupt another client's whole ComfyUI queue.

### Initialization profile and actual readiness

- Add a versioned provisioning profile alongside legacy runtime locks. Runtime identity is either an immutable Docker image digest or a native runtime fingerprint (ComfyUI commit, interpreter/dependency lock and platform). Do not pretend Colab/native Mac is a Docker image.
- Artifacts require SHA-256, size, license, architecture compatibility, model category and relative target. HTTPS and S3 sources use immutable identity plus a secret source reference; refreshed signed URLs are transfer data, never movie data or public receipts.
- Plugins require an immutable revision and verified source archive; Python dependencies require a compatible, hash-locked wheel set. No arbitrary shell text or unpinned requirements installer supplied through a profile.
- Agent receives an explicit ComfyUI root/interpreter and uses a bundled helper to discover effective model directories, including extra_model_paths.yaml. Inventory reports session ID, runtime fingerprint, registry, workflow versions and required file integrity. Hash relevant files, not every multi-GB model each poll.
- Initialize checks -> review missing/conflicting items -> download only missing files into a locked cache -> verify -> install to confined category paths -> register preserved workflows -> recheck registry/model availability -> small canary. Existing conflicting weights are never overwritten silently.
- Plugin installation/restart applies only to an agent-managed remote runtime, when its queue is drained. An externally started ComfyUI, including Desktop on Mac, receives diagnostics and instructions; do not change its environment or restart it automatically.
- Publish readiness by workflow version + profile hash + worker session/runtime inventory fingerprint. Fresh Colab sessions and changed dependencies invalidate it. Readiness states distinguish online, unchecked, missing dependencies, initializing, needs restart, canary failed and ready.
- Before the first generation in a session, reuse/check attestation; unresolved requirements prevent dispatch with clear actions. Avoid repeating full downloads for each job. Persist initialization operation IDs and poll progress outside the global project mutex.
- Missing source URLs/hashes/plugin pins remain visible requirements; a graph's model filename is not authority to guess a download source or license.

### Colab-first acceptance and setup guidance

- Document two concrete paths: a test relay running on Mac and exposed through a temporary HTTPS tunnel; and a stable hosted authenticated relay for RunPod/Colab. Both use separate desktop/agent tokens and explicit node IDs. ComfyUI stays private on the worker.
- The HTTPS address entered in Connections belongs to the relay. For the quick test, cloudflared tunnel --url http://127.0.0.1:8787 prints that address on the relay machine. Colab's 127.0.0.1:8188 belongs to Colab, not the Mac.
- Quick Tunnels do not support SSE: explicitly select polling for this test. A stable relay may use SSE with replay and polling fallback; this phase delivers reliable polling and does not claim new desktop SSE acceptance.
- Provide exact build/start/download commands, port checks, token setup, notebook Secret names, generated node ID, app fields and result collection steps. Include the 8188/8190 mismatch diagnosis: waiting and running ports must match.
- Keep the verified Linux agent artifact deployed on Colab, with the runtime helper and profile assets bundled and checksummed. Preserve Kaggle's two independent GPU worker queues and shared download locking.
- Test 1: core-node image/mask transport canary with no extra weights/plugins. This tests upload, queue, progress and results, not learned segmentation or GPU use.
- Test 2: repo-owned small ComfyUI rembg wrapper using u2netp, explicit pre-provisioned weights and pinned dependencies. It returns transparent output and a mask. Record actual execution provider; a CPU result does not establish GPU acceptance. Verify source/hash/license before downloading, with no hidden first-inference download.
- Local test: pair the original FaceSwap editor export with its actual API export, map source/reference inputs, stage approved portraits, submit through the app, collect output, and re-export/open the preserved workflow in ComfyUI. Use a disposable project and output namespace.
- Remote acceptance is complete only after the user's active Colab executes and results return through HTTPS. If the session/address is unavailable, report the exact pending step and continue local/mock verification.

## File changes

All changes below are concrete; no deletions.

### Desktop and document core — modify
- apps/desktop/src/App.tsx: Generate navigation, native drop targets and v3 upgrade wording.
- apps/desktop/src/features/Jobs.tsx: reuse shared input editor; standalone draft labels/results and batch handoff.
- apps/desktop/src/features/Library.tsx: binding media metadata editor and preserved editor/API pairing guidance.
- apps/desktop/src/features/Board.tsx: ratio spacing hooks.
- apps/desktop/src/features/Connections.tsx: initialization review/status and clear Colab/RunPod help; polling test option.
- apps/desktop/src/styles/studio.css: rem-based Generate/drop/ratio/readiness layout.
- apps/desktop/src/lib/types.ts: explicit mirrors of new contracts.
- apps/desktop/src/lib/job-inputs.ts and job-inputs.test.ts: standalone prompt/cast defaults, generic typed media resolution and mismatch tests.
- crates/studio-contracts/src/lib.rs: draft context, media binding/staging and readiness DTOs with old-field defaults.
- crates/project-core/src/lib.rs: v3 backup/migration/validation, round-trip and old-format preservation tests.
- crates/workflow-core/src/lib.rs: canonical standalone/media resolver, exact mapping and registry compatibility checks/tests.
- apps/desktop/src-tauri/src/service/jobs.rs: readiness preflight, metadata-aware uploads and optional result attachment/tests.
- apps/desktop/src-tauri/src/service.rs: v3 upgrade handling and initialization request/status lifecycle.

### Desktop and document core — create
- apps/desktop/src/features/Generate.tsx: mode selector, custom media, compatible workflows, prompt controls, previews and batch actions.
- apps/desktop/src/components/WorkflowInputs.tsx: shared exact workflow/media input editor.
- crates/project-core/migrations/0003_generate.sql: transactionally mark document format v3.
- e2e/generate.e2e.ts: standalone import/drop, modes, binding validation, reopen and multi-node batch review.

### Providers and initialization — modify
- crates/job-core/src/lib.rs: metadata-aware stage_asset contract.
- crates/job-core/tests/runs.rs: standalone batch retains endpoint FIFO/concurrency and frozen inputs.
- crates/provider-comfyui/src/lib.rs: registry capabilities, real-format staging, canary tests.
- removed provider adapter: explicit supported media capabilities and pre-upload failures.
- crates/provider-relay/src/lib.rs: stage metadata and typed initialization/status payloads.
- crates/storage-s3/src/lib.rs: cache reuse and validated transfers without leaking source URLs; resume/conflict tests.
- crates/provision-core/src/lib.rs: profile/inventory/readiness types, diff planning and verification policy.
- apps/agent/src/main.rs: managed runtime options, actual doctor/inventory/provision and session attestations; metadata-preserving staging.
- apps/agent/Cargo.toml: dependencies required for confined, verified archive installation and initialization locking.
- apps/relay/src/main.rs: authenticated capability/session metadata and initialization progress; retain durable control operations.

### Providers and initialization — create
- apps/agent/src/provision.rs: verified download/cache/install, workflow registration, managed restart and canary executor.
- deploy/runner/mymovie_runtime.py: effective model path/runtime discovery and managed plugin dependency checks.
- deploy/comfy_nodes/mymovie_rembg/__init__.py: minimal explicit-model background removal/mask node.
- examples/workflows/mask-canary_api.json and mask-canary_editor.json: paired core-node mask test.
- examples/workflows/rembg-u2netp_api.json and rembg-u2netp_editor.json: paired lightweight removal test.
- examples/provision/rembg-u2netp.json: resolved immutable runtime/plugin/model requirements; no tokens or signed URLs.
- crates/provision-core/tests/readiness.rs: missing nodes/models, runtime types, traversal/symlinks, integrity and session invalidation.
- scripts/tests/test_runtime_helper.py: effective paths, unsupported environment, missing/conflicting dependency and managed-session behavior.

### Delivery and documentation — modify
- scripts/notebook-bootstrap.py: packaged helper deployment, managed worker options and explicit quick-test polling mode.
- scripts/generate-notebooks.py, deploy/colab/MyMovie_ComfyUI.ipynb, deploy/kaggle/MyMovie_ComfyUI.ipynb: reproducible initialization/connection cells; separate GPU ports retained.
- scripts/package-agent.py and scripts/tests/test_agent_package.py: bundle/checksum runtime helper, node and tiny profiles/workflows; preserve x86_64/ARM64 metadata.
- scripts/tests/test_notebook_bootstrap.py: polling quick-test validation, port alignment and independent workers.
- README.md, README.ru.md, README.fr.md: Generate/batch/setup and acceptance instructions.
- deploy/runpod/README.md: exact relay/agent/ComfyUI initialization and HTTPS-address instructions.
- docs/PROJECT_CONTEXT.md, ARCHITECTURE_INDEX.md, MODULE_OWNERSHIP.md, API_CONTRACTS.md, DECISIONS.md, TASK_LOG.md: concise implementation-aligned state/contracts/decisions.

### Delivery and documentation — create
- docs/GENERATION_ACCEPTANCE.md: separate local, fixture and live Colab evidence; sanitized workflow versions/status/result hashes.
- docs/screenshots/generate.png: implemented Generate screen with non-sensitive demo content.

Existing CI already runs workspace/frontend/browser/Python checks and builds the native matrix. Extend existing tests and packaged agent contents without rewriting its release matrix or mutating published tags.

## Implementation steps

1. Add v3 contracts and migration in contracts/project-core/types/service/App. Test defaults, backups, rollback, reopening and rejection by older readers.
2. Generalize canonical resolution and provider staging in workflow-core/job-inputs/job-core/providers/agent/relay. Test image/video/audio formats, ordered slots, zero/false/empty literals, cast validation and unsupported loaders/providers.
3. Extract shared WorkflowInputs and implement Generate with App/Library/Jobs/CSS/Board integration. Persist drafts, show supported controls, import/drop all kinds and submit batches through existing review/run commands. Verify with unit and browser tests.
4. Add profile/inventory/diff/readiness contracts and executor/helper. Verify fresh/cache/conflict/expired signed URL/hash failure/path attacks, offline nodes, queue drain, session changes and no ready claim before canary success.
5. Add paired tiny workflows, verified u2netp profile/node and agent packaging/notebook/help changes. Verify x86_64/ARM64 packaging and two Kaggle workers; do not equate two GPUs with pooled VRAM.
6. Exercise local app-to-ComfyUI FaceSwap with the approved portraits and actual API export. Confirm result import/provenance and preserved editor re-export. Keep personal files and fixture outputs out of Git.
7. Run Colab mask canary, then background removal through the deployed artifact and HTTPS relay when the user's session is active. Verify first/cached initialization and parallel dispatch to local/remote nodes. Record pending live steps precisely if unavailable.
8. Capture sanitized screenshots, update EN/RU/FR READMEs and compact memory. Make small scoped commits on main after checks; leave unrelated root cpu-canary.png untouched. Native build validates the feature; replacement of /Applications or a new version tag is a separate release step.

## Verification

- cargo fmt --all -- --check
- cargo test --workspace --locked
- npm run typecheck; npm run build; npm test
- npm run test:e2e (existing Jobs/retired hosted provider plus Generate)
- python3 -m unittest discover -s scripts/tests
- python3 scripts/generate-notebooks.py followed by generated-file diff review
- python3 scripts/check-release-version.py
- npm run tauri:build -- --target aarch64-apple-darwin
- git diff --check and deliberate scoped status/staging review
- Native disposable .mymovie: import/drop/reorder media, change mode/node/workflow, review exact graph, close/reopen, run local+remote batch and inspect result receipts. Verify custom modals, keyboard focus, ratio margins and empty states.
- Live local FaceSwap and live Colab are separate from mocked CI. Existing published release assets are not evidence for these new tests.

## Risks / edge cases

- Media loader plugins have different schemas and paths; support exact mappings and clear compatibility errors, not a promise every workflow runs.
- Editor-to-API conversion of custom nodes must use ComfyUI serialization; missing API export blocks only that live test.
- Session restart, model changes, signed URL expiry and plugin runtime conflicts invalidate readiness; downloads must remain resumable and installation atomic.
- Colab lifetime/storage/network availability can interrupt jobs; retain durable receipts and reconcile unknown attempts without duplicate submission.
- Quick Tunnels change hostname and lack SSE. Polling test mode and URL update are required.
- User-provided graph filenames cannot establish provenance/hash/license. Unknown dependencies stay unresolved.
- v3 documents require the new client; retain usable pre-upgrade backups and explain this in the existing document upgrade dialog.

## Out of scope

- Paid pod rental, account creation, automatic purchases, or retired hosted provider charged acceptance without a concrete authorized job.
- Training, arbitrary workflow chaining, new fal/Google generation adapters, universal custom-node lowering and timeline editing.
- Automatic modification/deletion of the Mac's ComfyUI or existing weights, public unauthenticated ComfyUI exposure, changing ignored drafts or personal movie packages.
- Release retagging, cross-platform live desktop acceptance and a new release/install operation in this feature plan.

Sources inspected: https://mymovie-studio-flow.base44.app/studio ; https://github.com/comfyanonymous/ComfyUI_examples ; https://github.com/danielgatis/rembg ; https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/ ; https://docs.runpod.io/pods/configuration/expose-ports .
