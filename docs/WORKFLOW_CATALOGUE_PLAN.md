# Implementation Plan: reusable custom workflows and execution targets

Date: 2026-10-14
Status: Approved by user (“go”); implemented in 0.1.6 with acceptance limits below.

## Delivery status

Catalogue/version pins, selected-runtime compilation, typed forms, saved target reuse, API/editor exports and macOS/Linux agent packaging are implemented. Local normal-editor mask compilation and the approved FaceSwap GPU pipeline passed; native import/prepare/ratio/API-export verified. TASK_LOG and GENERATION_ACCEPTANCE record evidence.

The runtime helper requires separately installed Python/Playwright/Chromium. Agent installation preserves sources in its registry without replacing a live canvas. Managed dependency setup reuses reviewed manifests; unknown model/plugin origins still need explicit configuration. Remote live preparation and paid RunningHub execution need an active authorized session. Comprehensive primitive/reroute/bypass/subgraph serializer fixtures and native Finder drag/drop remain unverified; unsupported serializers fail with diagnostics.

## Goal

Import a normal ComfyUI editor workflow once, select a saved execution target, and let the agent prepare and compile it into an executable API graph. Build an editable input form from the real node schemas. Reuse the workflow, input layout, target and RunningHub deployment for later jobs without uploading JSON or recreating connection settings.

The intended creation flow is **Choose saved workflow → Choose execution target → Fill generated inputs → Review → Queue/run**. Import is a catalogue-management action, not a required step for every job. An execution target means a saved Mac/Linux ComfyUI instance, private relay worker, or RunningHub account; a graph node means an operator inside the workflow.

## Existing behavior

- `workflow-core::import` accepts API graphs and explicitly rejects editor graphs. `attach_editor` preserves a supplied pair but does not compile editor JSON.
- Project workflows and global connections already persist; Generate/Jobs have selectors and endpoint queues. These are useful foundations, but bindings remain manual and workflow schemas are not automatically generated from the selected runtime.
- `WorkflowInputs.tsx` lists literal API values for manual binding. Input type, media meaning and allowed values are not yet discovered comprehensively from the selected node registry.
- Per-workflow/account RunningHub deployment IDs and API families already exist. They must remain separate from local graph IDs.
- Managed dependency inventory/install, runtime fingerprinting and session canaries exist. Agent commands do not yet include workflow compilation or workflow installation.
- Linux agents are packaged; equivalent macOS utility publication must be added. The package format is v3 with explicit backed-up upgrades.
- The Base44 Custom Nodes screen inspected on 2026-10-14 starts with Upload/Paste/Parse; its Workflow page shows sample catalogue entries. This observation establishes prototype UI, not real agent conversion or native execution.

## Proposed approach

### Reusable catalogue and immutable project pins

Store a user-level catalogue in native application data, with immutable source versions, original editor/API documents, saved input layouts and deployment mappings. Selecting a workflow copies/pins its version into the open `.mymovie` package, preserving portability independently of the global catalogue.

Existing project workflows remain usable and can be explicitly added to the catalogue. Connections remain global and hold secure credential references; projects never copy account secrets. Remember the last target per workflow, but show offline/unavailable status and never silently switch providers.

Keep source identity separate from compiled API identity. A compilation profile records source hash, API hash, execution target, node-registry hash, frontend/extension fingerprint and compiler version. Changing runtime invalidates readiness for that target, not the original workflow or existing job receipts.

### Schema-driven form and outputs

Inspect the selected ComfyUI instance's actual registry (`/object_info`) and workflow topology. Describe configurable widget/literal inputs with stable node/input identity, type, default, requiredness, bounds, choices and validation. Preserve linked graph inputs as links; do not turn internal latent/model/conditioning connections into file pickers.

Build image/mask/video/audio pickers, multiline text, numeric controls, choices, booleans and supported structured-value editors. Media roles use verified loader capabilities and persisted user labels. Ambiguous string/file fields require one-time role confirmation; unknown custom types receive a specific unsupported/mapping state rather than a guessed control.

Expose normal controls first and all supported editable fields in Advanced. Save grouping, labels and hidden fields as a reusable layout. FaceSwap offers distinct source/face cards when its two loader bindings are identified; arbitrary workflows are not forced into a fixed number of references.

