# Task Log

## 2026-10-17 — User-supplied token connection check

- Supplied value matches the bundled predefined desktop token, not the existing local helper token. Read-only authenticated node checks returned 401 for the predefined token and 200 for the existing helper desktop token, with agent and ComfyUI connected. Ports 8191 and 8789 are listening; installed Studio points Local Mac agent at 8789 and still labels its credential predefined.
- No credential or server changes made. Explicit approval to save the helper's existing private desktop token remains required by the earlier automatic approval review. No rebuild needed for that operational repair; installed version remains 0.1.24.

## 2026-10-17 — Token eye and Copy controls, 0.1.24

- Added shared masked SecretField with individual Show/Hide and Copy controls to connection and Node access token forms. Empty fields disable controls; clipboard failure is reported without token values. Closing/reopening connection settings resets masking.
- Saved public-default markers now populate the exact bundled desktop token when edited. Private connection replacement fields stay empty and no new native vault read occurs. Copy/reveal does not save credentials. Increased synchronized workspace/package/notebook versions to 0.1.24.
- Latest live diagnostic: helper relay on 8789 returns 200 with the existing helper token and reports connected/ComfyUI connected; predefined defaults return 401. Studio now targets 8789 but still uses its predefined token. Credential synchronization remains awaiting the approval requested earlier.
- Validation passed: TypeScript, three token unit tests, three native credential/notebook tests, five targeted browser scenarios, six release checks, source-version parity and diff checks. Production frontend/native ARM64 build passed.
- Ad-hoc signed and replaced /Applications/MyMovie Studio.app with 0.1.24; strict signature and all bundle file hashes verified. Native acceptance confirmed predefined-token reveal/hide, successful Copy, and masking after reopening; connection form left open masked without saving. Previous app retained at /private/tmp/mymovie-before-0.1.24-vjelurad/MyMovie Studio.app. Unrelated App.tsx and prior credential/hosting changes retained. No private credential synchronization, generation, model download, tag or publication.

## 2026-10-17 — Local agent connection failure diagnosed

- Installed 0.1.23 Local Mac agent points at ComfyUI :8191 rather than relay :8789. Node ID local-mps-0 is correct. Authenticated node GET returns 404 on 8191, 401 on 8789 with bundled defaults, and 200 with the existing local supervisor desktop token; ComfyUI reports connected.
- Proposed operational repair: back up app.sqlite, use relay URL http://127.0.0.1:8789 and securely store the existing local server token for this connection. Automatic approval review rejected the write because explicit authorization to store the private server credential is required. No settings or credentials changed; Studio reopened. Awaiting user approval. No source change or rebuild needed; token values were not printed.

## 2026-10-17 — Automatic agent credentials and version 0.1.23

- User approved automatically applying predefined tokens to agent connections, preserving saved credentials, increasing every delivered rebuild version, and replacing the installed app.
- All agent presets and missing-credential edit forms inherit the active Node access desktop token. Empty relay saves select that token. Native relay records without a credential reference resolve the bundled default without Keychain; explicit saved credentials and other providers retain their existing behavior. The form offers an explicit predefined-token replacement and connection cards label defaults accurately.
- Synchronized 0.1.23 across Rust/npm/Tauri versions, lockfiles and generated Colab/Kaggle notebooks. Persistent release rule added to PROJECT_CONTEXT.
- Verification passed: three native credential/notebook tests, three token unit tests, four browser scenarios (including all five non-notebook presets, existing credentials, active private-pair inheritance and both notebook kinds), six release checks, source-version parity, Rust formatting and diff checks. Production TypeScript/Vite/native ARM64 build passed. Browser checks used the installed Chromium 1243 through a temporary config because the current Playwright browser download was absent.
- Signed and replaced /Applications/MyMovie Studio.app with 0.1.23; verified strict signature and hashes for every bundled file, then reopened it. Native Local Mac agent edit showed its predefined token already populated; canceled without modifying saved settings. Existing endpoint remains the user's 8191 value; relay authentication against the separately configured private local runtime was not retested in this change.
- Previous installed app retained at /private/tmp/mymovie-before-0.1.23-q7n0va3a/MyMovie Studio.app. Existing unrelated App.tsx and prior integration-core edits preserved. No token values printed, model downloads, generation, release tags or publication.

## 2026-10-17 — Requested desktop rebuild and Applications replacement

- Rebuilt the current working tree as macOS ARM64 0.1.22; TypeScript, production frontend, native release build and version parity passed. Existing source edits retained.
- Ad-hoc signed the bundle, quit the installed app, and replaced /Applications/MyMovie Studio.app. Verified its strict signature and byte equality for every built bundle file; reopened successfully in the native UI.
- Previous installed app retained at /private/tmp/mymovie-before-rebuild-smm99i8e/MyMovie Studio.app. No settings changes, generation, model downloads, tags or publication performed in this rebuild.

## 2026-10-17 — Private relay hosting validation

- User approved fixing the Local Mac connection save failure, testing persistence, and rebuilding/replacing the installed app with a backup. Native settings validation accepted only notebook hosting despite the UI exposing seven private relay presets.
- Accept local-mac/linux/orbstack/runpod/ssh/colab/kaggle for relay connections; use a hosting-neutral error. Existing no-hosting records, HTTPS/loopback restrictions and credential handling remain unchanged.
- Regression first reproduced the exact notebook-hosting error. Added save/reopen coverage for all seven presets, rejection without replacing saved connections, and compatibility for connections without hosting. All five integration-core tests, formatting/diff checks, frontend typecheck/production bundle and native release build passed.
- Rebuilt and installed local 0.1.22 at /Applications/MyMovie Studio.app; strict ad-hoc signature and executable hash match verified. Previous app preserved at /private/tmp/MyMovie Studio-0.1.22-before-relay-hosting-fix-20261017.app. Native UI successfully saved Local Mac agent (relay 127.0.0.1:8789, node local-mps-0). No release/tag/push.
- User explicitly authorized using their predefined desktop token. Imported the existing local token through the native credential field and saved it in the system vault without printing its value. Restarted the stopped local supervisor using the existing token pair; native authenticated connection check passed, ComfyUI connected, initialization/console capabilities present, and hardware monitoring active. No model download or generation submitted.
- Existing unrelated App.tsx edits retained; no secret values printed, model downloads or generation submitted.

## 2026-10-16 — HF credentials and workflow installation, 0.1.21

