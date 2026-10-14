# Architecture Decisions

# ADR-0001: Documentation-first planning gate

Date: 2026-10-13
Status: Accepted

Context: The compact context files were absent; the user requires them before project inspection and explicitly invokes plan-before-implementation.
Decision: Create the six documentation files first. Keep source, configuration, and dependencies unchanged until explicit plan approval. Inspect reference repositories read-only.
Consequences: Documentation records requested intent separately from verified implementation. Missing integration inputs are tracked as questions.
Related files: docs/PROJECT_CONTEXT.md, docs/ARCHITECTURE_INDEX.md, docs/MODULE_OWNERSHIP.md, docs/API_CONTRACTS.md, docs/TASK_LOG.md.

# ADR-0002: Ordered storyboard and user-provided screen designs

Date: 2026-10-13
Status: Accepted

Context: The user requested persisted draggable keyframes with prompts/comments/characters and answered the design questions.
Decision: Use ordered scene/shot lanes and user-provided Base44 visual direction. Export delivered as drafts/index.html; design prerequisite fulfilled. Rebuild remaining views using the same shell.
Consequences: Frame identity survives reorder; free-position canvas is outside the first board. Draft stays untracked and unmodified; source callbacks do not establish real persistence.
Related files: docs/DESIGN_HANDOFF.md, docs/IMPLEMENTATION_PLAN.md.

# ADR-0003: Durable project authority and provider transports

Date: 2026-10-13
Status: Accepted

Context: Scene snapshots, remote execution and portable packages need unambiguous ownership and crash recovery.
Decision: SQLite authority with revisioned recoverable JSON projections; ComfyUI WebSocket/history; owned relay SSE with replay and authenticated HTTPS commands.
Consequences: No dual-writer snapshots or claim of native ComfyUI SSE. Ambiguous submissions must reconcile before retry.
Related files: docs/API_CONTRACTS.md, docs/MODULE_OWNERSHIP.md, docs/IMPLEMENTATION_PLAN.md.

# ADR-0004: Revised multi-account and private-runner delivery scope

Date: 2026-10-13
Status: Accepted

Context: User uses RunningHub and explicitly requires multiple accounts, Servers/Nodes, private S3 LoRA/output transfer and bulk runner initialization in the latest UI requirements.
Decision: Revised approval covers Phases 0–3 in tested increments. Native local studio precedes multi-account RunningHub/batches, then a real outbound agent/relay/S3 and pinned provisioning. First test locally with Docker; cloud acceptance waits for image/hosting/storage and authorized artifacts.
Consequences: Supersedes the earlier single-account-only proposal. All requested routes/settings are present in the first UI; actions reflect implemented/validated capabilities. No implicit paid infrastructure creation.
Related files: docs/IMPLEMENTATION_PLAN.md, docs/PROJECT_CONTEXT.md.

# ADR-0005: Docker-first integration validation

Date: 2026-10-13
Status: Accepted

Context: User confirmed Docker first and offered cloud details or a rented CPU pod if needed. Docker context is orbstack.
Decision: Use the local OrbStack Docker engine for initial CPU ComfyUI/relay/private-storage tests. No pod rental is needed now; select live RunPod image/hosting/storage before cloud acceptance.
Consequences: Engine must stay running while containers are used; GUI window is optional. The revised implementation scope was subsequently approved with `go`. LTX/MINIMAX exports are now inspected; real provider bindings and compatible GPU execution remain unverified.
Related files: docs/IMPLEMENTATION_PLAN.md, docs/PROJECT_CONTEXT.md.


# ADR-0006: Explicit linked media and collection

Date: 2026-10-13
Status: Accepted

Context: User requests Adobe-style linked materials or copied references, with preparation for portable export.
Decision: Copy by default; explicit linked mode records native-managed sourcePath while retaining asset UUID/hash/reserved package path. Collect verifies originals, copies them into the current package and clears external locations. Relink accepts exact original content only.
Consequences: Scene/frame/character assignments survive collection and relocation. Links are nonportable until collected. Changed/missing originals fail safely. Collection is not a separate export-copy wizard.
Related files: crates/asset-core/src/lib.rs, crates/studio-contracts/src/lib.rs, apps/desktop/src-tauri/src/service.rs, apps/desktop/src/features/Library.tsx.

# ADR-0007: Shared scene cast and explicit reference slots

Date: 2026-10-13
Status: Accepted

Context: User wants model-reference images imported/dropped onto characters and included when characters participate in a scene.
Decision: Scene cast is inherited by its frames; additional frame cast extends it. Reference images are shared by asset ID and resolved only for explicit characterReference1..4 workflow bindings. Native drops use Tauri events; storyboard sorting uses pointer interactions because native file drops consume browser drag events.
Consequences: Character references are neither duplicated per scene nor silently injected into unbound graph inputs. Snapshots freeze resolved references. Finder gesture acceptance remains separately tracked.
Related files: crates/workflow-core/src/lib.rs, apps/desktop/src/App.tsx, apps/desktop/src/features/Board.tsx.

