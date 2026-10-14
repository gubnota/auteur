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
- features/Jobs.tsx: saved batch drafts, exact input editor, review and run controls.
- features/Generate.tsx: standalone image/video/edit/multi-reference drafts.
- components/WorkflowInputs.tsx / WorkflowSetup.tsx: shared media slots, hardware flags and pinned dependency editor.
- lib/job-inputs.ts / job-inputs.test.ts: typed input resolution/readiness.
- features/Connections.tsx: endpoint types, credentials, runtime/storage settings.
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
- crates/provider-runninghub/src/lib.rs: RunningHub workflow/AI App transport.
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
- WORKFLOW_CATALOGUE_PLAN.md: proposed reusable editor workflow/target pool, schema-generated forms and agent conversion increment; approval pending.
- DESIGN_HANDOFF.md / WORKFLOW_AUDIT.md / BRIDGE_CONTRACT.md: design/workflow/boundary notes.
- drafts/: ignored Base44 references; never stage these.
- Sibling astrofenki, homer_studio, unipuni, whatsapp-sender: read-only references.

## CI and notebooks
- .gitlab-ci.yml: checks, macOS/Linux packages, version-tag registry/Release publication.
- .github/workflows/: native macOS/Windows/Linux matrix and published tag prereleases.
- scripts/ci-setup.sh, check-release-version.py, gitlab-release.py: toolchains and immutable release files.
- scripts/package-agent.py: architecture-checked Linux x86_64/ARM64 agent archives, notebooks and checksums.
- scripts/notebook-bootstrap.py / generate-notebooks.py: verified artifact and GPU worker setup.
- deploy/colab/, deploy/kaggle/: generated notebooks; scripts/tests/: bootstrap/release regression.
- examples/workflows/: CPU, text-to-image, masked-edit API/editor fixtures; actual UI exchange pending.
- playwright.config.ts / e2e/: mocked native Jobs exact-input/persistence and RunningHub mapping acceptance.
- docs/CI_RELEASES.md: runner requirements, tag and notebook artifact usage.