- Implemented approved HF_WORKFLOW_SETUP_PLAN on main. Settings > Model downloads explicitly saves/replaces/removes masked HF_TOKEN in the vault; startup/status never reads the token. Matching private relay/agent handoff is bounded, memory-only, ten-minute expiry, one-use and lease/node-bound. Cancellation/dedup/refusal clean up pending values; jobs/events/packages exclude secrets. Node-local HF credentials remain supported; scripts do not inherit desktop HF secrets.
- Install on instance opens Dependencies and the existing durable agent review/installation flow. Publish graph only is explicitly separate. Owned workflows expose Inputs/Outputs/Dependencies/Guide; immutable examples display their configuration read-only with Create editable copy. Built-ins no longer appear a second time in the ordinary workflow list.
- Validation: all 80 Rust workspace tests, 63 Python tests and 28 frontend tests passed. Twenty targeted browser scenarios covered global mode, examples, dependency editing, form/output persistence and token actions; the stale graph-publish selector was fixed and all four catalogue cases passed on rerun. Typecheck, production/native ARM64 build, source-version parity and diff checks passed. Rust network fixtures needed localhost-listener permission; the permitted rerun passed. No real HF credential, model download or cloud generation was used.
- Rebuilt, ad-hoc signed and installed /Applications/MyMovie Studio.app 0.1.21. Strict signature/version verified; native global-mode launch, immutable dependency view and masked Model downloads form verified without opening a Movie or prompting Keychain. Previous app preserved at /private/tmp/MyMovie Studio-0.1.20-before-0.1.21.app. Browser-fixture screenshots: screenshots/model-download-settings-0.1.21.png and screenshots/workflow-installation-0.1.21.png. EN/RU/FR READMEs and compact architecture/contracts updated.
- Live gated-model installation requires upstream account access and matching 0.1.21 agent/relay on the target. No release/tag/push performed. Existing unrelated App.tsx edits were retained and excluded from these commits.

## 2026-10-15 — Local macOS and Linux agent build commands

- README now documents an Apple Silicon `.app`/`.dmg` build and a Docker/OrbStack `cross` build for the Linux x86_64 agent, including target prerequisites, output locations, and the distinction between a bare binary and the full checksummed CI archive.
- Verified the Tauri CLI target argument forwarding with its help output. Cross compilation was documented but not run in this environment.

## 2026-10-15 — Bun workspace scripts

- Root `dev`, `build`, and `typecheck` target `@mymovie/desktop` with Bun's `--filter` syntax. The previous `npm run … -w` form was interpreted as recursive watch arguments, causing unbounded root-script recursion.
- Validation: plain `bun run build` completes the desktop TypeScript check and Vite production bundle successfully.

## 2026-10-15 — Global Studio and agent setup, 0.1.20

- Implemented the approved GLOBAL_STUDIO_PLAN: global workflows, instances, generation, jobs and shared media work without a Movie. Movie migration preserves original documents and frozen history; movies reference shared resources. Global search, queue selection/status actions, shared render/library trash, instance monitoring and full-window interactive agent terminal are available.
- Added portable compressed FLUX.3 T2I and two-reference I2I families with T4, RTX and Apple Silicon variants, original reference illustrations and pinned dependency recipes. Examples remain immutable; editable copies expose named input/output bindings and ordered initialization scripts.
- Dependency source buttons open through the native bridge. Setup edits source URL, pinned verification and relative model/plugin destination, displaying the resolved path. Direct ComfyUI preparation has staged visible progress; agent installation retains logs, progress, cancellation and reconnect in Activity. A local-agent guide is available in the setup dialog and LOCAL_COMFYUI_TEST.md.
- Public test defaults and passive monitoring no longer access Keychain; private credentials unlock through an explicit connection check. Free RAM/VRAM changes no longer invalidate an otherwise initialized workflow.
- Validation: 75 Rust workspace, 28 frontend and 63 Python tests passed. Browser acceptance covered 34 scenarios; a stale direct-preparation label assertion was corrected and all 15 workflow scenarios passed on rerun. Local isolated MPS ComfyUI on 8193 passed private PTY, metrics, initialization twice and weight-free generation with authenticated PNG collection (393 bytes, SHA256 66c0fa98c650b8e4874c17e727df8cc0fedf3469171d061dab53e99b07927a39). User instances on 8188/8191 were preserved.
- EN/RU/FR documentation, compact context and screenshots updated. Rebuilt, ad-hoc signed and installed /Applications/MyMovie Studio.app 0.1.20; strict signature verified. Native relaunch confirmed global mode, source buttons and direct preparation/local-agent guidance, without a Keychain prompt. Temporary verification supervisor stopped; user ComfyUI processes preserved. Live FLUX model execution on cloud GPUs, native SSH transport, Finder Quick Look and Telegram delivery remain pending; no paid generation, release/tag or publication performed.

## 2026-10-15 — CPU notebooks, workflow trash cleanup and full-window console

- Approved continuation on main, including requested CPU instances. Colab/Kaggle DEVICE=auto chooses available CUDA workers or one CPU worker; explicit cpu/cuda modes supported. CPU runs ComfyUI with --cpu, skips NVIDIA checks and uses a cpu0 node identity. Runtime cache markers include device mode. Kaggle dual GPUs remain independent workers, without pooled memory.
- Setup restores missing helpers from bundled reviewed source, preventing skipped bootstrap cells from producing gpu_indices/NotebookRunner NameErrors. Both generated notebooks keep predefined keys, reviewed dependency ownership in Studio and manual Stop. Existing saved notebook copies must be reimported.
- Connections accepts and labels CPU notebook nodes; workflow Trash has Clear trash, preserving immutable graph files, revisions and frozen job history. The remote console fills the app window and keeps controls usable on smaller screens.
- Validation: 62 Python, 27 frontend and 5 project-core tests passed. Nine workflow browser scenarios and two CPU/GPU connection scenarios passed with mocked bridge/network; no generation. Production/native Apple Silicon build and source-version parity passed at 0.1.18. Console screenshot: screenshots/remote-console-fullscreen.png (fixture). Rebuilt, ad-hoc signed and installed /Applications/MyMovie Studio.app 0.1.18; strict signature and binary hashes verified. Previous app: /private/tmp/auteur-app-backup.dZYQoa/MyMovie Studio.app. Relaunch is needed to load the updated app. No tag or publication created. EN/RU/FR and compact context updated. Live CPU Colab/Kaggle installation/generation remains unverified.

