# Implementation Plan: reusable workflow forms and a unified media library

Status: Implemented; local verification complete. Live provider/cloud acceptance remains pending.
Date: 2026-10-14.
Branch: main.

## Goal

Make the normal flow “saved workflow → saved node → media and values → Add to queue → Run queued.” Configure a workflow's public inputs once in Workflows, use Generate as the only input editor, and use Jobs for queue/history. Make Library and Renders share asset identities, show Render tags/provenance, support searchable thumbnail selection and recoverable removal, and reuse existing originals without temporary duplicate copies.

## Existing behavior

- Imported workflow versions and original asset identities are immutable. SQLite is authoritative; serialized native mutations preserve revision/session checks.
- Workflows' manual binding UI has a fixed semantic menu without explicit custom media descriptors. Prepared ComfyUI profiles generate a richer form, while unprepared API/RunningHub graphs have no equivalent setup. Job-specific bindings do not update the reusable workflow.
- Generate and Jobs both contain an input editor. Generate mode tabs change labels/filter hints but do not establish workflow capability. Jobs owns review as well as history and queue controls.
- Library selectors use searchable text lists, without thumbnails. Drop/file assignment sometimes finds the imported asset by basename; this fails when a duplicate has another name or names collide.
- Native collection already registers outputs in project.assets. Library lacks Render tags and receipt links; Renders repeats results per job, without removal.
- Removing an asset row would violate project-core's immutable-original contract and could break frame/cast/frozen job references. No Trash metadata exists.
- Asset imports deduplicate after creating a temporary copy; a duplicate copied import can implicitly collect an existing linked asset.
- The supplied Redux graph matches the saved project version. LoadImage literals 19.image and 86.image feed connected branches; loader 88 has no consumers. Roles must be assigned explicitly, rather than inferred from enumeration order.
- The supplied movie's local Klein FaceSwap profile has a legacy registry hash. Dispatch rejects it after queueing, without an actionable preparation path.
- The user confirmed Redux's hosted RunningHub Workflow URL with ID 2110376761482002434. Its current saved mapping uses AI App family and it has no bindings. The public page could not be inspected, so graph/deployment correspondence is user-confirmed, not provider-verified.

## Proposed approach

### One reusable form per workflow

- In Workflows, provide a compact “Inputs” section: add/edit labeled fields with media kind/role, prompt/text, number, boolean or JSON; retain defaults and Advanced/Hidden choices.
- List literal node fields with node ID/type, input name, type and “Used as …” badges. Show already used fields; prevent duplicate assignments while allowing editing their existing binding. Internal graph links stay non-editable.
- Derive controls from live ComfyUI registry metadata where available. For API-only exports, use literal types and recognized loader inputs as suggestions; explicitly label fields without a registry as unverified. Never invent combo choices or custom-node behavior.
- Persist stable semantic keys, Binding.media and Workflow.layout. Apply the same layout to base API graphs and target profiles. Explicit workflow bindings override generated descriptors for the same node/input.
- Expose two connected Redux image slots once; leave disconnected loader 88 out of active job bindings and show it in Advanced setup with an explanation. Its imported literal stays intact; hiding a connected field must still preserve and submit its value. Role labels follow the graph and explicit user selection; never assume “first image = source.”
- Remove the ordinary job-level “Bind literal input” requirement. Link to “Configure workflow inputs” instead. Preserve existing per-job overrides when restoring historical drafts, clearly marking them as overrides.
- Save URL-derived RunningHub ID/family once per workflow/account. For the user-confirmed Redux deployment use workflow / 2110376761482002434; retain independent LTX mappings. Do not infer unrelated deployments from imported JSON.

### Generate edits; Jobs executes and records