Discover output/sink nodes and preserve output-node identity when collecting results. Let users label and choose outputs where the provider supports it; do not claim every internal tensor is downloadable media. Ratio controls bind real width/height inputs and respect image-edit source dimensions.

### Automatic editor-to-API conversion

Use an agent-controlled compiler sidecar with the selected instance's actual ComfyUI frontend and installed extensions in a temporary headless session. Load the immutable editor source and invoke a version-tested adapter around the frontend's export path; return the API graph, schema/mapping provenance and diagnostics without queueing generation or opening an interactive ComfyUI window.

Do not zip `widgets_values` against registry order: widget persistence and API serialization differ, and custom serializers, primitives, bypassed nodes and subgraphs affect execution. The official exporter is the reference: https://github.com/Comfy-Org/ComfyUI_frontend/blob/main/src/utils/executionUtil.ts and https://github.com/Comfy-Org/ComfyUI_frontend/blob/main/docs/WIDGET_SERIALIZATION.md.

Compiler preparation is an initial acceptance gate: prove adapter access and conversion against the installed frontend versions before broad UI work. Package the helper and reproducible browser/runtime requirements for macOS/Linux. Request compiler capabilities explicitly; do not assume the Rust binary alone contains a browser.

Compilation is isolated from the user's live canvas. Extension loading is limited to the selected trusted instance; generation requests are prohibited during compile. Serializers requiring uploads/other effects must return an actionable requirement or execute only in the later explicit staging operation. Unsupported frontend versions/plugins block with exact diagnostics, never fabricated API JSON.

Import into a target means an idempotent install into its agent workflow registry. Publish the editor file to an explicitly configured, confined ComfyUI user workflow directory when supported; otherwise keep it in the agent registry and expose Download editor/API. Do not overwrite the active canvas or claim that an agent registry entry is a loaded ComfyUI UI workspace.

### Preparation and provider routing

New target preparation: inspect → resolve missing nodes/models → review sources/destinations → install on authorized managed runtime → restart/reinspect if needed → compile → validate → current-session canary → ready. Existing Mac environments stay read-only unless the user enables managed installation. Reuse pinned artifact sources/private S3 references and effective model directories; unresolved origins require user selection once.

Preparation state belongs to workflow-version plus target/session. Repeated jobs reuse ready compiled profiles; a new Colab/Kaggle session rechecks capabilities, dependencies and workflow presence before executing.

RunningHub is a selectable test execution target using a saved authorized hosted workflow/AI App mapping and account. Reuse verified schema/export metadata and input mappings from the catalogue. Verify that the hosted graph/input schema matches; never infer a hosted deployment ID from local node IDs. The known LTX deployment `2110044532631932930` remains its existing explicit mapping. An arbitrary local editor graph cannot be assumed uploadable/publishable through RunningHub's execution API; importing/associating a hosted deployment is a one-time separate action.

Jobs freeze exact typed inputs, media hashes, API graph/profile, output selections and destination. Preserve current same-instance FIFO, cross-instance parallel dispatch and unknown-outcome reconciliation. Draft cloning reuses workflow and target while keeping each job's values independently editable.

## File changes

Paths are relative to the repository; no implementation files are deleted.