## 2026-10-15 — Background initialization, recipes, console and workflow Trash, 0.1.18

- Approved continuation on main. Initialization is an agent-owned durable operation with detailed stage/log/download progress, cancellation, reconnect and duplicate prevention. The global Activity panel remains available across movie screens and Welcome. Independent nodes can initialize concurrently; workers sharing a runtime serialize mutations and reuse verified dependencies. Changed dependency plans require a fresh review.
- Workflow Setup now edits ordered portable script steps with timeout, relative working directory and once-per-recipe/runtime or agent-session receipts. Custom scripts and the interactive PTY console require explicit agent opt-in and private agent/desktop tokens. Console execution has bounded output, reconnect, close and process cleanup; predefined shared test keys continue to support typed setup only.
- Workflow deletion moves the movie copy to recoverable Trash, hides it from active workflow/job selectors, and preserves inputs, guide, recipe, results and history. Restore returns the same copy. Removing a workflow does not cancel an active initialization; Activity owns cancellation.
- Validation: 63 Rust workspace, 58 Python and 27 frontend unit tests passed; all 23 mocked browser scenarios passed. Agent/relay tests were rerun after warning cleanup. Typecheck, production/native Apple Silicon build, Rust formatting, source-version parity and diff checks passed. Browser coverage includes background status/cancel, failed operations, workflow restore and ordered recipe editing; local process/PTY tests exercise script/terminal cleanup. No generation or live remote dependency installation performed.
- Built, ad-hoc signed and installed /Applications/MyMovie Studio.app 0.1.18; strict signature/version verified. Native acceptance used only /private/tmp/Studio 0.1.16 Verification.mymovie: workflow moved to Trash, disappeared from active list, restored with its guide/settings, Setup recipe controls and global Activity opened. Screenshot: screenshots/workflow-trash-native-0.1.18.png. Mocked progress/recipe screenshots are separately recorded.
- Previous app preserved at /private/tmp/MyMovie Studio-0.1.17-before-0.1.18.app. EN/RU/FR documentation and compact project memory updated; detailed operating guide: NODE_ACTIVITY.md. New remote features require matching 0.1.18 agent/relay and current notebook supervisor; last published release remains v0.1.15. No tag/push/publication in this pass. Live Colab/Kaggle setup, cancellation/reconnect and GPU roundtrip remain unverified.

## 2026-10-15 — Tag-only CI, guided initialization and queue cleanup, 0.1.17

- Approved continuation on main. GitHub checks are reusable only and run through the tag-triggered release; GitLab accepts vX.Y.Z tags only. Source/package/native versions agree at 0.1.17. No tag or release published in this pass.
- Workflow modal now selects the exact ComfyUI/agent instance for install, preparation and setup. Target/variant/tab changes are locked during operations; selection changes discard reviews. Destination and stage-specific errors distinguish an unreachable instance, timeout and Userdata HTTP refusal. The earlier localhost failure was not independently reproduced.
- Initialize reviews dependencies; Install & prepare then applies the reviewed plan, restarts only a managed idle runtime if required, prepares/publishes the original workflow and rechecks session readiness. Existing typed agent protocol/safeguards remain; no arbitrary remote shell. Requires matching >=0.1.16 agent/supervisor.
- Clear finished retains only nonterminal bottom-queue rows. Completed/failed/canceled dismissal IDs merge monotonically in native settings and frontend refreshes, preventing stale state from restoring rows. Jobs history/results are preserved.
- Validation: 55 Rust workspace, 55 Python and 27 frontend unit tests passed; all 21 mocked browser cases passed. Typecheck, production/native Apple Silicon build, Rust formatting, release-version parity (including v0.1.17) and diff checks passed. Browser cases cover guided review/install/restart/readiness, selected instance, locked controls, refused restart and stale-refresh queue cleanup. No generation or live remote dependency installation performed.
- Built, ad-hoc signed and installed /Applications/MyMovie Studio.app 0.1.17; strict signature/version verified. Native acceptance reopened the disposable 0.1.16 verification movie, selected its existing Colab connection in the modal and opened guided Setup without submitting an operation. Screenshot: screenshots/workflow-setup-native-0.1.17.png.
- Previous app preserved at /private/tmp/MyMovie Studio-0.1.16-before-0.1.17.app. EN/RU/FR documentation, example guides and project memory updated. Existing editable movie-copy guides remain user-owned; newly pinned examples contain current steps. Live Colab/Kaggle installation/GPU roundtrip and hosted artifacts remain pending a new matching release.

## 2026-10-15 — Illustrated workflow examples and agent setup, 0.1.16

- Approved implementation on main: three built-in examples (weight-free connection/collection, SD1.5 T4 and tiny background removal), original illustrated previews, guides, exact dependency metadata and reusable editable movie copies. Portable wrappers preserve example identity and package pins.
- Setup now reviews the selected workflow against the live agent, resolves a verified compatible binary-wheel closure, downloads pinned models/plugins, applies only the reviewed setup, and reports readiness/restart/preparation requirements. Reviews are bound to the session, runtime and exact workflow set; external ComfyUI remains read-only.
- Notebook supervisor restarts only managed idle ComfyUI workers while agent/relay/tunnel stay running. Kaggle workers share verified storage/locks; interrupted installs and pending restarts cannot report ready. Agent artifacts include example metadata and matching helper/guide files.
- Validation: 55 Python, 52 Rust workspace and 27 frontend unit tests passed; 18 mocked browser cases passed, with both example cases rechecked after final UI changes. Typecheck, production build, release-version parity and Rust formatting passed. No live cloud/GPU generation or remote dependency download claimed.
- Built, ad-hoc signed and installed 0.1.16 at /Applications/MyMovie Studio.app; strict signature and installed version verified. Native disposable movie acceptance: all three previews visible, SD1.5 pinned once, illustrated Guide and Setup opened, Welcome/reopen retained the same editable copy. No generation submitted or personal movie edited.
- Native screenshots: docs/screenshots/workflow-examples-native-0.1.16.png and workflow-example-guide-native-0.1.16.png; mocked setup screenshot separately labelled. EN/RU/FR READMEs and compact project memory updated.
- Previous app preserved at /private/tmp/MyMovie Studio-0.1.15-before-0.1.16.app; personal movie backup at /private/tmp/123-before-0.1.16.mymovie. Temporary verification movie is /private/tmp/Studio 0.1.16 Verification.mymovie.
- Guided remote setup requires the matching 0.1.16 agent artifact and current supervisor; the last published release remains v0.1.15. No release/tag published by this implementation. Notarization and live Colab/Kaggle roundtrip remain pending.

