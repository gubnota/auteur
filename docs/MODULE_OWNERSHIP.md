# Module Ownership

- WorkflowForm owns reusable presentation/bindings; workflow-core validates literal fields, types, media roles and uniqueness. Providers never guess semantic roles.
- Generate owns input editing/review; Jobs owns queue/history and restores frozen drafts into Generate.
- MediaPicker assigns existing asset IDs; native job-slot import returns exact IDs atomically. Feature modules do not resolve imports by basename.
- Library/Renders share project assets and receipt-derived provenance. Trash changes only archive metadata; asset-core owns byte identity/deduplication and Collect.

| Module | Responsibility |
| --- | --- |
| studio-contracts | Domain DTOs and serialized field names |
| project-core | Single-writer package, SQLite revisions, validation, JSON projections |
| asset-core | Immutable originals, copy/link policy, drop assignment, collect/integrity |
| workflow-core | Imported graphs, explicit bindings, pure exact typed input/prompt/cast resolution |
| job-core | ExecutionBackend interface, durable attempt/run state, lane eligibility and recovery |
| provider-* | Provider-specific health, stage, submit, status, cancel, collect |
| integration-core | Global settings, connections, recent documents, bounded diagnostics |
| provision-core | Pure pinned runtime/dependency validation and readiness plans |
| storage-s3 | Manifest-based transfers, size/hash verification, resumable download |
| desktop native | Command orchestration, Keychain, document lifecycle, native progress |
| desktop React | UI state, serialized saves, modal/drop interaction; no direct filesystem/network |
| relay | Authenticated node-scoped jobs, leases, event replay, private asset endpoints |
| agent | Outbound claims/reports, lease renewal, inventory, managed provision, session canary and receipts |
| deploy/scripts | Local acceptance, verified notebook artifacts, one CPU or isolated GPU workers |
| CI/release scripts | Platform builds, version checks, immutable packages and release links |

## Dependency rules
- Contracts sit below domain crates; project-core supplies package primitives.
- asset/workflow/job core may depend on contracts/project primitives.
- Providers implement job-core interfaces; domain code does not import desktop/UI.
- Shared Controls.SecretField owns masking and explicit form-value copy/reveal. Connections resolves public-default markers; private credential retrieval remains native-owned and explicit.
- Desktop orchestrates providers, persistence and OS APIs; React calls the bridge.
- Custom secrets pass only through native secure settings; never through project DTOs. Public user-selected test defaults are the explicit exception (deploy/node-auth.defaults.json).
- Native runner_tokens owns atomic vault storage; agent connection forms and notebook generator consume the same public defaults. Native service resolves missing relay credentials to the bundled desktop default; explicit per-connection credentials take precedence.
- Package sourcePath changes occur only through native import/collect/relink commands.
- Frontend save cannot create imported originals or change asset identity.
- Scene cast is inherited; frame cast extends it; workflow-core owns resolution.
- Cross-module filesystem access must use confined paths and validated identity.
- Relay/agent standard control actions are allowlisted. Custom recipes/PTY require private token pairs and explicit agent opt-in; generation never executes arbitrary shell.
- Reference repositories must not gain dependencies on this repo during this milestone.

## Testing ownership
- Package module: revision, locking, recovery and relocated documents.
- Asset module: dedup, batch assignment, copy/link/collect and missing/changed originals.
- Workflow module: graph validation and semantic/reference binding errors.
- Job module: frozen attempts, admission and ambiguous outcome recovery.
- Frontend: exact input parsing/persistence and native coordinate conversion; native interaction acceptance via actual app.
- Providers/infrastructure: local CPU canary; cloud/GPU acceptance remains separately gated.

- workflow-core owns immutable graph preparation and typed input validation; native job freezing owns the exact selected ComfyUI destination.
- CI tests use fixtures; release scripts never submit generation jobs or embed credentials.

- Native Jobs reserves/persists before dispatch; provider I/O runs outside the global project mutex.
- Every asynchronous result is scoped to the original project/session; job-core owns durable FIFO/slots.
- React edits saved drafts only; native preflight is authoritative before any upload.

## Catalogue/compiler ownership
- integration-core/catalogue owns local immutable workflow versions; project-core owns portable pins and schema-v5 migration/backups.
- workflow-core/schema normalizes live registries and validates target profiles; it cannot perform UI or provider I/O.
- Agent and desktop service coordinate compilation; Python helper delegates serialization to selected ComfyUI frontend, without generation.
- WorkflowCatalogue/WorkflowTarget/WorkflowInputs own saved selection and forms; no frontend JSON-to-API conversion heuristics.
- CI packages sidecars and architecture-verified agents; tests separate mock UI evidence from live execution.
- Notebook bootstrap owns bounded GitHub release discovery/checksum verification; CI explicitly bundles matching relay binaries. Release metadata never supplies arbitrary authenticated download hosts.
- Notebook base setup owns the separate pinned ComfyUI checkout, isolated CPU/CUDA Python environment, compiler browser and verified tunnel. It does not install workflow weights/plugins; these remain managed-agent initialization responsibilities.

