# Implementation Plan: Jobs workspace and exact workflow inputs

Date: 2026-10-14
Status: Implemented and locally verified; hosted artifact and live cloud acceptance tracked in TASK_LOG.
Approval: user approved implementation with “go”.
Branch: main.

Scheduling preference confirmed: independent jobs queue automatically on the
same ComfyUI instance; different instances run in parallel by default.

## Goal

Add a Jobs sidebar workspace for saved generation drafts, exact typed inputs,
workflow combinations and durable execution history. Reuse the existing
ComfyUI/RunningHub/relay adapters and portable .mymovie storage.

## Existing behavior

- Workflows and keyframes open a single-workflow SubmitDialog; there is no Jobs route.
- The bottom queue lists durable attempts; Renders displays collected outputs.
- Job drafts and workflow dependencies do not persist. Submission requires a frame.
- Prompts are always composed from project/scene/frame; the dialog cannot override
  them. Image input always uses the frame asset. Other bound inputs accept values.
- Boolean inputs currently use text and JSON inputs remain strings in the dialog.
- RunningHub deployment/family is account-scoped and frozen in attempt snapshots.
- Missing images are rejected natively, but do not disable the current submit button.
- SQLite schema v1 stores project and individual job JSON; no workflow-run records.
- The user confirmed LTX Workflow 2110044532631932930; its prompt/image bindings
  are saved. Real provider execution and account entitlement remain unverified.

## Proposed approach

### Workspace

- Add Jobs beside Workflows: saved drafts, selected draft editor, and run history.
- Each draft has a name, target keyframe, ordered batch items and per-item
  connection/deployment, inputs and media sources. Support duplicate/delete/reorder.
- Combine means a batch of independent configured jobs, per the user's answer.
  Jobs sharing a ComfyUI instance enter a durable FIFO automatically; separate
  instances dispatch concurrently by default. No predecessor dependency required.
- Reuse Fenki colors, original SVG symbol, rem spacing, custom modal pickers and
  toggles. All selectors, including assets and batch items, use these controls.
- Existing keyframe/Workflows entry points open a prefilled Jobs draft so there is
  one composer rather than two inconsistent submission forms.

### Exact inputs

- Show every explicit binding with semantic name, node ID, input field, type,
  imported default and selected source. Add/remove bindings through a modal listing
  literal graph inputs; connected inputs remain read-only and graph originals immutable.
- Inputs support string, finite number, boolean toggle and parsed JSON. Do not guess
  arbitrary custom-node widget schemas or interpret linked node arrays as constants.
- Prompts can use composed project/scene/frame text or an exact per-job override.
- Images/masks/reference slots use project asset IDs or frame/cast sources,
  including already collected results. Native staging owns provider filenames.
- LTX exposes its confirmed prompt/image inputs; users can explicitly bind FPS,
  duration, width, height and seed from the audited nodes. Do not silently apply
  unsupported values or rewrite the original graph.
- Preview resolved inputs and the bound graph without uploads or job creation.
  Unstaged media is shown as asset ID/hash with provider filename pending; record
  the actual final filenames/payload after staging. Never claim a draft preview is
  the final wire payload before media staging.
- Native validation reports missing/stale workflow or frame, invalid values,
  missing/changed assets, absent credentials/deployment, unavailable reference slots,
  incompatible media sources and unsupported routes before any provider upload.
  A busy instance queues valid jobs rather than rejecting the batch.
- Final review displays connection, API family/hosted ID, input values and upload
  sources. Starting a configured draft explicitly authorizes its listed items.

### Persistence and orchestration

- Add serde-defaulted Project.jobDrafts; old projects deserialize with no drafts.
- Freeze batch item graphs, bindings, resolved literals, destination and initial
  asset hashes in a run record before network activity; credentials remain Keychain-only.
- Add SQLite schema v2 job_runs(id,json) through a transactional migration; keep
  existing projects/jobs/history intact. Project projections include recoverable
  jobs/drafts.json and jobs/runs/<id>.json. Older apps must reject schema v2 clearly.
