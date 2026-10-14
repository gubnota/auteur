# Implementation Plan: Studio refinement and real ComfyUI workflow installation

> Historical plan: hosted-provider steps are superseded by the 0.1.12 ComfyUI wrapper implementation.

Status: Approved by user `go`; implemented in 0.1.7. Verification: TASK_LOG.md.
Date: 2026-10-14
Branch: main

## Goal
Make reusable workflow forms compact and correct, separate queueing from execution, reliably prepare and install normal editor workflows through the utility, and improve document navigation, media previews and usage discovery. Verify the already-published Linux ARM64 agent inside the user's OrbStack Debian VM.

## Existing behavior
- Version 0.1.6 already publishes four agents, including Linux aarch64, and five desktop builds. Debian OrbStack reports aarch64/glibc 2.41; Python and curl exist, ffmpeg is absent.
- Generate saves drafts, but its main action sends users to review/start. Native start_job_draft persists a run and immediately dispatches. Persisted pause/resume and FIFO/parallel scheduling already exist.
- FaceSwap image roles are guessed from node enumeration. Explicit node/input bindings and per-workflow hidden/advanced layouts exist, but role correction and compact customization are difficult to discover.
- Profiles compare a hash of the entire object_info registry. Dynamic uploaded-file lists and unrelated classes can invalidate otherwise compatible workflows.
- workflow-install stores immutable editor JSON in the agent catalogue only. It does not publish a saved workflow into ComfyUI's workflow library. workflow-compile already delegates API serialization to the selected frontend.
- The installed ComfyUI provides GET/POST /userdata/{encoded-file}, with overwrite=false conflict protection. Import can use this API without replacing the open canvas.
- Welcome has no recent-list management. Its existing return button disappears below the responsive sidebar breakpoint.
- Library videos lack poster thumbnails, filenames lack constrained ellipsis, and asset/character usage has no cross-scene navigation.

## Proposed approach
1. Persist explicit source/reference roles against exact node ID + input name. Offer Swap inputs for the two-image FaceSwap form; never infer image1 from dictionary order. Preserve original editor/API graphs and historical run receipts. Existing drafts need an explicit repair action rather than silent mutation.
2. Make essential media and prompt fields the compact default. Expose Customize inputs, Advanced, and Show hidden without recompilation. Persist workflow-level labels, roles, grouping and visibility for reuse; hidden fields retain values and validation. Required unmapped inputs cannot disappear without an actionable warning.
3. Add Add to queue separately from Run now. Enqueue freezes/preflights a durable run in the existing paused state, with optional start-reason metadata distinguishing never-started queued work from a manually paused run. Queueing performs no upload or provider submission. Start selected/all queued resumes these runs; existing endpoint FIFO and parallel-node rules remain authoritative. Reopening queued work must never start it automatically.
4. Replace whole-registry comparison with a versioned workflow-scoped compatibility fingerprint. Hash used node structural schemas, Python module identity and static choices. Record frontend identity separately in the compilation receipt. Treat known dynamic media/model inventory lists separately, validating the chosen models and fields live. Actual schema changes require reprepare; unrelated additions do not. Existing legacy profiles require one explicit refresh, retaining compatible layout/values.
5. Extend workflow-install with an explicit publish-to-ComfyUI option. Publish editor JSON to a confined, sanitized, content-versioned workflows/MyMovie path via Userdata API, overwrite=false; read it back and verify semantic content/hash. Same content is idempotent, different content cannot overwrite. Return library path, source hash and loadedCanvas=false. Expose Install in ComfyUI for the selected catalogue workflow/node. Reuse the existing compiler to export API; do not ask for repeated API uploads.
6. Keep Welcome reachable at every supported screen size. Make recent movies scroll within the available height; offer remove entry and clear list, affecting recent history only. Close-to-Welcome must flush pending edits and scope outstanding work correctly.
7. Generate bounded background video posters into derived asset cache, with source-hash identity, failure fallback and retry. Extend the confined native media protocol for posters. FFmpeg discovery must work from a GUI launch; absent ffmpeg gives a clear setup action without rejecting the imported video. Keep original/linked materials unchanged.
8. Add shared usage selectors: direct frame placement, character references through effective scene/frame cast, and draft references are labeled separately. Show scene/frame links in Library and effective character assignments in Characters. Clicking character usage filters Board across the selected episode, switching episode when opening a specific result; filter is easy to clear.