- Remove the mode selector; new standalone drafts use Custom. Existing mode/context values remain readable.
- Generate handles standalone and storyboard drafts, saved workflow/node selection, a compact batch list with removal, visible media/prompt fields, collapsible Advanced fields and a single review modal.
- Keep Add to queue and Run now distinct. Queue replacement is available only for unstarted batches and preserves exact bindings, media, provider destination and values.
- Jobs shows queued batches and history with Run queued, Run all queued, Cancel, Edit and Reuse. Edit/Reuse opens the same Generate editor; do not maintain a second composer.
- Refresh an old target profile before reviewing/freezing a new attempt. Preserve fields by exact node/input identity and retain saved overrides. If structural changes remove/change bound fields, show what needs review before queueing. Keep the provider's final validation guard and historical snapshots immutable.
- Offline preparation errors retain the draft and offer Retry preparation / Choose another node. Do not submit, upload or blindly retry an ambiguous provider task.

### One library, with tiles and recoverable removal

- Add a shared media picker modal with search, thumbnail tiles, type filtering, visible selected state, keyboard/focus handling and an explicit clear action. Use it for workflow slots, frame images and character references.
- Gallery selection and internal asset dragging assign asset IDs directly. External file/drop import returns exact IDs and atomically assigns the intended job slot; never resolve imports by filename.
- Compute Render tags and provenance from durable job.results relationships. Library gains Render and Trash filters; Renders uses the same grid filtered to results, with unique asset cards and links to every producing job.
- Generate's recent results come from actual job outputs, rather than the last imported images/videos.
- Add optional Asset.archivedAt metadata. “Remove” moves the asset to Trash across Library/Renders; “Restore” reverses it. Existing references and original files remain valid. A removal dialog shows frame/cast/draft/job usage, including active or frozen attempts. Removal of multiple selected assets is supported.
- Newly queued jobs reject archived selections until restored or replaced. Previously frozen jobs continue using their retained originals. Removing a result does not alter its job receipt.
- Resolve duplicate imports by verified content identity before writing a copied original. Reuse the existing UUID and retain its link/copy policy; explicit Collect continues to own link consolidation. Check size/hash/kind and source availability; do not merge different media by filename.
- New serde metadata defaults to absent, preserving v4 document compatibility. Do not remove immutable original rows or graph versions.

## File changes

All paths are repository-relative; create only the new files listed here. No source deletions or dependencies are needed.

### Frontend

- `apps/desktop/src/App.tsx` — modify: route all draft creation/editing to Generate; connect queue review, preparation and exact-ID job imports; pass shared result/usage data to Library/Renders; preserve serialized saves and session guards.
- `apps/desktop/src/features/Generate.tsx` — modify: single Custom composer for standalone/storyboard contexts, compact workflow/node/batch controls, queue replacement, preparation readiness and review; render true result media.
- `apps/desktop/src/features/Jobs.tsx` — modify: remove duplicate input composer; retain queue/history controls and restore drafts into Generate.
- `apps/desktop/src/features/Library.tsx` — modify: workflow form setup and RunningHub URL mapping; shared media/result grid, search, Render/Trash filters, selection/removal/restoration and provenance; character gallery selection.
- `apps/desktop/src/features/Board.tsx` — modify: use thumbnail media picker for frame selection, excluding archived choices.
- `apps/desktop/src/components/WorkflowTarget.tsx` — modify: use shared workflow input setup; clear preparation states/actions; preserve installation/export functionality.
- `apps/desktop/src/components/WorkflowInputs.tsx` — modify: display saved labels/media roles and gallery slots; replace routine per-job binding creation with Configure workflow inputs; preserve restored override support.
- `apps/desktop/src/components/Media.tsx` — create: extract existing image/video/audio preview implementation so the gallery can reuse it without importing the feature module.
- `apps/desktop/src/components/MediaPicker.tsx` — create: accessible search/tile modal returning existing asset IDs, supporting single/multiple selection.
- `apps/desktop/src/components/WorkflowForm.tsx` — create: reusable persistent input-binding editor and used-field indicators.
- `apps/desktop/src/components/JobReview.tsx` — create: move exact snapshot review/queue/run controls into the single Generate path.
- `apps/desktop/src/lib/job-drafts.ts` — create: move newJobDraft into a feature-independent helper; default new standalone drafts to Custom.
- `apps/desktop/src/lib/types.ts` — modify: optional archivedAt metadata and exact-ID job import response mirror.
- `apps/desktop/src/lib/job-inputs.ts` — modify: consistent base/profile layout application, media descriptor precedence and archived-selection readiness.
- `apps/desktop/src/lib/project-usage.ts` — modify: include direct character, draft and frozen job/result usage for removal/provenance.
- `apps/desktop/src/styles/studio.css` — modify: tidy rem-based gallery tiles, compact sections, wrapped labels, contrast, modal scrolling and button spacing; preserve Fenki palette.