## Queue, publication and derived media
- job-core owns transactional unstarted-run replacement. Native service validates and freezes replacement inputs under the project lock; canceled historical snapshots remain immutable.
- job-history restores editable UI drafts from receipts; it never rewrites historical attempts. queuedRunId blocks ordinary dispatch until replacement or explicit separation.
- Bottom queue dismissal belongs to app settings; integration-core merges persisted IDs monotonically and React merges background refreshes; jobs/results stay in package-owned storage. Nonterminal jobs cannot be hidden by dismissal.
- provider-comfyui owns bounded typed Userdata publication/readback; desktop, relay and agent coordinate it without arbitrary remote shell commands.
- Native thumbnails own optional derived cache/process concurrency; originals remain asset-core-owned. project-usage selectors label available cast references separately from actual render provenance.

- WorkflowEditor owns public inputs/output collection and guide presentation; workflow-core/bundle owns immutable portable validation and removes destination profiles/vault references.
- Hardware variants are separate graphs with separate requirements/preparations; UI metadata never translates model architecture.
- WorkflowBootstrap emits reviewed typed utility commands. InitializationRecipe owns portable script editing; private opted-in agent execution owns scripts. Managed agent/provision-core own installation and session readiness.
- job-core owns selected-task mutation transactions; desktop Jobs only selects IDs and routes exact receipt edits to Generate. Submitted receipts cannot be edited.

## Guided example setup
- workflow-core owns stable built-in example graphs/metadata; the native catalogue merges them without replacing saved movie copies.
- The agent owns reviews bound to node session, runtime fingerprint and exact effective workflow set. UI operation results are scoped to the current selection.
- Runtime helper resolves exact binary wheel dependencies against the active environment; verified public PyPI metadata supplies hash, size and license. It installs only reviewed cached wheels offline.
- NotebookRunner alone restarts its recorded managed ComfyUI processes. It checks every shared worker is idle; the relay/agents/tunnel remain running. External ComfyUI is read-only.
- Shared cache locks exclude generation while dependencies change or workers restart. Restart clears per-worker readiness; preparation and canary must pass again.

- WorkflowEditor owns local review/preparation selection. AgentWorkflowSetup submits durable initialization; BackgroundActivity observes it independently. Private custom execution uses the dedicated agent recipe/console protocol.
- Version-tag release workflows own CI entry; reusable checks cannot independently trigger on branch commits or pull requests.

## Background ownership (0.1.18)
- Agent initialization owns installation through readiness; the UI submits once and observes durable relay state. Navigation never owns/cancels the operation.
- Relay owns deduplication per node and leased operation state; agent local receipts reconcile interruptions without replaying mutations.
- BackgroundActivity observes/apply results through native project/connection/version checks; it never overwrites changed forms.
- Shared-runtime locks serialize mutations; independent instances remain parallel. Recipe receipts never replace verified readiness.
- Console transport is separate from generation jobs, private and opted-in; helpers terminate descendants on lost parent pipes. Workflow Trash belongs to wrapper metadata and preserves receipts/assets.

- Native project-core retains exact imported graphs and prepared profiles during desktop metadata saves; React owns editable names, board structure and wrapper metadata only. Direct ComfyUI preparation/publication reuses installed dependencies; dependency mutation remains agent-owned.

## Application resources (0.1.20)
- Global workspace owns workflows, instances, drafts, jobs and media. Movie storage owns scenes/cast/storyboard only; commands explicitly select the correct store.
- Movie migration copies resources with provenance, reuses content hashes and never submits historical pending tasks. UI changes cannot rewrite native immutable graph versions.
- Workflow definitions and hardware families are independent of node/session installations. Archive/restore applies to a whole family.
- The local/notebook supervisor owns process restart. The agent is outbound-only; the relay is the desktop endpoint. Direct ComfyUI and native SSH are not agent capabilities.
- MediaPicker and Renders resolve the same global asset identities. Example reference imports deduplicate across variants.
- workflow-core owns portable ZIP integrity and family selection; storage-s3 owns bounded HTTPS redirects. Provider credentials never cross redirect origins.

## Model credentials (0.1.21)
- Native Settings owns the HF vault entry; React receives only configured status and handles newly entered values transiently.
- provider-relay transports secrets separately from durable payloads. Relay credentials module holds expiring memory only; lease identity gates one-time consumption.
- Agent provision owns per-initialization scope; storage-s3 attaches authorization only to the permitted HF origin. Recipe subprocesses do not inherit desktop secrets.
- Workflow UI installation routes through agent dependency review. Graph publishing cannot imply dependency installation or duplicate catalogue identity.