## 2026-10-15 — Desktop notebook connection diagnostic

- User reports their desktop script received HTTP 200 and `comfy.connected: true` through the temporary Colab relay. This establishes user-reported connectivity, not dependency initialization or GPU generation acceptance.
- Added a standalone standard-library Python diagnostic to WORKFLOW_SETUP, with predefined public desktop-token fallback, optional environment override, exact authenticated node route, temporary-polling setup and HTTP troubleshooting. Linked it from EN/RU/FR README and the node guide; corrected obsolete manual notebook Secrets/bootstrap instructions.
- Verification: documentation snippet compiled and exercised against a local mock for success, rejected token and missing node; public token checked against deploy/node-auth.defaults.json. No live cloud job, model download or installed-app update.

## 2026-10-15 — Run-all notebook setup (approved node-bootstrap scope)

- Goal: unmodified GPU notebook with existing shared test keys; automatically install pinned base ComfyUI, verified cloudflared, release agent/relay and browser compiler; no model or workflow-plugin downloads until app initialization.
- Fix active Stop cell reached by Run all, make healthy-session reruns reusable, show staged progress and connection instructions; preserve unrelated ComfyUI installations. Validate fresh/cached/failing setup and full generated-cell execution with fixtures.
- Public v0.1.15 agent archive was downloaded anonymously, hash-verified and checked for relay/runtime/compiler sidecars. Official cloudflared bytes (40,129,756) match the pinned SHA256.
- Validation: 50 Python tests, including generated Run-all execution/reuse, missing-GPU preflight, fresh/cached/failed setup, cache repair and tunnel corruption; native bundled-notebook test; deterministic regeneration, Python 3.10 cell parsing, version parity and diff whitespace checks passed. Live Colab GPU execution was not performed; older Drive/release copies must be reopened from main.

## 2026-10-15 — Release tag/source version recovery

- v0.1.13/v0.1.14 point to e2d1a8c, which declares 0.1.12; staging the notebook/CI fixes did not include them in either tag. Preserve existing tags and prepare 0.1.15 on main with matching Cargo/npm/Tauri versions and lockfiles.
- Retain strict tag validation; improve mismatch diagnostics with the actual tag, expected version and commit-before-tag guidance. Document the release sequence and separate hosted build status from published assets.
- Verification: 43 Python tests, expected v0.1.15 tag validation, Cargo locked/offline workspace metadata, npm lockfile parity, deterministic notebook regeneration/Python 3.10 syntax, all three CI YAML parses and diff whitespace checks passed. Preparing a fresh v0.1.15 tag; hosted build/publication remains pending.

## 2026-10-15 — Notebook checksum setup and CI target reduction

- Continued approved node setup/release scope on main. Both notebooks default to resolving a public GitHub release (including prereleases) and its metadata SHA256. Custom artifacts still require explicit source/checksum; downloads remain hash-verified before extraction. Metadata network failures omit secrets and distinguish public access from private authentication.
- Local Cloudflare mode checks relay metadata and actual archive contents before installation. Anonymous live metadata lookup for v0.1.12 succeeded and correctly rejected that relay-less release. New relay-inclusive CI archive/public version is still required; no old tag/assets were replaced and no cloud generation was run.
- Commented GitHub macOS Intel desktop/agent and Ubuntu ARM64 agent entries; equivalent GitLab targets stay commented. Preserved GitHub Linux ARM64 desktop and GitLab's already disabled entry. GitLab explicitly builds and packages matching relays on Linux/macOS. Release notes and EN/RU/FR documentation reflect active targets.
- Validation: 42 Python tests passed, including executable generated setup cells, prerelease resolution, missing relay, checksum disagreement, token redaction, archive validation and existing runtime conflict regression. Deterministic notebook parity/cell syntax, all three CI YAML parses, active GitHub matrix assertions, source-version parity (0.1.12) and diff whitespace checks passed. No hosted build/release was run.

## 2026-10-15 — Shared node token defaults and notebook relay tunnel

- Implemented the authorized token/setup scope on main. Settings → Node access and Connections → Colab / Kaggle expose masked editable MYMOVIE_AGENT_TOKEN / MYMOVIE_DESKTOP_TOKEN fields, populated from the user-selected public test pair. Copy notebook assignments and reset-to-default actions included; custom pairs save atomically in the OS vault.
- deploy/node-auth.defaults.json supplies UI, native fallback and both generated notebooks. Active notebook assignments use that pair; environment/Secrets alternatives are commented out. Existing per-connection credentials are not silently rotated; new notebook records save only the desktop token in their credential vault entry.
- Notebook Start owns a local authenticated relay on a configurable port, an optional cloudflared tunnel, agents and managed ComfyUI processes. Explicit temporary-address mode uses REST polling; ComfyUI stays loopback. Attach preserves existing ComfyUI. No model/plugin downloads or generation are added to startup.
- Current GitHub client packaging includes matching relay binaries and compiler/runtime sidecars. Old published archives without mymovie-relay cannot use local tunnel mode; a new CI artifact/release is required. Pre-existing user changes to .gitlab-ci.yml were preserved.
- Verification: 50 Rust tests, 37 Python tests, 27 frontend unit tests and 16 mocked browser tests passed; typecheck, frontend production build, Rust formatting, deterministic notebook regeneration and diff whitespace checks passed. Browser evidence: screenshots/node-access.png (synthetic masked values).
- EN/RU/FR README and compact contracts/ownership/setup/release docs updated. Live Colab/Kaggle cloudflared/GPU acceptance, new public release and installed-app replacement were not performed in this scope.

## 2026-10-15 — Runtime installation CI conflict regression

- CI reported a same-size changed model being reused instead of rejected. Local baseline passed; timestamp-based hash caching can conceal rewrites on coarse-clock filesystems.
- Installation now freshly hashes sources, existing model/plugin files and staged model bytes. Routine inventory retains its cache; verified dependencies remain reusable and conflicts preserve existing bytes.
- Deterministic regressions simulate matching cached metadata for changed source/model/plugin files and verify idempotent reuse. Python suite: 32 tests passed; diff whitespace check passed. Remote GitHub CI has not been rerun here.

