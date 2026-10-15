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
| deploy/scripts | Local acceptance, verified notebook artifacts, isolated GPU workers |
| CI/release scripts | Platform builds, version checks, immutable packages and release links |

## Dependency rules
- Contracts sit below domain crates; project-core supplies package primitives.
- asset/workflow/job core may depend on contracts/project primitives.
- Providers implement job-core interfaces; domain code does not import desktop/UI.
- Desktop orchestrates providers, persistence and OS APIs; React calls the bridge.
- Custom secrets pass only through native secure settings; never through project DTOs. Public user-selected test defaults are the explicit exception (deploy/node-auth.defaults.json).
- Native runner_tokens owns atomic vault storage; UI fields and notebook generator consume the same public defaults. Per-connection credentials remain separate.
- Package sourcePath changes occur only through native import/collect/relink commands.
- Frontend save cannot create imported originals or change asset identity.
- Scene cast is inherited; frame cast extends it; workflow-core owns resolution.
- Cross-module filesystem access must use confined paths and validated identity.
- Relay/agent control actions are allowlisted; arbitrary command execution forbidden.
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
- Notebook base setup owns the separate pinned ComfyUI checkout, isolated CUDA-Python environment, compiler browser and verified tunnel. It does not install workflow weights/plugins; these remain managed-agent initialization responsibilities.

## Queue, publication and derived media
- job-core owns transactional unstarted-run replacement. Native service validates and freezes replacement inputs under the project lock; canceled historical snapshots remain immutable.
- job-history restores editable UI drafts from receipts; it never rewrites historical attempts. queuedRunId blocks ordinary dispatch until replacement or explicit separation.
- Bottom queue dismissal belongs to app settings; jobs/results stay in package-owned storage. Nonterminal jobs cannot be hidden by dismissal.
- provider-comfyui owns bounded typed Userdata publication/readback; desktop, relay and agent coordinate it without arbitrary remote shell commands.
- Native thumbnails own optional derived cache/process concurrency; originals remain asset-core-owned. project-usage selectors label available cast references separately from actual render provenance.

- WorkflowEditor owns public inputs/output collection and guide presentation; workflow-core/bundle owns immutable portable validation and removes destination profiles/vault references.
- Hardware variants are separate graphs with separate requirements/preparations; UI metadata never translates model architecture.
- WorkflowBootstrap emits reviewed typed utility commands; it cannot submit arbitrary shell to a remote runner. Managed agent/provision-core own installation and session readiness.
- job-core owns selected-task mutation transactions; desktop Jobs only selects IDs and routes exact receipt edits to Generate. Submitted receipts cannot be edited.
