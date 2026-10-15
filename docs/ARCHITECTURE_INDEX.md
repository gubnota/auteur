# Architecture Index

## Entry points
- Cargo.toml / Cargo.lock: Rust workspace and reproducible dependency resolution.
- package.json / package-lock.json: npm workspace, UI checks and Tauri commands.
- apps/desktop/src/main.tsx: React entry; App.tsx: shell, save queue, native drops.
- apps/desktop/src-tauri/src/main.rs: lifecycle, commands, document open, media protocol.
- apps/relay/src/main.rs: authenticated broker, leases, asset transport and SSE.
- apps/agent/src/main.rs: typed outbound runner CLI and local receipts.

## Desktop frontend
- apps/desktop/src/features/Board.tsx: ordered storyboard and frame inspector.
- features/Library.tsx: characters/reference imports, media, workflows and renders.
- features/Jobs.tsx: queue/history controls; Edit/Reuse routes to Generate.
- features/Generate.tsx: single Custom composer, saved workflows/nodes, compact batches and review.
- components/WorkflowForm.tsx: reusable exact literal bindings, labels, media roles and visibility.
- components/Media.tsx / MediaPicker.tsx: shared previews and searchable asset-ID tile selection.
- components/JobReview.tsx / lib/job-drafts.ts: review, explicit queue/start and draft/queued-edit helpers.
- components/WorkflowInputs.tsx / WorkflowSetup.tsx: shared media slots, hardware flags and pinned dependency editor.
- lib/job-inputs.ts / job-inputs.test.ts: typed input resolution/readiness.
- features/Connections.tsx: endpoint types, credentials, runtime/storage settings.
- components/RunnerTokens.tsx / lib/node-auth.ts: shared token fields, notebook config copy, explicit temporary-relay URL validation.
- src-tauri/src/service/runner_tokens.rs: atomic OS-vault pair with public-default fallback.
- deploy/node-auth.defaults.json: public test defaults shared by UI, native and notebook generation.
- features/PromptAssistant.tsx: optional provider prompt assistance.
- components/Controls.tsx: styled controls, modal pickers and dialogs.
- components/AppSymbol.tsx / assets/app-symbol.svg: original symbol.
- lib/types.ts: manual TS contract mirror; lib/bridge.ts: typed native boundary.
- lib/file-drop.ts / file-drop.test.ts: Cocoa-point/physical-pixel conversion.
- styles/studio.css: Fenki palette, rem sizing, responsive studio shell.

## Native/domain modules
- apps/desktop/src-tauri/src/service.rs: command orchestration and polling.
- src/service/jobs.rs: batch preflight, per-lane reservation and concurrent scoped provider I/O.
- src/media.rs: bounded media protocol; src/assistant.rs: optional LLM transport.
- tauri.conf.json / tauri.linux.conf.json / tauri.windows.conf.json / capabilities/main.json / Info.plist: security and Finder registration.
- crates/studio-contracts/src/lib.rs: serde DTOs, camelCase JSON.
- crates/project-core/src/lib.rs: revisioned SQLite packages and projections.
- project-core/migrations/0001_initial.sql: schema v1; JSON rows, not normalized entities.
- project-core/migrations/0002_job_runs.sql: schema v2 durable run rows.
- project-core/migrations/0003_generate.sql: schema v3 standalone media/requirements; backup upgrade.
- crates/asset-core/src/lib.rs: copy/link/import/drop/collect/integrity rules.
- crates/workflow-core/src/lib.rs: graph import, bindings, cast/ref resolution.
- crates/job-core/src/lib.rs: durable attempts, backend trait and recovery.
- job-core/src/runs.rs / tests/runs.rs: run persistence, endpoint FIFO/capacity and recovery.
- crates/provider-comfyui/src/lib.rs: ComfyUI HTTP/WS/history transport.
- crates/provider-relay/src/lib.rs: relay HTTPS/SSE API client.
- crates/integration-core/src/lib.rs: app settings, connection validation, recent/history.
- crates/provision-core/src/lib.rs: pinned runtime/dependency validation and readiness plans.
- apps/agent/src/provision.rs / deploy/runner/mymovie_runtime.py: inventory, managed installs and session canary.
- scripts/prepare-workflow-profile.py / examples/provision/: reviewed platform-specific profiles.
- deploy/comfy_nodes/mymovie_rembg/: original tiny CPU foreground-mask plugin.
- crates/storage-s3/src/lib.rs: signed transfer manifests, integrity and resume.
- packages/schema/package.json: placeholder; generated schema parity is not implemented.

## Verification/build
- Domain regression tests: inline #[cfg(test)] in the relevant Rust crate.
- Frontend test: apps/desktop/src/lib/file-drop.test.ts.
- deploy/runpod/README.md: ELF artifact, outbound relay startup and private GPU workers.
- deploy/cpu/: pinned weight-free ComfyUI Docker test environment.
- fixtures/cpu-workflow.json / cpu-canary.png: safe execution/import fixtures.
- scripts/cpu-smoke.py: real HTTP/history/PNG acceptance; artifacts/ is ignored.
- target/debug/bundle/macos/MyMovie Studio.app: ignored native build output.
- docs/screenshots/: native acceptance and Generate browser fixture screenshots.
- docs/WORKFLOW_SETUP.md / GENERATION_ACCEPTANCE.md: portable setup and live-test evidence.
- README.md / README.ru.md / README.fr.md: English/Russian/French usage.