## 2026-10-14 — Hosted design-reference interaction audit

- Playwright inspected all twelve sidebar tabs at foamy-scene-craft-studio.base44.app; 59 batches / 301 state-inventory records, including 220 completed text/form comparison actions. Three window sizes, keyboard focus/reorder, media drops and temporary comment/frame CRUD covered.
- Persisted findings in docs/UI_UX_AUDIT.md; fourteen screenshots, inventories and raw state/network/console evidence under ignored artifacts/ui-audit-2026-10-14/. Prototype gaps are not asserted as native-app regressions.
- Main findings: stale workflow input/hardware state, inert import/draft/setup actions, incorrect connection type, absent full bootstrap, inaccessible modal focus behavior. Welcome inner scrolling and storyboard keyboard reorder work.
- Automatic review initially blocked generation and draft deletion. User authorized temporary create/delete only; temporary comment/frame cleanup verified. New generation made no temporary draft, so original sample draft/history/media were preserved. No generation/provisioning/S3/credential-save acceptance claimed.
- Reload restored baseline; no application code or personal projects changed. Future improvements require native-state comparison and an approved implementation plan.

## 2026-10-14 — retired hosted provider workflow upload contract, 0.1.11

- Read-only receipt 89883f5d-b6a0-49cf-ad80-a6c070f13cd6 confirms correct Redux deployment/two image bindings, then code 605 at creation without a task ID. Original provider reason was discarded; cause remains unconfirmed.
- Corrected a documented contract mismatch: workflow/AI App loader overrides now use /task/openapi/upload with multipart apiKey, fileType=input and file, returning data.fileName. The newer standard-model upload API returns a URL for a different input contract. Workflow uploads enforce the documented 30 MB limit.
- New JSON and HTTP errors retain bounded safe plain-language reasons, including nested message fields. Credentials, submitted values, URLs, paths, markup and suspicious tokens cause whole-field omission. Full provider responses remain excluded; historical receipts and retry semantics unchanged.
- Fourteen provider and six durable-job tests plus doc tests passed; multipart contract, size rejection, reason retention/redaction and HTTP rejection covered. No live provider submission or private upload performed; 605 resolution and successful hosted generation remain unverified.
- Version parity, formatting, TypeScript/Vite, native ARM64 production build and strict ad-hoc signature passed. Installed 0.1.11 in /Applications; previous app preserved at /private/tmp/MyMovie Studio-0.1.10-before-0.1.11.app. Saved movie reopened with original history retained. Private screenshot: /private/tmp/mymovie-workflows-0.1.11.png.
- EN/RU/FR README, API contracts, ADR-0018 and acceptance updated. Public release remains v0.1.6; unrelated cpu-canary.png excluded.

## 2026-10-14 — retired hosted provider refusal diagnostics, 0.1.10

- Latest user receipt confirms both image uploads, followed by code 605 at workflow creation without task ID. Provider history/logs unavailable; published error table does not list this code. Root cause remains unresolved.
- New errors retain the failed API operation, translate documented reasons and retain safe symbolic identifiers. Free text, credentials and submitted values are excluded; no speculative balance advice. Existing receipts and submission/retry semantics remain intact.
- Ten provider and six job tests plus doc tests passed with local mock servers; no paid provider task submitted. EN/RU/FR README and compact contracts/acceptance updated.
- Native ARM64 production build, TypeScript/Vite and version parity passed. Strict ad-hoc signature verified; installed 0.1.10 in /Applications after backing up 0.1.9 to /private/tmp/MyMovie Studio-0.1.9-before-0.1.10.app. Saved movie reopened and original Jobs history retained. Private screenshot: /private/tmp/mymovie-jobs-0.1.10.png.

## 2026-10-14 — retired hosted provider CUDA admission hotfix, 0.1.9

- Redux/r01 failed before staging or provider submission: the default backend hardware guard rejected its CUDA declaration; no remote task ID was created.
- retired hosted provider now owns compatibility admission: unspecified/universal/cuda accepted for hosted Workflow and AI App deployments; Apple Silicon/ROCm/CPU/invalid still rejected. Direct ComfyUI/relay checks and hosted bindings remain intact.
- Regression covers both API families and all declared flags without network requests. Targeted provider/job suite: 13 tests plus doc tests passed. Version parity and frontend production build passed.
- EN/RU/FR README and setup/contracts updated. Historical receipts remain immutable; reuse the failed attempt as a new reviewed draft. Paid provider generation remains unverified.
- Native ARM64 production build and strict ad-hoc signature verified; installed /Applications/MyMovie Studio.app 0.1.9 after preserving 0.1.8 in /private/tmp/MyMovie Studio-0.1.8-before-0.1.9.app. Saved personal movie reopened normally.
- Reuse as draft/review retained two Redux media slots and r01; left at explicit Run now review without creating a new job. Private screenshot in /private/tmp only; no secrets/private media staged.

## 2026-10-14 — Studio refinement, 0.1.7

- User approved STUDIO_REFINEMENT_PLAN.md with `go`; implemented on main with later requested batch deletion, collapsible Jobs editor, execution-node editing and bottom queue cleanup.
- Explicit two-image roles/swap, compact Advanced/hidden controls, saved target reuse, scoped used-node registry compatibility and live selected-model checks before staging.
- Durable Add to queue stays idle across reopen; explicit start obeys endpoint lanes. Queued edits restore frozen exact inputs and atomically replace only unstarted batches; canceled original receipts remain immutable. Clear finished persistently hides only terminal bottom rows without deleting job history/results.
- Agent/desktop/relay publish normal editor workflows through confined conflict-safe ComfyUI Userdata with verified readback. Default agent install remains registry-only; current canvas stays untouched.
- Scrollable/removable recent movies and Welcome navigation; filename ellipsis, background video posters, asset usage and effective scene/frame character links/filtering.
- Real native idle/reopen/start mask, persisted bottom queue cleanup with seven receipts retained, video poster, Mac FaceSwap editor publication and Linux ARM64 OrbStack utility install/reuse/API compilation passed. Exact receipts: GENERATION_ACCEPTANCE.md; native/fixture screenshots labeled separately.
- Verification: 46 Rust tests plus doc tests, 17 frontend tests, 13 mocked browser tests, 28 Python tests; typecheck, formatting, version parity and ARM64 macOS production build. Local 0.1.7 installation uses an ad-hoc signature. Public release remains v0.1.6; no new tag created.
- EN/RU/FR README, setup and compact memory updated. Paid retired hosted provider/cloud GPU/relay/S3 acceptance, foreign desktop launch and signing/notarization remain open. Drafts, private artifacts and unrelated cpu-canary.png excluded.