### Native/domain

- `crates/studio-contracts/src/lib.rs` — modify: backwards-compatible archivedAt on Asset and import result DTO carrying exact asset IDs.
- `crates/project-core/src/lib.rs` — modify: initialize/validate mutable library metadata while preserving original identity, revision and reference invariants; add compatibility tests.
- `crates/asset-core/src/lib.rs` — modify: pre-copy identity reuse, exact import-ID result and explicit link-policy preservation; retain existing import/drop contracts through wrappers.
- `crates/workflow-core/src/schema.rs` — modify: conservative API literal descriptors, output-reachability-aware media discovery and reusable binding validation; keep registry-driven controls authoritative and unused loaders out of mandatory media slots.
- `crates/workflow-core/src/lib.rs` — modify: apply forms to base/profile graphs consistently, validate media binding uniqueness/types, reject archived media for new snapshots; update Asset test fixtures.
- `apps/desktop/src-tauri/src/service.rs` — modify: typed import_job_media command with slot validation and atomic ID assignment under the single writer.
- `apps/desktop/src-tauri/src/service/catalogue.rs` — modify: save_workflow_form command persists validated bindings/layout; reuse preparation for legacy profile refresh without losing saved form mappings.
- `apps/desktop/src-tauri/src/service/jobs.rs` — modify: ensure current required target preparation before preview/freeze, recheck session/revision; reuse media identity during result collection and preserve provenance/frozen attempts.
- `apps/desktop/src-tauri/src/main.rs` — modify: register new form/import commands.

### Verification and documentation

- `apps/desktop/src/lib/job-inputs.test.ts` — modify: saved media bindings/layouts across targets, archived selection, exact overrides and type validation.
- `apps/desktop/src/lib/project-usage.test.ts` — modify: frame/character/draft/frozen-result usage distinctions.
- `e2e/fixtures/jobs.ts` — modify: mirror new commands, reusable forms, result indexing and Trash behavior.
- `e2e/generate.e2e.ts` — modify: Custom-only composer, workflow reuse, exact two image slots, queue editing/removal and Jobs-to-Generate routing.
- `e2e/jobs.e2e.ts` — modify: queue/history-only page, restored exact receipts, replacement stays idle and existing bottom Clear finished behavior.
- `e2e/library.e2e.ts` — modify: searched tile selection, render tag/provenance, bulk Trash/Restore, usage and unchanged asset IDs/files.
- `e2e/workflow-catalogue.e2e.ts` — modify: setup once, used-field badges, target refresh with retained values and incompatible-field review.
- `e2e/runninghub.e2e.ts` — modify: URL family/ID parsing, per-account persistence, reusable provider bindings and actionable incomplete setup.
- `docs/PROJECT_CONTEXT.md`, `docs/ARCHITECTURE_INDEX.md`, `docs/MODULE_OWNERSHIP.md`, `docs/API_CONTRACTS.md`, `docs/DECISIONS.md`, `docs/TASK_LOG.md` — modify: compact implementation-aligned memory after verified changes.
- `docs/WORKFLOW_SETUP.md`, `docs/GENERATION_ACCEPTANCE.md`, `README.md`, `README.ru.md`, `README.fr.md` — modify: new setup/queue/library flow and accurate acceptance limits.
- `docs/screenshots/media-workflow-0.1.8.png` — create: native acceptance screenshot using a disposable movie and safe fixture media.
- `Cargo.toml`, `Cargo.lock`, `package.json`, `package-lock.json`, `apps/desktop/package.json`, `packages/schema/package.json`, `apps/desktop/src-tauri/tauri.conf.json` — modify: synchronized version 0.1.8 after verification.