- job-core owns batch state/scheduling and persistence; native service owns provider
  calls, media staging and progress. React never calls provider APIs or filesystem.
- Maintain a durable FIFO per normalized ComfyUI endpoint; duplicate connection
  records pointing to the same normalized endpoint share its lane. Distinct URL
  aliases cannot be proven identical automatically and are a documented limitation.
- Default to one active dispatch slot per ComfyUI instance; additional batch items
  remain waiting and start automatically when that instance's slot is released.
  ComfyUI may itself report queued when earlier external work is ahead of our job.
  Independent instances dispatch concurrently. RunningHub honors each configured
  account's concurrency; relay jobs honor their configured worker identity/capacity.
- Refactor native orchestration so provider network awaits do not hold the global
  Studio mutex. Reserve durable attempts under lock, dispatch outside it, then
  commit responses only to the originating project/session. Polling and collection
  must also avoid serializing independent instances through the global lock.
- Pause/cancel stops waiting items and uses existing cancel for active attempts.
  A failed item does not stop independent items. An unknown submission retains
  its destination's admission slot pending reconciliation; other instances continue.
  Reopening a movie restores unsent items paused; Resume is explicit, while known
  submitted attempts are reconciled through existing provider status polling.
- Bind each attempt to its run/item. Use durable reservations and batch item states
  to prevent double dispatch. Show waiting, server-queued and running distinctly.
- Existing render queue, receipts, result collection and native progress remain
  authoritative; Jobs displays them and does not create a second queue engine.

## File changes

Create:
- apps/desktop/src/features/Jobs.tsx — draft editor, typed inputs, batch ordering,
  exact-input review, per-instance queue status and project asset pickers.
- apps/desktop/src/lib/job-inputs.ts — UI input parsing and source presentation.
- apps/desktop/src/lib/job-inputs.test.ts — invalid numbers/JSON, boolean values,
  exact prompt overrides and immutable imported defaults.
- crates/job-core/src/runs.rs — durable batch records, per-instance dispatch eligibility,
  pause/resume/cancel/recovery and attempt association.
- crates/job-core/tests/runs.rs — restart, duplicate dispatch, FIFO and parallel-instance tests.
- crates/project-core/migrations/0002_job_runs.sql — additive schema v2 migration.
- e2e/jobs.e2e.ts — mocked composer, mapping, exact values and reopen acceptance.
- docs/screenshots/jobs-workspace.png — native screenshot using a temporary sample.

Modify:
- crates/studio-contracts/src/lib.rs — defaulted drafts, typed source/item/run DTOs,
  optional attempt run/item association; preserve old serialized job compatibility.
- crates/project-core/src/lib.rs — transactional v1→v2 migration, draft validation,
  recoverable projections and old-project/reopen tests.
- crates/workflow-core/src/lib.rs — pure input resolution, explicit overrides,
  source/type validation and preview; tests preserving original graph/version.
- crates/job-core/src/lib.rs — expose run module; freeze associations in attempts;
  keep existing ambiguity/admission semantics and update contract fixtures.
- apps/desktop/src-tauri/src/service.rs — preview/start/list/pause/resume/cancel
  commands; preflight all media before uploading; shared single-step submission;
  drive eligible batch items through current refresh loop; separate provider I/O
  from the global lock and reject responses to a switched project/session.
- apps/desktop/src-tauri/src/main.rs — register Jobs commands.
- apps/desktop/src/lib/types.ts — mirror defaulted draft/run/source contracts.
- apps/desktop/src/lib/bridge.ts — typed Jobs command helpers and preview fallbacks.
- apps/desktop/src/App.tsx — Jobs route, prefilled draft entry points, run refresh;
  replace SubmitDialog with the shared composer.
- apps/desktop/src/features/Library.tsx — route Create generation job to Jobs;
  show attempt/run associations in result details.