## 2026-10-14 — Catalogue, compiler and generated forms: 0.1.6

- User approved WORKFLOW_CATALOGUE_PLAN.md with `go`; implementation on main. Import normal editor/API JSON once into immutable catalogue versions; portable v4 project pins, target profiles, layouts and saved target selection.
- Agent CLI/relay inspect/install/compile and desktop Prepare use the selected ComfyUI frontend exporter in an isolated sidecar. API/editor exports, registry-derived controls, separate media roles, advanced fields, constrained ratios and output labels/selections implemented. retired hosted provider reuses explicit hosted deployment mappings.
- Python/Playwright/Chromium are compiler prerequisites; native binaries do not embed a browser. The agent registry preserves editor sources but does not overwrite a live canvas. Existing reviewed dependency installation remains the managed-worker gate.
- Real compiler: 29-node FaceSwap, 1,894 registry classes; safe local MPS execution completed with two traceable results. Normal core mask editor compiled too. Native app imported the editor, prepared four inputs/one output, changed ratio to 9:16 (64×114), exported a three-node API and saved catalogue entry. Saved ratio restored after native quit/reopen; preparation also passed with persistent compiler dependencies in app support. Screenshot: screenshots/native-workflow-0.1.6.png.
- Verification: 38 Rust tests, 10 frontend tests, 7 mocked browser acceptance tests, 28 Python tests; typecheck, formatting, native ARM64 production build and version parity passed. Loopback fixtures require sandbox elevation. Native 0.1.6 installed in /Applications; release publication tracked in CI_RELEASES.md.
- Native Generate/Jobs executed the saved mask on local ComfyUI with frozen 64×114 inputs; Renders collected the 613-byte PNG and showed durable provenance. Receipt/hash and screenshot: GENERATION_ACCEPTANCE.md, screenshots/native-job-0.1.6.png.
- GitHub/GitLab now package macOS Intel/ARM agents alongside Linux x86_64/ARM64 agents and five desktop targets. Compiler helper/requirements and architecture checks included. Hosted run 38557508498 passed all nine native builds, source checks and automatic publication of v0.1.6 from exact source 950c707849eb5082d6a7651ec57ab9cc3353184d. All 34 public downloads independently passed SHA-256, format/architecture and agent metadata verification; evidence and durable links: CI_RELEASES.md. GitLab execution remains unverified.
- Gaps: active cloud/relay and paid retired hosted provider acceptance, actual Finder drop test, comprehensive primitive/reroute/bypass/subgraph/custom-serializer fixtures, foreign desktop launch, signing/notarization. No paid cloud resources used. Private media, credentials, drafts and unrelated cpu-canary.png excluded.

## 2026-10-14 — Reusable editor workflows and execution targets: planning

- User requests a reusable workflow/target pool, automatically generated forms from actual node types, and agent editor-to-API conversion for local/remote ComfyUI; retired hosted provider remains a mapped hosted test target.
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
- Live managed cloud installation, learned removal, local/cloud parallel run, two-GPU Kaggle and paid retired hosted provider acceptance remain pending an active authenticated session. No paid resources used.

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

- User approved Jobs plan with `go`: independent jobs queue on the same ComfyUI instance and run concurrently across different instances. Later steering makes private RunPod ComfyUI primary; retired hosted provider remains for workflow tests.
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
- Live retired hosted provider/RunPod/relay/S3, desktop SSE, automatic LoRA sync, workflow chains, notarization and full image/editor exchange remain open. GitLab requires a project mirror and eligible macOS runner; no GitLab resources created.

## 2026-10-13 — MyMovie Studio planning

- Read supplied build request, invoked planning skill and initialized missing six compact context docs before repository inspection.
- Confirmed empty application repo, dual licenses/origin and local ARM64 toolchain; targeted reference audits only.
- Verified Fenki palette, Homer native lifecycle/package patterns, Unipuni Dock progress and browser session isolation example.
- Consulted primary Tauri/ComfyUI/retired hosted provider/RunPod/Playwright documentation; no third-party workflow ownership or executable export inferred.
- User confirmed ordered scene/shot storyboard and waiting for Base44 exports; retired hosted provider current provider with CPU-only ComfyUI smoke target options.
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

## 2026-10-13 — Supplied LTX/MINIMAX and retired hosted provider page

- Read the six compact context docs and planning skill; no implementation approval.
- Inspected three user-named Downloads files as data; no embedded commands executed.
- LTX: 46 API nodes, matching all editor node IDs/types; editor has 102 nodes.
- MINIMAX: 17 API nodes, nested serialized multitrack JSON and reference paths.
- Neither API graph has a missing referenced node; output counts/types unverified.
- Recorded positive/negative and duration/ratio/seed candidates and disconnected
  MINIMAX SaveVideo without claiming executable validation.
- Web fetch could not read supplied retired hosted provider page; HTTPS browser inspection
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
- Live retired hosted provider, GPU video graphs, private relay/S3/RunPod roundtrip, signing/notarization, DMG and CI remain unverified/open.
- Browser profiles, remote LoRA training, full derivatives and Homer interoperability remain later milestones.
- No credentials from conversation used, no paid generation or cloud rental performed. Draft exports unchanged and ignored.
- Implementation commit: 918140a; delivery branch: codex/mymovie-studio.
- Final format/diff checks passed; generated schemas, drafts, personal packages and root cpu-canary.png excluded from commits.
- Bundled font license texts included; historical scaffolding script removed from runtime source.

## 2026-10-13 — ComfyUI/image/Linux extension planning

- User requests continued work on main, desktop macOS/Linux x86_64 CI/CD, ComfyUI Desktop exchange, image workflows and multiple retired hosted provider accounts.
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
- Approved ComfyUI/images/notebook/CI extension remains in progress in the working tree; hotfix staged separately. No live retired hosted provider/Colab/Kaggle or weighted GPU job acceptance claimed. Drafts and root cpu-canary.png untouched.
- Isolated staged hotfix snapshot compiled successfully; cold-launch regression passed independently of the unfinished integration changes.