# ADR-0008: Document inbox exists before native setup

Date: 2026-10-14
Status: Accepted

Context: Finder cold launch delivers Opened before setup registers Studio; state() panics across the Cocoa callback and aborts.
Decision: Create a shared path inbox before Builder, inject it into Studio, and enqueue/deduplicate without accessing managed state in lifecycle callbacks. Recover poisoned inbox locks at this native callback boundary.
Consequences: Existing saved packages open after initialization without migration. Post-setup frontend event and polling contracts stay unchanged.
Related files: apps/desktop/src-tauri/src/main.rs, apps/desktop/src-tauri/src/service.rs.

# ADR-0009: Per-workflow RunningHub deployments and explicit recovery

Date: 2026-10-14
Status: Accepted

Context: Imported API graphs do not contain an authorized hosted deployment, and account defaults cannot describe multiple workflows. Provider refusals were hidden as ambiguous failures.
Decision: Persist per-workflow/account ID and API family, expose job creation from Workflows, freeze the resolved destination in receipts. Definitive refusals fail safely; uncertain outcomes require provider history reconciliation with no blind retry.
Consequences: Graphs stay immutable and old documents default to empty mappings. Hosted IDs/input schema still need real verification. Account credentials stay outside documents.
Related files: crates/workflow-core/src/lib.rs, crates/provider-runninghub/src/lib.rs, apps/desktop/src/features/Library.tsx, apps/desktop/src-tauri/src/service.rs.

# ADR-0010: Versioned CI artifacts for desktop and notebook workers

Date: 2026-10-14
Status: Accepted

Context: User requires GitLab CI artifacts/tags and deployment of the Linux client to Colab/Kaggle, including two independent GPUs.
Decision: Validate cross-package version parity before tag builds; publish checksums and immutable GitLab packages/Release links. Retain GitHub draft-release support. Notebook bootstrap verifies the prebuilt Linux artifact and isolates worker GPU/port/node identities.
Consequences: A GitLab project/eligible macOS runner and live authenticated relay remain external setup. Ad-hoc signing is development distribution only. No credentials or hosted resources are created by these changes.
Related files: .gitlab-ci.yml, .github/workflows/, scripts/gitlab-release.py, scripts/notebook-bootstrap.py, docs/CI_RELEASES.md.

# ADR-0011: Saved exact-input batches and endpoint lanes

Date: 2026-10-14
Status: Accepted

Context: User wants configurable Jobs, queued on one ComfyUI and parallel across instances.
Decision: Persist ordered independent drafts/runs, preserve exact typed overrides and invalid raw edits, freeze each attempt before dispatch. Normalize ComfyUI URL as a single-slot lane; relay URL+node identifies a worker; RunningHub capacity belongs to the account. Provider I/O occurs outside the global lock, scoped to the originating session.
Consequences: Unknown outcomes retain their slot; reopening unsent work pauses it. No result-handoff chains. Schema v2 upgrade requires UI acknowledgement and backed-up v1 SQLite/manifest before migration.
Related files: crates/job-core/src/runs.rs, crates/project-core/migrations/0002_job_runs.sql, apps/desktop/src-tauri/src/service/jobs.rs, apps/desktop/src/features/Jobs.tsx.

# ADR-0012: RunPod is the primary agent artifact target

Date: 2026-10-14
Status: Accepted

Context: User clarified that RunningHub tests workflows, while private RunPod ComfyUI is the main execution path.
Decision: Name CI artifacts for the Linux x86_64 ComfyUI agent, reject non-ELF/non-x86_64 package inputs, ship checksums and a RunPod guide. Keep outbound authenticated relay transport and independent GPU workers.
Consequences: No exposed ComfyUI port or public pod IP is required. CI builds do not provision cloud resources. Actual RunPod/relay/S3 acceptance and automatic LoRA/runtime sync remain pending.
Related files: .gitlab-ci.yml, .github/workflows/checks.yml, scripts/package-agent.py, deploy/runpod/README.md, docs/CI_RELEASES.md.

# ADR-0013: Publish complete native platform releases

Date: 2026-10-14
Status: Accepted

Context: User requires visible release downloads for macOS, Windows and Linux x86_64/ARM64, including private ComfyUI agents.
Decision: Build desktop packages on native hosts and smoke-test each Linux agent natively. Publish a complete GitHub prerelease after all checks/builds succeed, normalize filenames before checksums and refuse reruns that replace published binaries. GitLab retains immutable package links and requires a prepared Windows runner.
Consequences: Extends ADR-0010 beyond draft-only GitHub releases and ADR-0012 to ARM64 agents. Tags retain exact source provenance; signing/notarization and live cloud GPU validation remain separate.
Related files: .github/workflows/checks.yml, .github/workflows/release.yml, .gitlab-ci.yml, scripts/package-agent.py, docs/CI_RELEASES.md.