- apps/desktop/src/styles/studio.css — Jobs layout, input panels and batch item states.
- e2e/runninghub.e2e.ts — migrate existing entry/mapping tests to shared composer.
- Cargo.toml, Cargo.lock, package.json, package-lock.json,
  apps/desktop/package.json, apps/desktop/src-tauri/tauri.conf.json — version 0.1.3
  parity after implementation; no new dependency planned.
- README.md, README.ru.md, README.fr.md — Jobs setup, exact inputs, combination,
  recovery and migration behavior in English/Russian/French.
- docs/PROJECT_CONTEXT.md, ARCHITECTURE_INDEX.md, MODULE_OWNERSHIP.md,
  API_CONTRACTS.md, DECISIONS.md, TASK_LOG.md — tested contracts, boundaries,
  migration decision and acceptance evidence.

No files are deleted. Provider protocols remain unchanged. Subsequent user
steering made RunPod the primary target: agent artifact names, ELF checks and
the bundled RunPod guide are included in this increment.

## Implementation steps

1. Add draft/run/source DTOs and migration. Verify an old saved movie opens with
   no drafts; save/reopen exact values and batch ordering; rollback failed migrations.
2. Implement pure native resolution/preview. Verify prompt override, typed JSON,
   booleans, media kinds and missing image rejection before any upload. Preserve
   graph hashes and linked inputs; share logic with actual submission.
3. Implement durable batch orchestration and recovery. Verify FIFO on one instance,
   concurrent dispatch across two instances, no duplicate submit, frozen destinations,
   cancel/pause, unknown-slot retention, project-switch safety and explicit resume
   after restart. Use two delayed mock providers to prove genuine parallel I/O.
4. Build Jobs UI and redirect existing entry points. Verify complete exact-value
   editing, modal controls, draft persistence and actionable readiness errors.
5. Verify provider payloads with fixtures and mocked execution, including LTX
   mappings. Keep real RunningHub execution separate from mocked acceptance.
6. Update docs/version, build native 0.1.3, verify signature and replace installed
   app under existing authorization, preserving a backup. Capture native sample
   screenshot; commit/push coherent increments on main.

## Verification

- cargo fmt --all -- --check; cargo test --workspace --locked.
- npm run typecheck; npm test; npm run test:e2e; npm run build.
- python3 scripts/check-release-version.py; git diff --check.
- npm run tauri:build -- --bundles app; strict ad-hoc signature/version check.
- Native: reopen v1 project, configure draft, close/reopen, inspect preview, block
  missing image, run a weight-free batch on one local ComfyUI and collect results.
- Two mock ComfyUI instances: same-instance FIFO, distinct-instance overlap,
  unrelated progress during a slow request, and no stale-project receipt writes.
- Use a temporary project for acceptance; never fabricate user frame media or
  submit a paid RunningHub job as an incidental UI test.

## Risks / edge cases

- Exact arbitrary custom-node field constraints require provider/registry evidence;
  generic type checks cannot promise model compatibility or remote acceptance.
- Selecting a collected result for a new job uploads it to that job's destination;
  provider filenames cannot be reused across providers. Review shows destinations.
- Same-instance FIFO governs this app's work; externally submitted ComfyUI work
  can change server queue order and delay start. URL aliases need explicit handling
  later if multiple records refer to the same server under different addresses.
- Parallel provider I/O must remain scoped to its originating movie and session;
  closing/switching movies cannot write a response into the newly opened project.
- v2 projects cannot be edited with installed 0.1.2 after migration; keep a backup
  and show the migration requirement before upgrading user documents.
- Provider placeholders are resolved during staging, not in a no-upload preview.
- Actual RunningHub entitlement and generation remain a distinct live check.

## Out of scope

Workflow result-handoff chains, graph-node merging, freeform DAG editor, automatic model downloads, arbitrary
remote shell, new provider adapters, new cloud infrastructure and LoRA training.