## 2026-10-14 — retired hosted provider job entry, CI artifacts and notebooks, 0.1.2

- Added visible Workflows → Target keyframe → Create generation job, per-workflow/account deployment/family mapping and actionable submission readiness. Definitive provider refusals fail safely; unknown attempts have explicit task-history reconciliation. Frozen destinations preserve routing after settings changes.
- Hardened retired hosted provider Workflow/v2 AI App payloads, typed values, uploads, status/results parsing and official .ai/.cn endpoint validation. No chat credentials used and no paid task submitted.
- User supplied a since-retired provider deployment link Workflow family/ID inferred from the supplied URL; public page did not expose enough graph details to identify the matching LTX/MINIMAX export. Matching file and live account acceptance remain pending.
- Added compatible workflow/editor/deployment contracts and image preset fixtures. Editor-pair/export controls, preset UI and weighted Desktop exchange are still unfinished; backend helpers/fixtures alone do not establish user-facing completion.
- Added node-scoped relay leases/report/health and lost-session handling, agent version/heartbeat support, verified prebuilt Linux client bootstrap and generated Colab/Kaggle notebooks. Two GPU mode starts independent ComfyUI/agent processes on separate device/port/node identities; live notebooks need an authenticated relay/runtime.
- Added GitLab branch/MR/tag checks, macOS ARM/Intel DMGs, Linux desktop/client artifacts, version parity, checksum publication and immutable package/Release links. GitHub matrix and draft tag releases included. GitLab project/macOS runner, hosted pipeline runs and notarization remain pending; no tag or hosted resources created.
- Version 0.1.2 production ARM64 .app built, ad-hoc signed and installed at /Applications/MyMovie Studio.app; strict signature/version checks passed. Previous 0.1.1 app preserved at /private/tmp/MyMovie Studio-0.1.1-backup.app.
- Installed app reopened a saved temporary movie, imported a 7-node API graph, selected its keyframe and opened the new submission review. Native screenshot: docs/screenshots/workflow-job-0.1.2.png. Personal movies untouched; sample screenshot is not a real retired hosted provider generation.
- Validation: Rust workspace 23 tests plus doc tests passed; frontend typecheck and 2 unit tests passed; 2 mocked end-to-end retired hosted provider tests passed; Python 14 tests passed. Release-version parity, CI YAML parsing, shell syntax and diff checks passed. Mocked job-review screenshot saved separately.
- EN/RU/FR README updated. Drafts, private settings/keys, root cpu-canary.png and generated build output excluded from staging. Full ComfyUI/image milestone and real cloud/GPU/S3 roundtrip remain open.

## 2026-10-14 — Confirmed LTX hosted mapping

- User identified Workflow 2110044532631932930 as the supplied LTX API JSON.
- Saved that Workflow-family deployment for the selected account through the installed 0.1.2 app; added string bindings for positivePrompt/121.text, negativePrompt/110.text and image/167.image.
- Read-only persistence check verified the mapping and three bindings; no generation jobs were created. Review opens with the hosted destination, but the selected frame needs an image before submission. The native command rejects a missing frame image; the current review does not disable submit for that case.
- Native configuration screenshot: ignored artifacts/acceptance/ltx-retired hosted provider-ready.png. Personal movie data and account settings remain outside Git. No provider acceptance or paid generation claimed.

## 2026-10-14 — Reusable workflow/media simplification, 0.1.8

- Approved MEDIA_WORKFLOW_SIMPLIFICATION_PLAN implemented on main: one Generate composer, Jobs queue/history Edit/Reuse, separate idle Add to queue / Run now, removable batch entries and reusable exact workflow slots with Advanced/Hidden overrides.
- Shared searched tile gallery and Library/Renders identities; recoverable bulk Trash/Restore retains references and receipts. Hash-verified import dedup runs before copy and preserves linked policy; exact slot imports return asset IDs atomically.
- Native personal configuration (backup first): Redux Workflow/2110376761482002434, 19.image face reference, 86.image base photograph; disconnected 88 inactive. Reopening retained slots/drafts; review verified both inputs without paid submission. LTX retained.
- Local Klein profile refreshed successfully against live MPS ComfyUI, 37 inputs and scope-v1 hash. Fixed a preparation panic for model inventory schemas without optional metadata; added regression coverage. Clear finished removed the historical failure from the bottom queue, preserving Jobs history.
- Native disposable package: three-media bulk Trash/Restore and duplicate video import passed. Screenshot docs/screenshots/media-workflow-0.1.8.png. Final spacing fix adds rem gaps to Library filters/actions/drop zone.
- Checks: frontend 20 unit tests, 15 mocked browser tests, Rust workspace 49 tests and doc tests, production TypeScript/Vite, native ARM64 release and strict ad-hoc signature passed. EN/RU/FR README and six compact context docs updated.
- Installed /Applications/MyMovie Studio.app 0.1.8; previous app /private/tmp/MyMovie Studio-0.1.7-before-0.1.8.app and movie /private/tmp/123-before-0.1.8.mymovie preserved. No paid/cloud jobs, credentials, private media, drafts, cpu-canary.png or release tags included.

## 2026-10-15 — Designer workflow wrappers and selective queue, 0.1.12