## Implementation steps

1. Contracts/persistence and asset identity: add optional library metadata and exact import IDs; test older packages, copy/link dedup, same names/different bytes and preserved references. Keep originals immutable.
2. Reusable forms: implement save_workflow_form, base/API descriptors and shared Workflows setup; test two image roles, used-field prevention, retained defaults/hidden values and local/profile/provider parity.
3. Native preparation and assignment: ensure legacy refresh precedes new attempt freeze; implement atomic import_job_media; test missing registry nodes, session changes and duplicate media assignment. Keep dispatch validation and old receipts unchanged.
4. Unified media UI: extract Media, add MediaPicker, tag/index results, implement Trash/Restore and usage reporting; test search/selection/drop, exact IDs, multi-removal and restart persistence.
5. Unified generation UI: migrate constructors/review, support both contexts in Generate and reduce Jobs to queue/history; verify idle enqueue, all-node parallel eligibility, exact replacement and reuse.
6. Native acceptance: back up the supplied package, configure Redux's user-confirmed Workflow mapping and the two connected slots through the app, refresh the local Klein profile while retaining values, inspect review/queue without submitting a paid job. Use disposable packages for removal/dedup tests.
7. Run required checks, update compact context and EN/RU/FR documentation, capture the native screenshot, increment to 0.1.8, build and replace the installed macOS app with a recoverable previous-app backup. Make small main-branch commits; exclude private packages, drafts and unrelated cpu-canary.png.

## Verification

- `cargo fmt --all --check`; `cargo test --workspace` with loopback permissions when required.
- `npm run typecheck`; `npm test`; `npm run test:e2e`; `npm run build`.
- `python3 scripts/check-release-version.py`; formatting and `git diff --check`.
- Native small-screen modal inspection: thumbnails/search, multiline inputs, focus/keyboard, padding and contrast.
- Native close/reopen persistence: workflow forms, node selection, queue edits, Render tags and Trash/Restore.
- Compare asset IDs and original file counts before/after selecting, dropping and reusing the same imported media; verify linked assets stay linked until explicit Collect.
- Prepare/export the supplied Redux API graph on a compatible available node; if its plugins/models are absent, show their exact requirements rather than claim generation readiness.
- Verify Redux RunningHub review uses workflow family/confirmed ID and both media fields, without creating a paid task.
- Verify legacy Klein preparation retains values and removes the legacy-hash blocker; final provider validation still rejects real registry/model incompatibility before uploads.
- Build ARM64 macOS release and verify installed version/signature. Test using disposable media/packages; a real weighted run or paid cloud task is separate from UI/preflight acceptance.

## Risks / edge cases

- Redux includes several custom nodes/models; a valid form does not establish availability on local ComfyUI. Surface preparation/install requirements without assuming Apple Silicon compatibility.
- API literals do not contain complete provider schema. Unknown upload nodes need explicit binding types; linked node sockets cannot be replaced by form fields.
- Multiple inputs may intentionally reuse the same media. Mark already assigned media, but allow reuse; prohibit duplicate bindings to the same literal field.
- Preserve historical bindings and inputs independently of later form edits. Missing fields require review, rather than silent value loss or sending a changed graph.
- Render origin is many-to-many: one asset may be imported and produced by several jobs. Deduplicate the Library card while retaining all job links.
- Trash hides a shared asset in normal pickers/views but retains existing scene/job references and bytes. Physical storage is reclaimed only by a later explicit purge design.
- Refresh and imports must remain session-scoped and serialized; do not replace pending edits or freeze a stale draft.

## Out of scope

- Permanent file purge, paid RunningHub submission, new GPU rentals, remote infrastructure provisioning, new workflow-specific model installers, and automatic inference of private provider deployment schemas.
- A release tag/publication or new CI design in this UI refinement; retain existing cross-platform CI and agent packaging.
- Modification of ignored Base44 drafts or committing personal media, credentials, session state or the supplied movie.
