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

Context: User uses retired hosted provider and explicitly requires multiple accounts, Servers/Nodes, private S3 LoRA/output transfer and bulk runner initialization in the latest UI requirements.
Decision: Revised approval covers Phases 0–3 in tested increments. Native local studio precedes multi-account retired hosted provider/batches, then a real outbound agent/relay/S3 and pinned provisioning. First test locally with Docker; cloud acceptance waits for image/hosting/storage and authorized artifacts.
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

# ADR-0009: Per-workflow retired hosted provider deployments and explicit recovery

Date: 2026-10-14
Status: Accepted

Context: Imported API graphs do not contain an authorized hosted deployment, and account defaults cannot describe multiple workflows. Provider refusals were hidden as ambiguous failures.
Decision: Persist per-workflow/account ID and API family, expose job creation from Workflows, freeze the resolved destination in receipts. Definitive refusals fail safely; uncertain outcomes require provider history reconciliation with no blind retry.
Consequences: Graphs stay immutable and old documents default to empty mappings. Hosted IDs/input schema still need real verification. Account credentials stay outside documents.
Related files: crates/workflow-core/src/lib.rs, removed provider adapter, apps/desktop/src/features/Library.tsx, apps/desktop/src-tauri/src/service.rs.

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
Decision: Persist ordered independent drafts/runs, preserve exact typed overrides and invalid raw edits, freeze each attempt before dispatch. Normalize ComfyUI URL as a single-slot lane; relay URL+node identifies a worker; retired hosted provider capacity belongs to the account. Provider I/O occurs outside the global lock, scoped to the originating session.
Consequences: Unknown outcomes retain their slot; reopening unsent work pauses it. No result-handoff chains. Schema v2 upgrade requires UI acknowledgement and backed-up v1 SQLite/manifest before migration.
Related files: crates/job-core/src/runs.rs, crates/project-core/migrations/0002_job_runs.sql, apps/desktop/src-tauri/src/service/jobs.rs, apps/desktop/src/features/Jobs.tsx.

# ADR-0012: RunPod is the primary agent artifact target

Date: 2026-10-14
Status: Accepted

Context: User clarified that retired hosted provider tests workflows, while private RunPod ComfyUI is the main execution path.
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

# ADR-0014: Explicit media and attested managed runtime readiness

Date: 2026-10-14
Status: Accepted

Context: User needs standalone image/video generation, exact multi-media workflow inputs, hardware flags and portable dependency initialization.
Decision: Share exact typed input resolution across Generate and Jobs; persist standalone drafts and explicit media roles in schema v3. Declare compatibility explicitly. Inventory the real ComfyUI Python environment and effective model paths; managed workers install only reviewed hash-pinned artifacts, then restart/re-inventory and run a session canary. Keep existing Mac environments read-only.
Consequences: No guessed loader IDs, automatic compatibility conversion, plugin pip scripts or implicit weight downloads. Profile builders resolve runtime pins and reviewed wheelhouses instead of shipping a misleading universal ready profile. Live cloud acceptance requires an actual reachable session; local GPU success does not prove cloud deployment.
Related files: docs/GENERATE_IMPLEMENTATION_PLAN.md, docs/WORKFLOW_SETUP.md, apps/desktop/src/features/Generate.tsx, apps/agent/src/provision.rs, deploy/runner/mymovie_runtime.py.

# ADR-0015: Immutable catalogue and target-specific frontend compilation

Date: 2026-10-14
Status: Accepted

Context: Repeated JSON upload and guessed widgets prevented reliable custom workflow jobs.
Decision: Import once into a local immutable catalogue and portable movie pin. Preserve editor JSON and export API through the selected ComfyUI frontend in an isolated read-only browser context. Describe literal inputs from its live registry; remember targets and editable layouts. Freeze target profile/output selection and recheck registry before dispatch. Publish compiler sidecars in native Linux/macOS agent artifacts.
Consequences: Requires Python/Playwright/Chromium and a reachable compatible runtime for preparation. Unsupported custom controls and dynamic branch switching need explicit bindings/re-export. retired hosted provider uses authorized hosted maps. Global catalogue changes never mutate project pins or old receipts.
Related files: docs/WORKFLOW_CATALOGUE_PLAN.md, crates/workflow-core/src/schema.rs, crates/integration-core/src/catalogue.rs, deploy/runner/mymovie_workflow_compiler.py, apps/desktop/src/components/WorkflowTarget.tsx.

# ADR-0016: Explicit queue edits and verified workflow publication

Date: 2026-10-14
Status: Accepted