- Approved UI audit and implementation on main. Removed the retired hosted adapter and active UI; legacy destinations/settings remain readable and cannot execute. Credentials and personal projects untouched.
- Workflows now has Inputs / Outputs / Setup / Guide: exact public bindings, optional/default/advanced fields, selected output collection, safe illustrated README, collections, and independent hardware variants. Source graphs remain immutable.
- Portable .mymovie-workflow.json collections validate graph hashes and strip preparations/destinations/private source identities. Schema-v5 migration defaults existing workflows safely; package upgrade keeps backups.
- Generate reuses saved forms; Jobs selects individual paused tasks to start/remove or edit exact inputs/destination. Removal preserves canceled receipts; selected queue edits atomically replace only unsent tasks.
- Full setup-script window supports Mac/Linux/SSH and Colab/Kaggle artifacts. Verified initialization permits pending editor workflows to install reviewed dependencies before preparation; pending editor graphs cannot run or pass readiness.
- Setup receipts remain session/runtime/profile scoped, with restart/reprepare required as appropriate. No paid generation, live cloud deployment, personal media or drafts changed.
- Validation: 49 Rust tests plus doc tests, 24 frontend unit tests, 28 Python tests, frontend types/production build, and all 15 mocked browser cases passed. Format, diff and version-parity checks passed.
- Built the macOS ARM64 release, ad-hoc signed it, and verified the strict deep signature. Installed /Applications/MyMovie Studio.app 0.1.12; previous 0.1.11 app preserved at /private/tmp/MyMovie Studio-0.1.11-before-0.1.12.app.
- Native acceptance in a disposable verification movie: imported the public weight-free mask API fixture, saved collection/name/Markdown guide, reopened it with the guide retained, and exported a portable wrapper. Export inspection confirmed schema/version and empty preparations/destinations. The Colab complete-script window loads through the registered native command. No workflow was executed.
- Screenshots: workflow-wrapper-guide.png, workflow-wrapper-native-0.1.12.png, generate.png, jobs-queue-edit.png and workflow-catalogue.png. EN/RU/FR READMEs, compact project memory, wrapper/setup/release guides updated. Live cloud/GPU roundtrip remains unverified; no release tag published.
- Implementation commits on main: 04ceed6 (contracts/native runner) and b88fcf9 (workflow/setup/queue UI). Root cpu-canary.png remains untracked and untouched.

## 2026-10-15 — Notebook setup import fix

- Kaggle setup referenced `platform` from a hidden bootstrap cell. The setup cell now imports it directly; regenerated Colab and Kaggle notebooks from the shared generator. Added a regression assertion for the generated setup cell.

## 2026-10-15 — Notebook helper execution fix

- Notebook startup imports and runner creation depended on a hidden helper cell that Kaggle could skip. The helper cell is now visible and documented as required; setup and start fail with a clear Run all instruction if their prerequisites are absent.

## 2026-10-15 — Full-screen terminal and editing fixes, 0.1.19

- Terminal fills the app viewport with dark controls, collapsed help, Fit window PTY measurement and reversible native full-screen toggle. Screenshot: docs/screenshots/remote-console-fullscreen.png (fixture UI; no live remote shell claimed).
- Desktop metadata saves preserve authoritative native source graphs/editor hashes/prepared profiles, fixing integral-float/large-integer round-trip failures during frame/character renames and storyboard edits. Regression covers reopen, version tampering and revision conflicts.
- Shot handles support drag reorder, up/down controls and confirmed shot/frame removal. Assets/history retained. Archived example copies restore immediately, keep their identity and select the chosen node for setup.
- Direct ComfyUI Setup prepares and publishes existing editor workflows on the selected node; missing dependencies require an agent. Agent installation behavior remains unchanged.
- Connections/Setup exports fresh version-labelled Colab/Kaggle notebooks. Current CPU auto-detection regression passes; user errors reference stale GPU-only or partially executed copies. Live notebook execution remains unverified.
- Validation: 65 Rust tests plus doc tests, 27 frontend unit tests, 62 Python tests, 29 fixture browser tests, production frontend/native ARM64 build, version parity, strict ad-hoc signature and diff checks passed.
- Installed /Applications/MyMovie Studio.app 0.1.19; previous 0.1.18 app preserved at /private/tmp/MyMovie Studio-0.1.18-before-0.1.19.app. Running app was not stopped; reopen to load new version.
- EN/RU/FR READMEs and compact memory updated. Personal projects/drafts/credentials untouched; no cloud generation, tags or published releases. Matching current remote artifact is still needed for new background initialization/console capabilities.

## 2026-10-15 — Local OrbStack CPU and Apple Silicon MPS guide

- Added docs/LOCAL_COMFYUI_TEST.md: isolated CPU canary on loopback port 8192 using OrbStack Docker, fresh M2 Max/MPS install on port 8191, direct workflow test steps, agent CLI workflow actions, and private relay-backed Studio initialization/console setup.
- Clarifies that direct ComfyUI preparation/job execution does not install remote filesystem dependencies; OrbStack full dependency installation needs a Linux agent inside that runtime. Agent setup on fresh MPS can use the local macOS utility and custom HTTPS relay tunnel without exposing ComfyUI.
- Linked from the README and architecture index. Installation commands follow the ComfyUI upstream Apple Silicon notes and OrbStack's published Docker networking instructions. No installs or model downloads performed.

## 2026-10-17 — Explicit installation targets and local VAE check, 0.1.22

- Direct ComfyUI setup now clearly says graph-only/no downloads and offers Connect agent to install. Declared model count/size and setup dependencies remain visible before review. Workflows remembers the selected target; a removed target requires deliberate replacement.
- Built/signed/installed /Applications/MyMovie Studio.app 0.1.22 and matching local client; preserved the previous app. EN/RU/FR README, local setup guide and native/fixture screenshots updated.
- User authorized moving the smallest existing model. Restarted only the idle test instance on 8191 under the local supervisor; private relay 8789/node local-mps-0 is healthy. Studio's separate private agent connection is not yet configured.
- Backed up the 336,211,292-byte VAE, temporarily removed it, and verified agent installation from its SHA256-verified cache. Installed SHA256 matches the example; original retained in Downloads/mymovie-local-mps/model-backups. No generation or network weight download performed.
- Existing diffusion model filename/size and text encoder size differ from the example pins; preserved both. Gated HF source returned 401 without authentication; saved credential required macOS unlock. Full network-download/FLUX acceptance remains pending.
- Validation: 28 frontend tests, 63 Python tests, 16 targeted browser cases, typecheck, production/native ARM64 build, release-version parity, strict signature and diff checks passed. Existing unrelated App.tsx edits excluded from this commit; no tags or remote publication.

## 2026-10-17 — Local FLUX.3 weighted smoke test

- Ran one non-explicit 512x512 T2I test on isolated MPS ComfyUI :8191 with existing flux3_image_klein_bf16, Qwen3VL BF16 and Flux2 VAE. Direct API validation succeeded; 16 Euler/simple steps, seed 172026, CFG 1.0.
- Execution succeeded in 42.870 seconds including cold loading; inspected the saved PNG. Reusable ordinary editor JSON, exact API graph, submission/history and result summary are in ignored artifacts/local-mac/acceptance/flux3-live/. Output remains in the test ComfyUI output/MyMovie_acceptance folder.
- No downloads, paid compute or changes to immutable examples. This verifies the local weighted backend; Studio dispatch, global Library ingestion, agent-mediated generation, two-reference I2I and cloud acceptance remain separate checks.