## File changes
All changes below are modifications unless marked create. No files are deleted.

### Contracts, preparation and queue
- crates/studio-contracts/src/lib.rs: backward-compatible optional media-role, fingerprint-version and queued-start metadata.
- apps/desktop/src/lib/types.ts: matching TypeScript DTO fields.
- crates/workflow-core/src/schema.rs: explicit role application and workflow-scoped registry normalization/fingerprint, with regressions.
- crates/provider-comfyui/src/lib.rs: scoped compatibility checks plus separate live inventory validation.
- apps/desktop/src-tauri/src/service/catalogue.rs: prepare/refresh preservation and installation command orchestration.
- apps/desktop/src-tauri/src/service/jobs.rs: shared preflight/freeze, enqueue without dispatch and explicit queued-run start.
- crates/job-core/src/runs.rs: queued/paused start metadata and existing recovery/admission behavior.
- crates/job-core/tests/runs.rs: durable enqueue/reopen/FIFO/parallel regression coverage.
- apps/desktop/src-tauri/src/main.rs: register enqueue/start, workflow installation, recent management and thumbnail commands.

### Agent installation
- apps/agent/src/main.rs: explicit workflow-install publish options and validation.
- apps/agent/src/workflow.rs: bounded Userdata publication/readback and receipts; preserve registry-only default.
- crates/provider-relay/src/lib.rs: typed installation payload through the existing allowlisted control channel.
- apps/relay/src/main.rs: validate installation payload and retain scoped authorization; no arbitrary path/command execution.

### UI and media
- apps/desktop/src/components/WorkflowTarget.tsx: visible compact customization, role editing and Install in ComfyUI.
- apps/desktop/src/components/WorkflowInputs.tsx: explicit source/reference slots, swap action and compact/advanced layout.
- apps/desktop/src/features/Generate.tsx: separate queue/run actions with saved workflow/node reuse.
- apps/desktop/src/features/Jobs.tsx: queue review, queued runs and explicit start selected/all controls.
- apps/desktop/src/App.tsx: recent management, responsive Welcome action, usage navigation and async scoping.
- apps/desktop/src/features/Library.tsx: filename ellipsis, video posters, asset/character usage links.
- apps/desktop/src/features/Board.tsx: external navigation and effective-character filter.
- apps/desktop/src/lib/project-usage.ts (create): pure asset/cast usage selectors shared by Library and Board.
- apps/desktop/src/lib/project-usage.test.ts (create): inherited cast, deduplication and cross-episode usage tests.
- apps/desktop/src/lib/job-inputs.ts: apply explicit media roles while preserving exact node/input addresses.
- apps/desktop/src/lib/job-inputs.test.ts: swap/persistence and hidden-default regressions.
- apps/desktop/src/lib/bridge.ts: typed new commands and poster URL.
- apps/desktop/src/styles/studio.css: rem spacing, compact form layout, constrained filenames, scrollable recents and visible navigation.
- crates/integration-core/src/lib.rs: remove/clear recent history without deleting projects.
- crates/asset-core/src/lib.rs: safe derived poster path/process helpers.
- apps/desktop/src-tauri/src/service.rs: recent commands and scoped thumbnail orchestration.
- apps/desktop/src-tauri/src/service/thumbnails.rs (create): bounded asynchronous thumbnail worker/cache/status.
- apps/desktop/src-tauri/src/media.rs: confined poster route alongside existing media streaming.

### Acceptance and documentation
- e2e/generate.e2e.ts: compact roles and queue-without-run behavior.
- e2e/jobs.e2e.ts: explicit start queued jobs and endpoint dispatch behavior.
- e2e/workflow-catalogue.e2e.ts: workflow installation/reuse and refresh actions.
- e2e/library.e2e.ts (create): recent navigation, long filenames, posters and usage filtering with native fixtures.
- docs/WORKFLOW_SETUP.md: utility installation/export instructions, refresh guidance and Linux ARM64 VM test.
- docs/GENERATION_ACCEPTANCE.md: actual local/VM acceptance evidence, distinguishing real from mocked execution.
- README.md, README.ru.md, README.fr.md: queue, compact inputs, workflow install and media usage guidance.
- docs/PROJECT_CONTEXT.md, ARCHITECTURE_INDEX.md, MODULE_OWNERSHIP.md, API_CONTRACTS.md, DECISIONS.md, TASK_LOG.md: concise final contracts, module map and verification state.
- docs/screenshots/: refreshed native UI and utility acceptance evidence, excluding personal media/secrets.