Context: Creators need to stage work without executing, correct node selection, reuse forms and install editor graphs through the utility. Whole-registry hashes were invalidated by unrelated inventory changes.
Decision: Freeze idle queued runs; atomically replace only unstarted runs, retaining canceled receipts. Restore edits from frozen snapshots. Dismiss terminal bottom rows through app-local settings. Publish immutable versioned editor JSON through typed ComfyUI Userdata and verify readback. Scope compatibility to used schemas; validate selected models live and retain frontend compilation provenance separately.
Consequences: Reopening never starts queued work. Started jobs cannot be rewritten. Clearing the bottom panel preserves history/results. Legacy profiles require one explicit refresh. ARM64 CPU acceptance is distinct from cloud GPU acceptance.
Related files: crates/job-core/src/runs.rs, crates/provider-comfyui/src/workflow.rs, crates/workflow-core/src/schema.rs, apps/desktop/src/lib/job-history.ts, apps/desktop/src/App.tsx.

# ADR-0017: One composer, reusable forms and recoverable media identity

Date: 2026-10-14
Status: Accepted

Context: Repeated job-level binding setup, two editors, duplicate media copies and separate render cards obscured the normal workflow.
Decision: Configure exact literal bindings/layout once in Workflows; Generate edits all drafts, Jobs owns queue/history. Use asset-ID tile selection and exact-ID native import. Library/Renders share original asset rows and receipt-derived provenance; Trash is reversible metadata. Verify duplicate content before copy and preserve linked policy. Refresh legacy/changed profiles before new review/freeze, retaining layouts, values and final guards.
Consequences: Supersedes ADR-0016's explicit legacy refresh requirement for new attempts. No schema-version bump; archivedAt defaults absent. Historical references/receipts remain valid; new jobs reject trashed selections. Provider mappings remain explicit per account and unsupported serializers require correction.
Related files: apps/desktop/src/components/WorkflowForm.tsx, MediaPicker.tsx, features/Generate.tsx, Jobs.tsx, Library.tsx; crates/asset-core/src/lib.rs, workflow-core/src/schema.rs; docs/MEDIA_WORKFLOW_SIMPLIFICATION_PLAN.md.

# ADR-0018: Workflow resource contract and bounded refusal reasons

Date: 2026-10-14
Status: Accepted

Context: Redux reached creation but received undocumented 605; the previous diagnostic dropped plain-language messages. Public docs distinguish workflow-relative fileName from standard-model v2 download URLs.
Decision: Use documented workflow upload with apiKey/fileType=input for ComfyUI loader overrides in both hosted families. Preserve bounded non-sensitive reason fields instead of raw provider responses. Keep typed refusal/unknown admission and immutable receipts unchanged.
Consequences: Tests establish request correctness, not the cause of 605 or live provider acceptance. Suspicious reason fields remain omitted rather than partially redacted; no automatic paid retry.
Related files: removed provider adapter, docs/API_CONTRACTS.md, docs/GENERATION_ACCEPTANCE.md.

# ADR-0019: Portable designer wrappers and dependency-first preparation

Date: 2026-10-15
Status: Accepted

Context: Users need named media slots, output selection, visual guides and hardware variants, without reimporting graphs or confusing composer and queue. An uncompiled editor may require plugins before frontend preparation can succeed.
Decision: Preserve graphs immutably; attach reusable presentation metadata, independently prepared platform families and credential-free portable collections. Keep Generate as the composer and Jobs as selective task control. Accept pending sources for reviewed dependency installation; require restart/preparation/current-session verification before readiness. Remove the retired hosted adapter while retaining history.
Consequences: Schema v5 upgrade is backed up. Optional defaults require actual files on the node. Variant badges do not convert graphs. Setup is typed and hash-pinned; no arbitrary remote shell or stale-marker readiness.
Related files: workflow-core/src/bundle.rs, studio-contracts, job-core/src/runs.rs, WorkflowEditor.tsx, WorkflowBootstrap.tsx, agent/src/provision.rs.

# ADR-0020: Shared notebook test defaults and local relay tunnel

Date: 2026-10-15
Status: Accepted

