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
