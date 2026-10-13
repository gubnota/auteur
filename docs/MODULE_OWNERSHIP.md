# Module Ownership

| Module | Responsibility |
| --- | --- |
| studio-contracts | Domain DTOs and serialized field names |
| project-core | Single-writer package, SQLite revisions, validation, JSON projections |
| asset-core | Immutable originals, copy/link policy, drop assignment, collect/integrity |
| workflow-core | Imported graphs, explicit bindings, prompt/cast reference resolution |
| job-core | ExecutionBackend interface, durable attempt/receipt state and recovery |
| provider-* | Provider-specific health, stage, submit, status, cancel, collect |
| integration-core | Global settings, connections, recent documents, bounded diagnostics |
| provision-core | Pinned runtime validation and readiness plans; installation pending |
| storage-s3 | Manifest-based transfers, size/hash verification, resumable download |
| desktop native | Command orchestration, Keychain, document lifecycle, native progress |
| desktop React | UI state, serialized saves, modal/drop interaction; no direct filesystem/network |
| relay | Authenticated node-scoped jobs, leases, event replay, private asset endpoints |
| agent | Outbound claims/reports, typed operations, ComfyUI execution and local receipts |
| deploy/scripts | Local acceptance, verified notebook artifacts, isolated GPU workers |
| CI/release scripts | Platform builds, version checks, immutable packages and release links |

## Dependency rules
- Contracts sit below domain crates; project-core supplies package primitives.
- asset/workflow/job core may depend on contracts/project primitives.
- Providers implement job-core interfaces; domain code does not import desktop/UI.
- Desktop orchestrates providers, persistence and OS APIs; React calls the bridge.
- Secrets pass only through native secure settings; never through project DTOs.
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
- Frontend: native coordinate conversion; native interaction acceptance via actual app.
- Providers/infrastructure: local CPU canary; cloud/GPU acceptance remains separately gated.

- workflow-core owns account deployment resolution and frozen job destination; providers cannot infer hosted IDs from graphs.
- CI tests use fixtures; release scripts never submit generation jobs or embed credentials.