| File | Action and concrete responsibility |
| --- | --- |
| `crates/studio-contracts/src/lib.rs` | Modify: catalogue/version references, input/output descriptors, compiled profiles and typed preparation/agent operation DTOs. |
| `crates/workflow-core/src/lib.rs` | Modify: distinguish editor/API imports, preserve originals, expose analysis helpers, validate profiles and exact bindings. |
| `crates/workflow-core/src/schema.rs` | Create: normalize real node descriptors and workflow topology into reusable form/output contracts; explicit unsupported diagnostics. |
| `crates/integration-core/src/lib.rs` | Modify: expose native catalogue persistence alongside settings without storing credentials in workflow records. |
| `crates/integration-core/src/catalogue.rs` | Create: atomic immutable version storage, deduplication, catalogue listing and explicit project-workflow adoption. |
| `crates/project-core/src/lib.rs` | Modify: backed-up v4 upgrade, workflow source/profile projections and legacy receipt preservation. |
| `crates/project-core/migrations/0004_workflow_catalogue.sql` | Create: advance package format for workflow sources/profiles, retaining existing rows. |
| `crates/provider-comfyui/src/lib.rs` | Modify: typed schema/capability discovery, profile validation and output-node metadata. |
| `crates/provider-runninghub/src/lib.rs` | Modify: validate saved deployment/input descriptors against supported provider metadata; preserve explicit family routing. |
| `crates/provider-relay/src/lib.rs` | Modify: typed inspect/install/compile workflow commands and preparation status. |
| `apps/relay/src/main.rs` | Modify: allowlist new workflow operations, node scoping, bounded payloads and durable operation results. |
| `apps/agent/src/main.rs` | Modify: workflow CLI operations and relay dispatch, scoped caches and idempotent install/compile receipts. |
| `apps/agent/src/workflow.rs` | Create: compiler helper invocation, fingerprinted cache, confined editor publication and structured diagnostics. |
| `apps/agent/src/provision.rs` | Modify: connect workflow analysis to existing reviewed dependency/restart/session readiness. |
| `deploy/runner/mymovie_workflow_compiler.py` | Create: pinned headless runtime adapter, source-to-API export, timeout/side-effect controls and capability reporting. |
| `deploy/runner/workflow-compiler-requirements.txt` | Create: reproducible compiler-sidecar dependencies; compiler browser artifacts verified separately. |
| `apps/desktop/src-tauri/src/main.rs` | Modify: register catalogue, analyse, prepare, compile, pin and export commands. |
| `apps/desktop/src-tauri/src/service.rs` | Modify: native orchestration, catalogue access and asynchronous project/session-safe operations. |
| `apps/desktop/src-tauri/src/service/jobs.rs` | Modify: resolve target-specific compiled profiles and gate readiness before frozen job admission. |
| `apps/desktop/src/lib/types.ts` | Modify: mirror new Rust DTOs with parity fixtures. |
| `apps/desktop/src/lib/bridge.ts` | Modify: typed catalogue/preparation/export calls and operation progress. |
| `apps/desktop/src/lib/job-inputs.ts` | Modify: schema-aware exact-value, choice/bounds/media and dimension validation. |
| `apps/desktop/src/App.tsx` | Modify: shared catalogue/target selection and import/preparation orchestration. |
| `apps/desktop/src/features/Library.tsx` | Modify: reusable workflow catalogue, version pins, one-time import and hosted mapping actions. |
| `apps/desktop/src/features/Generate.tsx` | Modify: workflow-first saved selection, remembered execution target and dynamic form/result presentation. |
| `apps/desktop/src/features/Jobs.tsx` | Modify: select/clone existing workflow jobs, per-item target and preparation-aware batch review. |
| `apps/desktop/src/features/Connections.tsx` | Modify: shared target pool with agent/compiler capability and live status. |
| `apps/desktop/src/components/WorkflowInputs.tsx` | Modify: descriptor-driven controls and distinct media roles. |
| `apps/desktop/src/components/WorkflowSetup.tsx` | Modify: initial/repeated-session preparation progress, missing dependencies and export actions. |
| `apps/desktop/src/components/Controls.tsx` | Modify: bounded searchable modal rows, clamped previews and accessible detail editors. |
| `apps/desktop/src/styles/studio.css` | Modify: modal overflow, badge contrast, media cards, ratio margins and consistent rem spacing. |
| `scripts/package-agent.py` | Modify: preserve Linux notebook contract; add macOS utility packaging, compiler manifests/checksums and architecture validation. |
| `.github/workflows/checks.yml` | Modify: compiler/utility checks on supported native platforms. |
| `.github/workflows/release.yml` | Modify: publish matching macOS/Linux utility artifacts and verified helper metadata. |
| `.gitlab-ci.yml` | Modify: equivalent utility artifacts and tag release links. |
| `e2e/workflow-catalogue.e2e.ts` | Create: import-once, select-reuse, target switching and dynamically generated controls. |
| `e2e/generate.e2e.ts` / `e2e/jobs.e2e.ts` / `e2e/runninghub.e2e.ts` | Modify each: media roles, ratio, repeated job reuse, deployment reuse and routing regression coverage. |
| `scripts/tests/test_workflow_compiler.py` | Create: real exporter parity and unsupported/side-effect/timeout cases. |
| `scripts/tests/test_agent_package.py` | Modify: helper manifests and Linux/macOS binary format/architecture checks. |
| `docs/WORKFLOW_SETUP.md` / `docs/CI_RELEASES.md` | Modify each: import/export, dependency preparation and exact utility installation guidance. |
| `README.md` / `README.ru.md` / `README.fr.md` | Modify each: reusable catalogue, targets and generated-form usage. |
| Six compact context documents | Update each to match tested implementation; keep proposed work separate until accepted. |