## Documentation and references
- PROJECT_CONTEXT, MODULE_OWNERSHIP, API_CONTRACTS, DECISIONS, TASK_LOG: compact memory.
- IMPLEMENTATION_PLAN.md: approved scope and pending acceptance requirements.
- WORKFLOW_CATALOGUE_PLAN.md: approved reusable editor workflow/target pool, implemented schema-generated forms and agent conversion, with acceptance limits.
- DESIGN_HANDOFF.md / WORKFLOW_AUDIT.md / BRIDGE_CONTRACT.md: design/workflow/boundary notes.
- drafts/: ignored Base44 references; never stage these.
- UI_UX_AUDIT.md: twelve-tab hosted reference audit, state transitions, coverage limits and improvement priorities; raw evidence in ignored artifacts/ui-audit-2026-10-14/.
- Sibling astrofenki, homer_studio, unipuni, whatsapp-sender: read-only references.

## CI and notebooks
- .gitlab-ci.yml: checks, macOS/Linux packages, version-tag registry/Release publication.
- .github/workflows/: native macOS/Windows/Linux matrix and published tag prereleases.
- scripts/ci-setup.sh, check-release-version.py, gitlab-release.py: toolchains and immutable release files.
- scripts/package-agent.py: architecture-checked Linux/macOS x86_64/ARM64 agent archives, compiler helpers, notebooks and checksums.
- scripts/notebook-bootstrap.py / generate-notebooks.py: public release/prerelease resolution, checksum/relay preflight, verified artifact and GPU worker setup.
- deploy/notebook-runtime.defaults.json: immutable ComfyUI commit and official cloudflared URL/SHA256 embedded into generated notebook defaults; base setup installs compiler/browser in its isolated environment.
- deploy/colab/, deploy/kaggle/: generated notebooks; scripts/tests/: bootstrap/release regression.
- examples/workflows/: CPU, text-to-image, masked-edit API/editor fixtures; native mask editor import/preparation/export passed.
- playwright.config.ts / e2e/: mocked native Jobs exact-input/persistence and portable wrapper/selection acceptance.
- docs/CI_RELEASES.md: runner requirements, tag and notebook artifact usage.

## Studio refinement modules (0.1.7)
- lib/job-history.ts / job-history.test.ts: restore drafts from frozen run receipts, including exact values and media identities.
- lib/project-usage.ts / project-usage.test.ts: direct placement, draft references and effective scene/frame cast usage.
- src-tauri/src/service/thumbnails.rs: bounded background video posters and hash cache; media.rs serves confined poster routes.
- crates/provider-comfyui/src/workflow.rs: content-versioned Userdata publication, conflict-safe readback and install receipts.
- App.tsx: persistent bottom queue dismissal, responsive recents and save-before-Welcome navigation.
- docs/STUDIO_REFINEMENT_PLAN.md: approved refinement scope and later queue-edit/removal fixes.
- e2e/jobs.e2e.ts: idle/reopen/start, exact queue replacement through Generate and persistent bottom cleanup.

## Media/workflow simplification (0.1.8)
- service/catalogue.rs: validate/save reusable forms on base graph and selected profile.
- service/jobs.rs: refresh legacy/changed profiles before freeze, preserving session/revision guards.
- asset-core: pre-copy content deduplication and linked-policy preservation.
- Asset.archivedAt: recoverable shared Library/Renders visibility; original identity remains project-core-owned.
- e2e/library.e2e.ts / workflow-catalogue.e2e.ts: shared result Trash/Restore, exact gallery IDs and reusable API-only media form.
- docs/MEDIA_WORKFLOW_SIMPLIFICATION_PLAN.md: approved 0.1.8 scope and acceptance.

## Workflow wrappers and selected tasks (0.1.12)
- components/WorkflowEditor.tsx / WorkflowReadme.tsx: Inputs/Outputs/Setup/Guide, family variants and safe README rendering.
- components/WorkflowBootstrap.tsx / lib/setup-script.ts: complete verified artifact scripts, host-specific notebooks and connection instructions.
- workflow-core/src/bundle.rs: bounded portable collection format, graph hashes and machine-profile stripping.
- project-core/migrations/0005_workflow_wrappers.sql: backed-up v5 upgrade; wrapper defaults stay in JSON rows.
- job-core/runs.rs: atomic selected-task resume/cancel/replacement; receipts retained.
- service/catalogue.rs: portable catalogue import/export and reusable forms.
- scripts/tests/setup-script.test.ts: shell syntax/data quoting and archive guards.
- docs/WORKFLOW_WRAPPERS.md: approved behavior, setup order and validation limits.

## Guided examples (0.1.16)
- workflow-core/src/examples.rs: stable built-in catalogue, original editor graphs, illustrated guides and exact artifact metadata.
- examples/catalogue/ and scripts/generate-example-catalogue.py: reproducible previews, plugin archive, pinned SD model metadata.
- components/AgentWorkflowSetup.tsx: two-action review then dependency/install/restart/prepare/publish/recheck sequence; WorkflowEditor coordinates operation locks with the modal instance picker.
- apps/agent/src/provision.rs: session-bound review receipts, shared execution/install locks and restart requests.
- scripts/notebook-bootstrap.py: managed idle-worker restart supervisor; agents/relay/tunnel remain running.
- deploy/runner/mymovie_runtime.py: platform wheel closure, public metadata verification and offline installation.
- e2e/workflow-examples.e2e.ts and scripts/tests/: guided mock acceptance, archive contents and supervisor/runtime regressions.
- docs/WORKFLOW_EXAMPLES.md: exact example dependencies, paths, licenses, setup sequence and acceptance limits.

## Release/queue maintenance (0.1.17)
- GitHub release.yml starts on v* tags and calls reusable checks.yml; GitLab workflow accepts version tags only.
- integration-core SettingsStore owns monotonic terminal-queue dismissal merges; App.tsx protects against stale refreshes.
- provider-comfyui/src/workflow.rs distinguishes unreachable instances, timeouts and Userdata HTTP refusals during verified publication.