## Implementation steps
1. Fix explicit roles and scoped compatibility first; test exact FaceSwap node IDs and dynamic filename/model inventory changes. Preserve old profiles and provide an explicit refresh path.
2. Extract common native draft freezing and implement enqueue/start. Verify zero external writes on enqueue, persistence after reopen and scheduling when explicitly started.
3. Add agent publication/readback and selected-node UI integration. Verify an ordinary weight-free editor workflow appears in local ComfyUI's saved workflow library and compiles to API through the utility.
4. Implement compact reusable forms and visible queue controls; verify the two FaceSwap slots and saved defaults survive reopen.
5. Add recent-list management and responsive navigation; verify small-screen scrolling and save-before-close.
6. Add poster generation, filename constraints, usage selectors and Board navigation. Verify imported copied/linked videos and inherited character references.
7. Extract the verified v0.1.6 Linux ARM64 artifact into an isolated Debian VM work directory. Check ELF architecture/help/doctor, install only the compiler prerequisites required for this acceptance, then test utility install/compile against reachable local ComfyUI. If a VM-local ComfyUI is needed, use an isolated weight-free CPU setup; never download large weights for this test.
8. Complete tests, rebuild the native macOS app, capture screenshots and update English/Russian/French docs and compact memory. Commit small coherent changes on main. A future release tag/publication is separate from verifying the existing ARM64 download.

## Verification
- cargo test --workspace --locked; cargo fmt --all -- --check.
- npm test; npm run typecheck; npm run test:e2e; npm run build.
- python3 -m unittest discover -s scripts/tests.
- Native macOS production build and manual responsive Welcome/Generate/Jobs/Library/Characters checks.
- Provider fixture tests: unrelated registry additions and uploaded filenames remain compatible; used node schema changes and missing selected models still fail before staging.
- Queue fixture tests: enqueue makes no upload/submission; restart stays idle; explicit start respects FIFO per endpoint and overlap across endpoints.
- Real local test: publish a normal editor mask workflow using the utility, read it back/list it from ComfyUI, export API through its frontend, queue without running, explicitly run and verify collected result/hash.
- FaceSwap role correction: inspect active graph links and user-specified image1/image2 reversal; test with the previously approved non-explicit portraits only.
- ARM64 VM: verify actual published binary architecture and execute install/compile; record exact environment and failures rather than claiming cloud acceptance.
- Video test: import a small local fixture, verify generated poster, cache reuse, non-blocking failure/missing-ffmpeg state and confined media access.

## Risks / edge cases
- Node order does not establish media semantics. Existing FaceSwap drafts must be repaired visibly; new bindings must preserve exact node identity.
- Dynamic combo normalization must be limited to known inventory fields; static combo changes and actual selected-model absence remain meaningful failures.
- Older profiles require one reprepare; no silent compatibility bypass or mutation of immutable receipts.
- ComfyUI versions without Userdata support report a capability error; registry storage alone is never labeled installation into ComfyUI.
- FFmpeg location/dependencies differ across desktop platforms. Thumbnails are optional derived data, never an import prerequisite.
- Scene-inherited character references describe availability, not proof that a render used a particular reference image.
- VM can test ARM64 CPU utility behavior, not CUDA/GPU cloud deployment.

## Out of scope
Paid retired hosted provider jobs, rented cloud nodes, GPU/cloud acceptance, changing existing active ComfyUI canvases, arbitrary plugin/weight installation, release notarization, and automatic modification of historical jobs. Existing reviewed provisioning remains available unchanged.

## Accepted refinements during implementation
- Remove selected Generate batch items, including the last item, with an empty-state recovery action.
- Collapse Jobs editor, restore frozen queued inputs, choose another execution node, and atomically replace an unstarted queued run. Preserve the canceled original receipt; started work is reusable as a separate draft.
- Clear terminal rows from the bottom queue using persisted app-local dismissed IDs; preserve active/unknown jobs, durable history and results.
- Additional files: lib/job-history.ts and its tests; provider-comfyui/src/workflow.rs owns shared publication/readback instead of duplicating it in agent code. Existing asset helpers support native thumbnail orchestration.
- Real native and ARM64 VM evidence is recorded in GENERATION_ACCEPTANCE.md. No new release tag was created.