Context: User explicitly requests predefined token values in UI/notebooks and a Colab-side tunnel on a custom port; required Secrets and external relay setup blocked first connection.
Decision: Keep the user-selected pair as public test defaults in deploy/node-auth.defaults.json. Generate active Python assignments with optional env/Secrets overrides commented out. Native stores private overrides atomically in the OS vault. New notebook connections inherit only the desktop credential. Bundle relay in CI client archives; notebook can own relay and cloudflared while ComfyUI/agents stay on loopback. Explicit temporary mode uses existing desktop REST polling.
Consequences: Defaults provide no private access protection; private deployments must replace both values consistently. Existing connection credentials remain independent. Temporary URLs/session IDs change and notebook disk is ephemeral; live cloud acceptance is separate from fixture tests. No general remote shell or automatic generation added.
Related files: apps/desktop/src/components/RunnerTokens.tsx, apps/desktop/src-tauri/src/service/runner_tokens.rs, scripts/generate-notebooks.py, scripts/notebook-bootstrap.py, scripts/package-agent.py.

# ADR-0021: Automatic notebook release resolution and reduced CI matrix

Date: 2026-10-15
Status: Accepted

Context: Empty manual artifact SHA256 blocked notebook setup; published v0.1.12 lacks the relay. User requested disabling macOS Intel desktop/agent and Ubuntu ARM64 agent builds.
Decision: Resolve published GitHub releases including prereleases, validate archive metadata/checksums and require the bundled relay for local Cloudflare mode. Retain explicit source+SHA256 overrides. Both CI systems explicitly package matching relays; comment out requested matrix entries without deleting target support.
Consequences: No token needed for public release metadata; verification stays mandatory. Old archives cannot gain relay support through notebook changes; a new version or uploaded current CI archive is required. GitHub Linux ARM64 desktop remains active; GitLab's existing disabled entry stays disabled.
Related files: scripts/notebook-bootstrap.py, scripts/generate-notebooks.py, .github/workflows/checks.yml, .github/workflows/release.yml, .gitlab-ci.yml.

# ADR-0022: Unmodified Run-all GPU notebooks

Date: 2026-10-15
Status: Accepted

Context: Shared test keys were present, but fresh notebooks still required manual ComfyUI revision/tool installation; Run all reached an active Stop cell.
Decision: Embed immutable base runtime pins from deploy/notebook-runtime.defaults.json, install in a separate session checkout/environment, verify cloudflared bytes, install the released compiler/browser, reuse healthy sessions and disable automatic shutdown cells. The agent receives the isolated interpreter.
Consequences: Fresh setup takes minutes with visible stages and private logs. No model/workflow-plugin downloads or generation at startup; reviewed app initialization still owns those. Existing unrelated checkouts are preserved. Saved Drive/release notebook copies need reopening to receive source changes.
Related files: scripts/notebook-bootstrap.py, scripts/generate-notebooks.py, scripts/tests/test_notebook_runtime.py.

# ADR-0023: Illustrated examples and reviewed managed setup

Date: 2026-10-15
Status: Accepted

Context: New notebook users need reusable examples with complete dependencies and app-driven setup without editing notebook cells for each workflow.
Decision: Merge stable built-in examples into the catalogue; pin editable movie copies. Derive exact reviewed dependencies from the selected workflow set, resolve binary wheel closure against the active environment, and bind apply to session/runtime/workflow review identity. Only the notebook supervisor may restart its managed idle ComfyUI workers; invalidate readiness and prepare/check again afterwards.
Consequences: Old movies remain readable. External ComfyUI stays read-only. New setup requires matching agent/supervisor artifacts; live cloud acceptance remains separate.
Related files: crates/workflow-core/src/examples.rs; apps/agent/src/provision.rs; deploy/runner/mymovie_runtime.py; scripts/notebook-bootstrap.py; docs/WORKFLOW_EXAMPLES.md.

# ADR-0024: Tag-only releases and one guided initialization flow

Date: 2026-10-15
Status: Accepted

Context: User requested tag-only builds, simpler remote setup, explicit instance selection and persistent removal of failed queue rows.
Decision: Run reusable GitHub checks only through tag-triggered releases; GitLab accepts semantic version tags only. The workflow modal owns one locked destination. After reviewing exact dependencies, one action composes existing agent install/restart/prepare/publish/readiness operations. Merge terminal queue dismissal IDs monotonically in native storage and frontend refreshes.
Consequences: Branch commits do not start CI; existing review/session/hardware checks remain authoritative. Agent setup needs matching >=0.1.16 runtime support. Queue clearing changes presentation only; history/results persist. Publication errors distinguish offline, timeout and HTTP refusal without replacing original graphs.
Related files: .github/workflows/checks.yml; .gitlab-ci.yml; AgentWorkflowSetup.tsx; WorkflowEditor.tsx; features/Library.tsx; integration-core/src/lib.rs; provider-comfyui/src/workflow.rs.
