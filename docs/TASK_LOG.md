# Task Log

## 2026-10-14 — Catalogue, compiler and generated forms: 0.1.6

- User approved WORKFLOW_CATALOGUE_PLAN.md with `go`; implementation on main. Import normal editor/API JSON once into immutable catalogue versions; portable v4 project pins, target profiles, layouts and saved target selection.
- Agent CLI/relay inspect/install/compile and desktop Prepare use the selected ComfyUI frontend exporter in an isolated sidecar. API/editor exports, registry-derived controls, separate media roles, advanced fields, constrained ratios and output labels/selections implemented. RunningHub reuses explicit hosted deployment mappings.
- Python/Playwright/Chromium are compiler prerequisites; native binaries do not embed a browser. The agent registry preserves editor sources but does not overwrite a live canvas. Existing reviewed dependency installation remains the managed-worker gate.
- Real compiler: 29-node FaceSwap, 1,894 registry classes; safe local MPS execution completed with two traceable results. Normal core mask editor compiled too. Native app imported the editor, prepared four inputs/one output, changed ratio to 9:16 (64×114), exported a three-node API and saved catalogue entry. Saved ratio restored after native quit/reopen; preparation also passed with persistent compiler dependencies in app support. Screenshot: screenshots/native-workflow-0.1.6.png.
- Verification: 38 Rust tests, 10 frontend tests, 7 mocked browser acceptance tests, 28 Python tests; typecheck, formatting, native ARM64 production build and version parity passed. Loopback fixtures require sandbox elevation. Native 0.1.6 installed in /Applications; release publication tracked in CI_RELEASES.md.
- Native Generate/Jobs executed the saved mask on local ComfyUI with frozen 64×114 inputs; Renders collected the 613-byte PNG and showed durable provenance. Receipt/hash and screenshot: GENERATION_ACCEPTANCE.md, screenshots/native-job-0.1.6.png.
- GitHub/GitLab now package macOS Intel/ARM agents alongside Linux x86_64/ARM64 agents and five desktop targets. Compiler helper/requirements and architecture checks included. Hosted run 38557508498 passed all nine native builds, source checks and automatic publication of v0.1.6 from exact source 950c707849eb5082d6a7651ec57ab9cc3353184d. All 34 public downloads independently passed SHA-256, format/architecture and agent metadata verification; evidence and durable links: CI_RELEASES.md. GitLab execution remains unverified.
- Gaps: active cloud/relay and paid RunningHub acceptance, actual Finder drop test, comprehensive primitive/reroute/bypass/subgraph/custom-serializer fixtures, foreign desktop launch, signing/notarization. No paid cloud resources used. Private media, credentials, drafts and unrelated cpu-canary.png excluded.

## 2026-10-14 — Reusable editor workflows and execution targets: planning

- User requests a reusable workflow/target pool, automatically generated forms from actual node types, and agent editor-to-API conversion for local/remote ComfyUI; RunningHub remains a mapped hosted test target.
- Inspected native importer, bindings, Generate, agent command capabilities and the live Base44 Generate/Custom Nodes/Workflow screens. Native import currently rejects editor JSON; preserved editor pairs are not automatic conversion.
- Official frontend exporter uses custom widget serializers and virtual/subgraph handling; registry/widget-position guessing cannot establish conversion fidelity.
- Implementation-ready proposal: docs/WORKFLOW_CATALOGUE_PLAN.md. Includes native catalogue/project pins, target fingerprints, compiler proof first, generated typed forms, preparation/session checks, repeated jobs and macOS/Linux utility artifacts.
- This entry records the planning state; user subsequently approved it. Implementation and verification are recorded above.

## 2026-10-14 — Generate, compatibility and verified node setup

