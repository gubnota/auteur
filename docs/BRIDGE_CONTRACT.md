# Approved implementation bridge

User approved Phases 0–3 with `go` on 2026-10-13. Shared DTOs in crates/studio-contracts/src/lib.rs are camelCase JSON. Frontend mirrors these types; parent owns schema/DTO changes. IDs UUID, revision optimistic conflict. No secret in any DTO.

Tauri invoke commands (frontend wrappers in src/lib/bridge.ts):
- create_project({path,name,demo}) -> Project; path is chosen .mymovie destination
- open_project({path,allowUpgrade?}) -> Project
- get_project() -> Project
- save_project({project,expectedRevision}) -> Project (new revision)
- import_asset({path}) -> Project
- import_workflow({path}) -> Project
- get_settings() -> AppSettings
- save_settings({settings}) -> AppSettings
- save_credential({connectionId,secret}) -> opaque ref (Keychain)
- list_jobs() -> Job[]
- submit_job({frameId,workflowId,connectionId}) -> Job
- preview_job_draft({draft}) -> JSON (pure preflight, no upload)
- start_job_draft({draftId}) -> Job[]
- list_job_runs() -> JobRun[]
- control_job_run({runId,action}) -> JobRun (pause/resume/cancel)
- refresh_jobs() -> Job[]
- cancel_job({jobId}) -> Job
- connection_health({connectionId}) -> JSON health/capabilities
- plan_deployment({workflowIds,connectionId}) -> JSON (unknown dependencies BLOCKED)
- runner_action({connectionId,action}) -> JSON (typed doctor/inventory/drain only)
- sync_storage({direction,assetIds}) -> JSON
- clear_diagnostics({kind}) -> AppSettings

Native file dialog plugin uses open/save, frontend exposes no general shell/filesystem. Asset previews convertFileSrc scoped active package; parent native authorizes scope after open. Browser preview may use explicit in-memory demo adapter labeled preview; real native bridge always persists.

Worker API expectations: project-core ProjectStore::create(path,name,demo), open(path), read(), save(project,expected_revision), path(), connection(). Actual exported choices document clearly for parent. Asset imports and workflow imports return DTO additions; parent composes project save. job-core owns scheduler persistence trait ExecutionBackend and provider adapters; job APIs document actual signatures. Integration core owns settings/credentials separately (parent implements).