## Implementation steps

1. **Prove conversion first.** Implement the agent compiler adapter and parity fixture tests for standard editor graphs, the local FaceSwap graph and extension/subgraph behavior. Compare executable output with the selected frontend exporter without submitting a paid job. Stop and revise the plan if installed frontend integration cannot support the required conversion safely.
2. **Persist catalogue and version contracts.** Add DTOs, catalogue store and v4 migration; verify import-once/reopen/portable project pins, backups and unchanged legacy jobs. Preserve editor-only sources in an explicitly unprepared state until compilation succeeds.
3. **Analyse inputs/outputs.** Add schema normalization, runtime inspection and form descriptors. Verify non-media graph links remain connected; choices, numeric constraints, multiple loaders, masks and custom unsupported types produce correct descriptors.
4. **Connect agent preparation.** Add inspect/install/compile operations through CLI/relay and direct local utility invocation. Reuse provisioning and require reinspection after plugin installation. Verify idempotence, changed runtime invalidation and session-loss handling.
5. **Make catalogue and targets the primary UI.** Wire Generate/Jobs/Workflows to shared selections and generated forms. Save layouts and defaults; fix overflowing picker rows, ratio edits, FaceSwap media cards and contrast. Verify keyboard/native file-picker and drag/drop behavior.
6. **Route and freeze jobs.** Select target-specific API profile, exact inputs and outputs before dispatch. Reuse RunningHub mappings. Verify same-node queueing, different-node concurrency and unchanged unknown-job safeguards.
7. **Deliver utilities and evidence.** Extend native agent artifacts, update EN/RU/FR guides, build/install the requested macOS application increment, capture real screenshots and document live tests separately from fixtures. Published release tags remain immutable; use a new version for delivery.

## Verification

- `cargo fmt --all -- --check`; `cargo test --workspace`.
- `npm run typecheck`; `npm test`; `npm run build`; `npm run test:e2e`.
- `python3 -m unittest discover -s scripts/tests`; version parity/build/package checks.
- Compiler fixtures: standard image graph, two-image FaceSwap, video/audio loader contracts, primitive/reroute/bypass/subgraph graphs, dynamic widget serialization and unsupported frontend/plugin diagnostics.
- Native acceptance: import normal editor JSON once; close/reopen app/project; select saved workflow and local target; see automatically generated inputs; replace two FaceSwap images; change mapped dimensions; export editor/API; queue a second job without another JSON upload.
- Local pipeline: compare export with ComfyUI, run weight-free canary and authorized non-explicit FaceSwap inputs; collect actual results with provenance. No unreviewed model/plugin downloads.
- Remote acceptance: use an available authenticated relay worker to prepare/import/compile/run, restart its session and confirm recheck. If unavailable, report remote execution as pending while local/fixture evidence remains explicit.
- RunningHub: validate saved LTX deployment/account reuse without resupplying API JSON. Any live paid test requires secure account configuration and authorized credit use; mock success is not provider acceptance.
- Screen evidence: long-prompt modal, reusable workflow picker, execution-target picker, two-image FaceSwap, ratio controls and preparation status.

## Risks / edge cases

- Arbitrary plugins may require frontend-only/dynamic serialization or unsupported values; runtime fidelity and actionable errors take precedence over promising universal conversion.
- ComfyUI runtime upgrades change schemas and exporter adapters. Offline catalogue browsing/editing works, but first compilation needs a compatible reachable runtime; stale readiness cannot authorize a job.
- Model filenames do not establish trusted download URLs. Missing origins and plugin Python dependencies remain explicit reviewed requirements.
- RunningHub tests only authorized hosted deployments with corresponding schemas; it is not a general remote installation destination.
- Global catalogue updates cannot mutate project pins or previously frozen receipts. Copying projects never transports credentials.
- Browser/compiler sidecars add install size and native platform dependencies; report exact prerequisites and verify artifacts instead of assuming availability.

## Out of scope

Building a replacement ComfyUI graph editor, automatic publication of arbitrary graphs to RunningHub, automatic paid cloud rental, LoRA training, browser-account automation and job-to-job result chains. Workflow preparation and repeated independent jobs are in scope.