- Implemented the approved Generate plan on main: standalone image/video modes, exact ordered image/video/audio slots, shared Jobs review and saved batches. Same endpoints retain FIFO; distinct endpoints retain parallel dispatch.
- Added explicit workflow flags: Unspecified, Universal, Apple Silicon, CUDA, ROCm and CPU. Custom modal persists hardware/dependency metadata; live hardware checks happen before media upload.
- Added reviewed model/LoRA/plugin/wheel sources, SHA256, sizes, licenses, architecture and effective ComfyUI destinations. Actual inventory, managed atomic installation, restart/reinventory and current-session canary gate readiness; direct Mac connections stay read-only.
- Added runtime helper/profile builder, deterministic plugin archive, weight-free mask and tiny u2netp fixtures, updated agent packaging and Colab/Kaggle startup. Published 0.1.5 lacks these new files; use current CI artifacts pending a separate release.
- Format v3 preserves explicit standalone/media context, requires backup/upgrade acknowledgement and rejects older readers. Media mismatch leaves imported material available in Library. Standalone render labels now use workflow names.
- Real local native Rust pipeline completed the approved safe Flux2 FaceSwap (two results) and core mask (one result), collecting hashes/receipts in ignored disposable documents. Original editor graph and existing Mac weights/plugins unchanged. Evidence: docs/GENERATION_ACCEPTANCE.md.
- Native ARM64 release build opened the completed mask project and displayed its Universal flag/custom picker; screenshots: docs/screenshots/workflow-compatibility.png and generate.png. No /Applications replacement or new release tag in this scope.
- Validation: `cargo test --workspace --locked --offline` (34 Rust tests), `npm test` (9 unit tests), `npm run test:e2e` (6 mocked browser tests) and Python unittest discovery (25 tests) passed. Typecheck, ARM64 native production build, cargo formatting, deterministic notebook regeneration, release-version parity (0.1.5) and diff checks passed. Loopback fixtures required sandbox elevation; no live external provider test was substituted for them.
- Updated English/Russian/French README, compact memory and portable setup/connection instructions. Private media/settings/workflows, ignored drafts, build output and unrelated cpu-canary.png excluded from staging.
- Live managed cloud installation, learned removal, local/cloud parallel run, two-GPU Kaggle and paid RunningHub acceptance remain pending an active authenticated session. No paid resources used.

## 2026-10-14 — Generate and node initialization planning

- Read compact context and planning skill; inspected existing Jobs, media bindings, providers, provisioning, notebooks and Base44 Generate UI.
- Proposed docs/GENERATE_IMPLEMENTATION_PLAN.md: standalone typed media inputs, shared Jobs UI/queues, format v3 backup migration, actual model/plugin readiness and verified initialization.
- User chose Colab first. Plan includes authenticated relay URL instructions and explicit polling for temporary Cloudflare tunnels (no SSE support).
- Local ComfyUI MPS registry advertises all FaceSwap workflow nodes and referenced models; no model hashes or live execution verified. Actual API export still required.
- User supplied a suitable replacement portrait and face reference; personal media remain outside Git and acceptance fixtures.
- At planning time only documentation changed. Scope was subsequently approved by user `go`; implementation and acceptance are recorded above.

## 2026-10-14 — Published releases and expanded native platforms

- User requested visible release downloads, then Windows and Linux x86_64/ARM64 binaries.
- Published v0.1.3 prerelease with 12 verified assets from successful hosted run 38474310778; tag points to exact build commit ab71e49. Both macOS DMGs, Linux x86_64 DEB/AppImage, agent, notebooks, guide and checksums are public. Artifact ZIP digests and uploaded asset digests verified.
- Future version tags now stage complete assets then publish prereleases; reruns refuse to replace published binaries.
- Expanded GitHub/GitLab native matrix to Windows x64 MSI/NSIS and Linux ARM64 DEB/AppImage/agent. Added Windows native credential backend, ARM ELF validation/distinct agent metadata/checksums and ARM Node bootstrap. GitLab Windows requires a prepared shell runner.
- v0.1.4 hosted run 38511851739 passed source checks, both native agent smoke tests, both macOS builds and both Linux desktop builds. Windows failed because npm.ps1 dropped forwarded CLI options; invoke the Tauri Node CLI directly on Windows in GitHub/GitLab. Failed tag preserved unchanged.
- Version 0.1.5 at c595573 / run 38512704998 passed all five desktop builds and both native agent smoke tests. Source acceptance: 30 Rust, 5 frontend, 4 mocked browser and 17 Python tests. Publication failed because an upload glob included empty bundle directories; select only regular files. Local regression and all 18 Python tests pass. Fixed future uploads in commit 0cac04e; tag preserved. No foreign-platform desktop runtime launch or live cloud GPU acceptance claimed.
- Published [v0.1.5](https://github.com/gubnota/auteur/releases/tag/v0.1.5) with 19 assets from exact source c5955734dea43963e98ade98e0fca457773b4324. Recovered publication from all seven digest-verified CI archives after the uploader failure, retaining matching draft assets and adding only missing files. Hosted run 38512704998 remains failed at publication; all native builds/source checks passed.
- Independently downloaded all 19 public assets anonymously; verified asset/global SHA-256, installer/container formats, Linux desktop/agent architectures, DEB version/architecture and agent archive/bootstrap metadata against the tag. Release screenshot: docs/screenshots/release-0.1.5.jpg.
- Updated EN/RU/FR download documentation. Installed /Applications/MyMovie Studio.app remains 0.1.3; GitLab execution, distribution signing/notarization and live cloud GPU acceptance remain pending.

## 2026-10-14 — Jobs workspace and RunPod agent delivery, 0.1.3

- User approved Jobs plan with `go`: independent jobs queue on the same ComfyUI instance and run concurrently across different instances. Later steering makes private RunPod ComfyUI primary; RunningHub remains for workflow tests.
- Added saved ordered batch drafts, exact typed inputs, per-item literal bindings/media sources/deployments, no-upload native review, durable run history and pause/resume/cancel controls. Existing workflow/keyframe entry points use Jobs.
- SQLite v2 migration backs up v1 database and manifest before upgrading, requires native acknowledgement and preserves prior history. Reopening unsent work pauses it; unknown submissions hold their lane pending reconciliation.
- Native dispatch reserves attempts durably, performs staging/submission/polling/collection outside the global mutex and rejects late writes after project changes. Tests prove independent delayed endpoints overlap while unrelated progress continues.
- Installed ARM64 release 0.1.3 at /Applications/MyMovie Studio.app; strict local ad-hoc signature and version checks passed. Previous 0.1.2 preserved in /private/tmp/MyMovie Studio-0.1.2-backup.app.
- Native temporary Jobs Verification.mymovie: imported CPU graph, bound width, duplicated item, reviewed and ran two jobs on localhost:8188. Both completed in endpoint order, collected separate results and displayed run/item provenance. Widths 64/80 survived close/reopen; immutable original remained 64. Native screenshot: docs/screenshots/jobs-workspace.png.
- Private runner CPU acceptance: temporary loopback relay + native agent executed the same weight-free graph through outbound claims, returned a verified 392-byte PNG and matching durable receipt; unauthenticated access returned 401. Evidence: temporary auteur-private-runner-7x17m_3c/acceptance.json. Local HTTP acceptance does not verify cloud HTTPS/GPU deployment.
- Validation: 30 Rust workspace tests plus doc tests, 5 frontend unit tests, 4 mocked browser acceptance tests and 16 Python tests passed. Typecheck/production native build, release version parity, CI YAML parse, formatting and diff checks passed.
- GitHub/GitLab agent job now publishes comfyui-agent-linux-x86_64 (GitLab adds branch suffix), checks actual ELF x86_64 architecture and bundles RunPod startup instructions/checksums. Branch artifacts and version-tag publication remain configured; latest hosted execution tracked below.
- Hosted GitHub run 38474310778 at ab71e49: source checks and linux-agent succeeded; artifact 11853018891 (comfyui-agent-linux-x86_64, 2,440,831 bytes) published. Actual Ubuntu binary help/version smoke test and ELF packaging checks passed. Desktop matrix still running at verification time; no tag created. Artifact links/digest: docs/CI_RELEASES.md.
- EN/RU/FR READMEs and compact contracts/module maps updated. Drafts, personal movies/settings/keys, build output and root cpu-canary.png excluded. No paid provider jobs, rented pods or cloud deployments performed.
- Live RunningHub/RunPod/relay/S3, desktop SSE, automatic LoRA sync, workflow chains, notarization and full image/editor exchange remain open. GitLab requires a project mirror and eligible macOS runner; no GitLab resources created.

## 2026-10-13 — MyMovie Studio planning

- Read supplied build request, invoked planning skill and initialized missing six compact context docs before repository inspection.
- Confirmed empty application repo, dual licenses/origin and local ARM64 toolchain; targeted reference audits only.
- Verified Fenki palette, Homer native lifecycle/package patterns, Unipuni Dock progress and browser session isolation example.
- Consulted primary Tauri/ComfyUI/RunningHub/RunPod/Playwright documentation; no third-party workflow ownership or executable export inferred.
- User confirmed ordered scene/shot storyboard and waiting for Base44 exports; RunningHub current provider with CPU-only ComfyUI smoke target options.
- API credential supplied in chat was not used or stored; advised rotation and future Keychain entry.
- Read-only health probes failed at 127.0.0.1:8188 and debian.orb.local:8188; OrbStack/Docker commands available.
- Created docs/IMPLEMENTATION_PLAN.md and docs/DESIGN_HANDOFF.md; updated compact memory and proposed ADRs.
- Pending: explicit revised-plan approval and verified provider deployment/schema for live acceptance.
- Cloud acceptance inputs: immutable RunPod image/template and relay/S3 hosting.
- Later inputs: browser login/automation choice and LoRA trainer.
- Source/configuration/dependencies/reference repositories: unchanged.
- Builds/tests/provider jobs/cloud deployment: not run; no application implementation yet.
- Commits/push: none during planning.

## 2026-10-13 — Supplied design and eleven-item revision

- User supplied drafts/index.html and expanded editing/navigation/provider scope.
- Read compact context first; audited relevant app source in the bundled export.
- Found in-memory/timer saving, inert project/open/import actions, shared-board
  navigation, stale shot membership on cross-lane move and reversed queue sizing.
- Existing picker/edit callbacks are reference behavior only; not runtime-tested.
- Browser security refused file:// preview; respected restriction and continued
  static inspection without serving/reopening through another route.
- Updated plan to include multi-account batches and mandatory private runner/S3
  implementation; local Docker acceptance precedes chosen RunPod cloud testing.
- All eleven UI requirements mapped with concrete file changes and verification.
- Export satisfies design prerequisite; no more Base44 screens requested.
- Documentation only changed; draft/source/config/dependencies remain unchanged.
- No tests/builds/jobs, screenshots, commits or pushes performed during planning.

## 2026-10-13 — Docker-first clarification

- User confirmed Docker-first validation and offered cloud/CPU-pod help later.
- Verified active Docker context is orbstack; no engine mutation or container run.
- Official OrbStack docs confirm headless use: engine required, GUI optional.
- Checked drafts/ and current task attachment folder: only index.html and the
  original Pasted text.txt are accessible; workflow attachment not found.
- Recorded Docker-first choice; no rental, build/job or implementation begun.
- Full plan approval remains pending; workflow attachment/path still needed.

## 2026-10-13 — Supplied LTX/MINIMAX and RunningHub page

- Read the six compact context docs and planning skill; no implementation approval.
- Inspected three user-named Downloads files as data; no embedded commands executed.
- LTX: 46 API nodes, matching all editor node IDs/types; editor has 102 nodes.
- MINIMAX: 17 API nodes, nested serialized multitrack JSON and reference paths.
- Neither API graph has a missing referenced node; output counts/types unverified.
- Recorded positive/negative and duration/ratio/seed candidates and disconnected
  MINIMAX SaveVideo without claiming executable validation.
- Web fetch could not read supplied RunningHub page; HTTPS browser inspection
  verified distinct AI App 2021554630848684033 and v2 run/query examples.
- Public page omits app input mappings; example/table types disagree. No login,
  upload, submission, model download or billing action performed.
- Added WORKFLOW_AUDIT.md; corrected stale missing-attachment notes and plan.
- Original graphs/draft unchanged; no fixtures/source/config/dependencies created.
- CPU Docker smoke will remain weight-free; full video graphs require compatible
  model/custom-node/GPU validation. No RunPod rental required for local tests.

## 2026-10-13 implementation approval
- User approved revised Phases 0–3 with `go`.
- Shared bridge/DTO foundation created; independent bounded implementation begins.
- Live cloud acceptance remains pending deployment choices; no paid resources authorized.

## 2026-10-13 — Native studio implementation and portable media

- Implemented approved local studio foundation: Tauri/React UI, Rust package persistence, immutable workflow imports, typed connections and durable jobs.
- Added original SVG symbol, Fenki layout, modal pickers, editable movie/episode/scene/frame/cast controls and native progress.
- Added character reference picker and file-drop routing for Library/characters/board targets; scene cast inheritance and explicit characterReference1..4 workflow bindings.
- Added default copied imports and explicit linked imports with external sourcePath.
- Library Check files verifies availability/content; exact-content Relink preserves identity.
- Collect for export validates all linked originals before copying into the current package and clearing external links; it is not a separate export-copy wizard.
- Serialized media mutations and flushed pending edits before imports to prevent stale-state replacement.
- Verified native picker import of a linked character reference and collection into a temporary movie; no personal movie modified.
- Native screenshots saved under docs/screenshots/; README provided in English, Russian and French.
- Rust workspace: 11 unit tests passed, no failures; doc tests passed.
- Frontend typecheck and 2 coordinate tests passed; Vite and final ARM64 native debug application build passed (43.57 MiB .app).
- Local OrbStack weight-free ComfyUI CPU canary passed health/submission/history/392-byte PNG collection.
- Actual Finder drag automation did not deliver a verifiable file-drop event; gesture acceptance remains open despite implemented routing.
- Live RunningHub, GPU video graphs, private relay/S3/RunPod roundtrip, signing/notarization, DMG and CI remain unverified/open.
- Browser profiles, remote LoRA training, full derivatives and Homer interoperability remain later milestones.
- No credentials from conversation used, no paid generation or cloud rental performed. Draft exports unchanged and ignored.
- Implementation commit: 918140a; delivery branch: codex/mymovie-studio.
- Final format/diff checks passed; generated schemas, drafts, personal packages and root cpu-canary.png excluded from commits.
- Bundled font license texts included; historical scaffolding script removed from runtime source.

## 2026-10-13 — ComfyUI/image/Linux extension planning

- User requests continued work on main, desktop macOS/Linux x86_64 CI/CD, ComfyUI Desktop exchange, image workflows and multiple RunningHub accounts.
- main matches origin/main at 9e89e90; untracked cpu-canary.png left untouched.
- Read-only discovery: ComfyUI 0.3.76 on localhost:8188 is CPU; core image nodes exist, but checkpoint registry is empty. Existing local checkpoint presence verified without altering weights.
- Extension plan: docs/IMPLEMENTATION_PLAN_COMFY_IMAGES_CI.md; scope subsequently approved by user "давай"; implementation continues on main.
- Only planning documentation changed; no source/configuration edits or jobs submitted.

- Desktop discovery: localhost:8189 reports ComfyUI 0.39.2/MPS and exposes the existing test checkpoint; no weighted job submitted.
- User added Colab artifact deployment and Kaggle ComfyUI support. Plan now includes both notebooks, shared verified Linux agent bootstrap, secret readers, hosting presets and session-loss acceptance.
- Live notebook deployment awaits a running eligible notebook and a reachable authenticated relay. Colab free-worker restrictions verified against Google FAQ.

## 2026-10-14 — Saved-document startup hotfix, 0.1.1

- Reproduced the supplied macOS abort with 0.1.0 and a previously saved temporary movie.
- Root cause: Finder Opened arrives before setup; state() panics because Studio has not been registered.
- Created the shared document inbox before Builder and injected it into Studio; lifecycle callbacks deduplicate paths without reading uninitialized managed state. No project format changes.
- Added a regression test for pre-setup delivery, shared inbox identity and Ready deduplication.
- Incremented Rust/npm/Tauri versions to 0.1.1; ARM64 debug and release app builds passed.
- Replaced /Applications/MyMovie Studio.app with the release build; local ad-hoc codesign verification passed. Previous 0.1.0 app preserved at /private/tmp/MyMovie Studio-0.1.0-backup.app.
- Debug acceptance: cold document launch, recent-project reopening and warm Finder opening passed. Installed release acceptance: Finder opened Import Verification.mymovie and displayed its saved episode/scene/frame without abort; installed binary path/version verified.
- Screenshot: docs/screenshots/reopened-project-0.1.1.png (installed release). EN/RU/FR README release notes updated.
- Current working-tree checks: Rust workspace 17 tests passed; frontend 2 tests passed; notebook bootstrap 10 tests passed; production TypeScript/Vite build passed. Existing relay test has an unused-result warning, separate from this hotfix.
- Approved ComfyUI/images/notebook/CI extension remains in progress in the working tree; hotfix staged separately. No live RunningHub/Colab/Kaggle or weighted GPU job acceptance claimed. Drafts and root cpu-canary.png untouched.
- Isolated staged hotfix snapshot compiled successfully; cold-launch regression passed independently of the unfinished integration changes.

## 2026-10-14 — RunningHub job entry, CI artifacts and notebooks, 0.1.2

- Added visible Workflows → Target keyframe → Create generation job, per-workflow/account deployment/family mapping and actionable submission readiness. Definitive provider refusals fail safely; unknown attempts have explicit task-history reconciliation. Frozen destinations preserve routing after settings changes.
- Hardened RunningHub Workflow/v2 AI App payloads, typed values, uploads, status/results parsing and official .ai/.cn endpoint validation. No chat credentials used and no paid task submitted.
- User supplied https://www.runninghub.ai/workflow/2110044532631932930: Workflow family/ID inferred from the supplied URL; public page did not expose enough graph details to identify the matching LTX/MINIMAX export. Matching file and live account acceptance remain pending.
- Added compatible workflow/editor/deployment contracts and image preset fixtures. Editor-pair/export controls, preset UI and weighted Desktop exchange are still unfinished; backend helpers/fixtures alone do not establish user-facing completion.
- Added node-scoped relay leases/report/health and lost-session handling, agent version/heartbeat support, verified prebuilt Linux client bootstrap and generated Colab/Kaggle notebooks. Two GPU mode starts independent ComfyUI/agent processes on separate device/port/node identities; live notebooks need an authenticated relay/runtime.
- Added GitLab branch/MR/tag checks, macOS ARM/Intel DMGs, Linux desktop/client artifacts, version parity, checksum publication and immutable package/Release links. GitHub matrix and draft tag releases included. GitLab project/macOS runner, hosted pipeline runs and notarization remain pending; no tag or hosted resources created.
- Version 0.1.2 production ARM64 .app built, ad-hoc signed and installed at /Applications/MyMovie Studio.app; strict signature/version checks passed. Previous 0.1.1 app preserved at /private/tmp/MyMovie Studio-0.1.1-backup.app.
- Installed app reopened a saved temporary movie, imported a 7-node API graph, selected its keyframe and opened the new submission review. Native screenshot: docs/screenshots/workflow-job-0.1.2.png. Personal movies untouched; sample screenshot is not a real RunningHub generation.
- Validation: Rust workspace 23 tests plus doc tests passed; frontend typecheck and 2 unit tests passed; 2 mocked end-to-end RunningHub tests passed; Python 14 tests passed. Release-version parity, CI YAML parsing, shell syntax and diff checks passed. Mocked job-review screenshot saved separately.
- EN/RU/FR README updated. Drafts, private settings/keys, root cpu-canary.png and generated build output excluded from staging. Full ComfyUI/image milestone and real cloud/GPU/S3 roundtrip remain open.

## 2026-10-14 — Confirmed LTX hosted mapping

- User identified Workflow 2110044532631932930 as the supplied LTX API JSON.
- Saved that Workflow-family deployment for the selected account through the installed 0.1.2 app; added string bindings for positivePrompt/121.text, negativePrompt/110.text and image/167.image.
- Read-only persistence check verified the mapping and three bindings; no generation jobs were created. Review opens with the hosted destination, but the selected frame needs an image before submission. The native command rejects a missing frame image; the current review does not disable submit for that case.
- Native configuration screenshot: ignored artifacts/acceptance/ltx-runninghub-ready.png. Personal movie data and account settings remain outside Git. No provider acceptance or paid generation claimed.
