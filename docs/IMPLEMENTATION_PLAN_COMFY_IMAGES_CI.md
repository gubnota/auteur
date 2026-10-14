# Implementation Plan: Image workflows, ComfyUI exchange, notebook runners and CI/CD

> Historical plan: hosted-provider steps are superseded by the 0.1.12 ComfyUI wrapper implementation.

Status: Accepted; user approved implementation on 2026-10-13 ("давай"), including dual-GPU Kaggle.
Date: 2026-10-13
Branch: main (already checked out, aligned with origin/main).

## Goal

Extend the existing native studio with a dedicated image-workflow workspace, lossless API/editor workflow exchange with ComfyUI Desktop, tests using existing local weights, repeatable macOS and Linux x86_64 builds, and guided deployment of our Linux headless client alongside ComfyUI in Google Colab and Kaggle notebooks. Keep portable .mymovie documents, immutable originals, account-scoped secrets and traceable jobs.

## Existing behavior

- React/TypeScript frontend and Tauri 2/Rust desktop shell; SQLite authoritative project/job state.
- workflow-core accepts API-format graphs only, hashes the original graph and applies explicit bindings to job copies.
- Workflows has a shared import/binding screen; no image-specific workspace or export command.
- Jobs stage the keyframe image and up to four assigned character references. Masks have no asset selector/staging contract.
- Connections already supports multiple retired hosted provider accounts with Keychain references. Each connection currently holds one deployment ID/API family.
- Local ComfyUI at http://127.0.0.1:8188 responds (0.3.76, CPU), exposes core image nodes, but CheckpointLoaderSimple reports no checkpoints.
- ComfyUI Desktop now responds at http://127.0.0.1:8189 (0.39.2, Apple MPS); its registry exposes the existing test checkpoint. Weighted execution has not yet been tested.
- Existing Docker CPU configuration mounts input/output, not the user's models directory.
- A 6,938,041,288-byte checkpoint exists at /Users/vm/ComfyUI-Installs/ComfyUI/ComfyUI/models/checkpoints/cyberrealisticPony_v180Coreshift_pruned_fp16.safetensors. Desktop registry visibility is verified; successful loading/generation still needs acceptance.
- Tauri bundles currently target app/dmg and keyring enables apple-native only. No GitHub Actions workflow exists.
- User's root cpu-canary.png and ignored drafts must remain untouched and outside commits.

## Proposed approach

### Workflow exchange and compatibility

- Keep Workflow.graph/version as the immutable executable API graph and its existing hash. Add backward-compatible defaulted metadata: media category, optional original editor graph/hash, and per-connection retired hosted provider deployment mappings.
- Import API JSON as before. Support importing an editor/API pair and verify node IDs/types align before attaching editor metadata; reject mismatched pairs without modifying the project.
- An editor-only import opens a guided request for its companion API export. Do not infer arbitrary custom-node widget ordering or execute an unverified conversion.
- Export the original API graph, preserved editor JSON when available, or a resolved job API graph through the native save dialog. API JSON can also be opened by ComfyUI Desktop, with its frontend arranging nodes when layout is absent.
- Preserve unknown graph metadata and version identities. Protect attached editor originals in persistence checks and project projections; attaching a previously absent editor uses a native command.
- Provide a selected-server readiness report for missing node types, missing model choices and unsupported bindings. No automatic model downloads or custom-node installation.

### Images and outfit editing

- Add an Images sidebar tab using the same project workflows and durable job queue, with explicit image/video/other classification; old workflows retain their existing behavior.
- Show text-to-image and masked image-edit presets, source image, mask material, prompt, seed, dimensions/ratio and supported character reference slots using existing modal controls.
- Select a keyframe as the destination for image results; preserve existing frame media and originals. Result assignment is explicit.
- Add safe native staging for a mask asset selected by project asset ID; never pass a local filesystem path as a provider image filename.
- Create paired API/editor example files from core nodes: text-to-image and masked clothing-region editing with the existing checkpoint name, plus the existing weight-free CPU canary.
- Local masked editing is an inpainting example; dedicated virtual try-on requires a verified model/workflow. Display the retired hosted provider outfit-change catalog reference as requiring authorized API export/schema until those are available.
- Configure retired hosted provider workflow/AI App IDs per workflow and connection so two accounts and image/video workflows can coexist. Keep legacy connection defaults as a compatibility fallback.
- Freeze the resolved deployment/API family in the job snapshot; status/cancel/collection use that snapshot with the selected account's credential, even after configuration changes.

### Local acceptance

- First verify API/editor import/export, missing-weight reporting and the weight-free canary against the currently running server.
- Run the checkpoint-backed workflow only after ComfyUI Desktop exposes that checkpoint in object_info; use one small, low-step image test and collect its result into a temporary .mymovie project.
- Reopen exported JSON in ComfyUI Desktop and verify node links, checkpoint selection, prompts and the preserved layout for paired imports.
- Prepare workflow files inside the repository/temporary acceptance directory. Reuse existing weights without copying, replacing or downloading them.
- Document an optional read-only model-directory Docker mount for CPU acceptance. Large SDXL generation may be slow on CPU; prefer the user's Desktop runtime when available.
- retired hosted provider acceptance uses two credentials entered through the native Connections UI and an authorized workflow/schema; verify account health and one explicit test submission per configured account. No conversation credentials are used.

### Colab and Kaggle deployment

- Dual-GPU Kaggle runs two independent ComfyUI/agent pairs: GPU 0/1, ports 8188/8189, isolated input/output/temp/user/receipt directories and distinct node IDs. No VRAM pooling. Extend the authenticated single-owner relay with an explicit multi-node allowlist, lease isolation and stale heartbeat reporting; keep MYMOVIE_NODE_ID backward compatible. Tests must cover simultaneous independent claims, wrong-node reports and runtime loss.
- Additional affected files: apps/relay/src/main.rs (multi-node broker/tests), apps/agent/src/main.rs (node identity in reports), scripts/generate-notebooks.py (shared-helper notebook generation).

- Add Google Colab and Kaggle presets in Connections, using the existing authenticated relay backend and node identity. These are hosting presets for ComfyUI, not separate job engines. Keep the local/retired hosted provider flows intact.
- Ship separate ready-to-upload Colab and Kaggle notebooks with a shared bootstrap helper. Deploy the actual CI-built Linux x86_64 mymovie-agent artifact into the notebook runtime; do not require Rust compilation or a GUI there.
- Pin the artifact version, bootstrap helper and manifest; verify trusted expected SHA256 before extracting/executing anything. Reject wrong architectures, digest mismatches, unsafe archives and unsupported runtime libraries. Support a user-uploaded artifact/manifest when release downloads are unavailable. Draft/private GitHub artifacts need an explicit authenticated download path; do not assume public release URLs exist.
- Use Colab userdata or Kaggle UserSecretsClient for relay/optional private-download credentials. Pass agent tokens only through subprocess environment, never notebook source, command arguments, saved outputs or logs. Redact diagnostics.
- Attach an existing loopback ComfyUI, or start a user-selected existing installation with a recorded pinned revision. Check health, node registry and weights before accepting jobs. Model weights remain user-provided; no silent multi-GB downloads or arbitrary custom-node installers.
- Default Colab work directory to /content and Kaggle to /kaggle/working. Treat Kaggle /kaggle/input materials as read-only sources; expose model paths through an explicit ComfyUI configuration rather than overwriting dataset files. Check writable storage and network access and explain missing notebook secret grants.
- The agent initiates outbound authenticated HTTPS to a reachable relay; ComfyUI remains loopback. The studio receives jobs/results through the existing relay contract. No public unauthenticated ComfyUI, SSH or tunnel service is required. A reachable relay URL and separate studio/agent credentials are necessary for live remote acceptance; localhost Docker is only a local test setup.
- Provide visible notebook start/status/stop cells and studio setup/status/help with node ID, artifact version, last heartbeat and model-readiness results. Prevent duplicate agent processes, allow a bounded interactive run, and explain reconnecting after notebook termination without promising always-on service.
- Preserve local receipts during a session; optional user-chosen persistent storage is explicit. On a lost runtime/data directory, use a new session node identity and surface unknown job outcomes; do not blindly resubmit a potentially completed generation. Completed results must be collected into the project before ephemeral storage disappears.
- Colab remote-worker acceptance targets an eligible paid runtime with positive compute balance, Enterprise or user-controlled runtime: Google's free managed-runtime restrictions include distributed workers and external control. Do not implement anti-idle or quota bypasses. Kaggle hosting eligibility, network/session limits and real runtime behavior remain acceptance items rather than assumed guarantees.

### CI/CD

- Build on main pushes, pull requests and manual dispatch. Use macOS ARM64, macOS Intel, and Ubuntu x86_64 runners/targets.
- Run locked dependency installs, Rust format/workspace tests, frontend typecheck/tests and native packaging. Store .app/.dmg and .AppImage/.deb artifacts with checksums.
- Also package the existing headless ComfyUI runner (apps/agent) for Linux x86_64, separately from the desktop client, with a versioned archive/manifest/checksums usable by both notebooks. Smoke-check its CLI and runtime libraries on native Linux CI.
- Move keyring features to target-specific dependencies: Apple Keychain on macOS, Secret Service on Linux. Fail clearly if a Linux secret service is unavailable; do not fall back to plaintext storage.
- Add a Linux bundle overlay and platform-neutral dialog/error wording. Retain the macOS Finder package association and progress integration.
- Add tag-triggered draft GitHub releases using the successful build artifacts. Normal checks have read-only repository permissions; only the draft-release job needs contents:write.
- Pin third-party Actions to reviewed immutable revisions. No cloud keys or model weights are needed by CI.
- Use ad-hoc macOS signing for distributable test artifacts. Apple Developer signing/notarization remains an optional later release configuration.

## File changes

Modify:
- crates/studio-contracts/src/lib.rs — defaulted workflow metadata/editor/deployment DTOs.
- crates/workflow-core/src/lib.rs — paired import validation, export selection, preset graphs, asset bindings and deployment resolution.
- crates/project-core/src/lib.rs — editor immutability/projections and backward-compatible validation.
- crates/job-core/src/lib.rs — freeze workflow/editor/deployment metadata and update workflow test fixtures.
- crates/provider-comfyui/src/lib.rs — reusable registry/readiness report and model-choice diagnostics.
- apps/desktop/src-tauri/src/service.rs — paired import, export, readiness commands; verified mask staging and frozen job routing.
- apps/desktop/src-tauri/src/main.rs — register new native commands.
- apps/desktop/src-tauri/Cargo.toml — target-specific credential backends.
- Cargo.lock — lock added Linux credential dependencies.
- apps/desktop/src/lib/types.ts — mirror extended DTOs.
- apps/desktop/src/lib/bridge.ts — paired file/save helpers and platform-neutral messages.
- apps/desktop/src/App.tsx — Images route, native import/export dispatch and image/mask job fields.
- apps/desktop/src/features/Connections.tsx — Colab/Kaggle hosting presets, relay/node setup, artifact instructions and status.
- apps/desktop/src/features/Library.tsx — shared category, export, readiness and per-account deployment controls.
- apps/desktop/src/styles/studio.css — reuse rem-based Fenki spacing and add image-workspace styles.
- deploy/cpu/compose.yaml — optional read-only existing-models mount, without a committed personal absolute path.
- README.md, README.ru.md, README.fr.md — platform builds, workflow exchange, notebook deployment/secrets/lifecycle, model reuse and acceptance limitations.
- docs/PROJECT_CONTEXT.md — milestone/platform scope.
- docs/ARCHITECTURE_INDEX.md — new workspace/fixtures/CI navigation.
- docs/MODULE_OWNERSHIP.md — image UI reuse and native export/staging boundaries.
- docs/API_CONTRACTS.md — new defaulted fields, commands and job-routing semantics.
- docs/DECISIONS.md — API/editor distinction, target keyrings and release strategy.
- docs/TASK_LOG.md — verified outcomes and remaining acceptance gaps.

Create:
- apps/desktop/src/features/ImageWorkflows.tsx — image preset/import workflow workspace.
- apps/desktop/src-tauri/tauri.linux.conf.json — AppImage/deb targets and Linux icon configuration.
- crates/workflow-core/tests/workflow_exchange.rs — lossless exchange, pairing mismatch, compatibility and mapping tests.
- crates/provider-comfyui/tests/readiness.rs — missing node/model and valid registry contract fixtures.
- apps/desktop/src/lib/workflow-selection.ts — shared image filtering/input selection.
- apps/desktop/src/lib/workflow-selection.test.ts — image/mask selection and legacy category behavior.
- fixtures/workflows/image-text-api.json — core-node text-to-image example.
- fixtures/workflows/image-text-editor.json — matching editor example.
- fixtures/workflows/image-inpaint-api.json — core-node masked editing example.
- fixtures/workflows/image-inpaint-editor.json — matching editor example.
- scripts/workflow-roundtrip.py — opt-in real-server acceptance and concise receipts, separate from mandatory CI.
- deploy/colab/MyMovie_ComfyUI.ipynb — artifact deployment, Colab Secrets, ComfyUI readiness and runner lifecycle.
- deploy/kaggle/MyMovie_ComfyUI.ipynb — artifact deployment, Kaggle Secrets, dataset model paths and runner lifecycle.
- scripts/notebook-bootstrap.py — shared verified artifact installation, runtime detection, secret-safe start/status/stop.
- scripts/tests/test_notebook_bootstrap.py — corrupted artifacts, unsafe archives, missing secrets/network, duplicate launches and redacted errors.
- .github/workflows/checks.yml — checks and three desktop target builds plus Linux runner artifact.
- .github/workflows/release.yml — draft release from tag builds/artifacts with checksums.
- docs/screenshots/image-workflows.png — verified native screen after implementation.

No files are deleted.

## Implementation steps

1. Extend contracts/persistence with serde defaults; test opening existing packages and preserving API graph hashes and editor originals.
2. Add workflow pair/import/export and preset graphs; test exact original roundtrip, unsupported editor-only execution, and mismatched pairing.
3. Add registry readiness and checked mask staging; verify missing weights block submission before provider upload/job POST.
4. Add per-workflow account mappings and snapshot routing; test two accounts with different IDs and configuration changes after submission.
5. Add Images and shared workflow controls; check modal fields, reference selection, ratios, explicit result assignment and document reopen.
6. Implement Linux keyring/bundle settings and CI/CD. Build macOS locally; validate Linux through its native CI runner, not a macOS cross-compile assumption.
7. Add shared notebook bootstrap, Colab/Kaggle notebooks and guided Connections presets; run security/lifecycle tests and local runner-relay acceptance.
8. Perform local canary and Desktop weighted exchange acceptance. Live notebook tests need an active eligible runtime and reachable relay; retired hosted provider tests need native account credentials and authorized schema.
9. Capture the native screen, update compact memory/three READMEs, and commit small coherent changes on main; push within the user's existing authorization.

## Verification

- cargo fmt --all -- --check
- cargo test --workspace --locked
- npm ci; npm run typecheck; npm test -- --maxWorkers=1; npm run build
- npm run tauri:build -- --debug --bundles app (local macOS smoke build)
- Native CI builds: aarch64-apple-darwin, x86_64-apple-darwin, x86_64-unknown-linux-gnu.
- Two existing/new temporary .mymovie packages survive save/reopen with workflow versions unchanged.
- Import pair -> export editor/API -> reopen in Desktop; graph links and inputs remain equivalent and editor layout is retained.
- Missing checkpoint/node tests fail before submission; canary returns an actual collected PNG and receipt.
- Real image test records workflow hash, prompt ID, model name, input/result hashes and terminal outcome.
- Account tests retain distinct credential refs/deployment IDs/uploads/task routing; changing current mappings never retargets existing jobs.
- python3 -m unittest discover -s scripts/tests -p "test_notebook_*.py"
- Verify notebook JSON/code cells, no saved secrets/output, pinned artifacts/helper, wrong hash/architecture and archive traversal rejection.
- Verify Colab/Kaggle secret-reader fixtures, network-off errors, duplicate-start prevention and stop/status behavior.
- Local relay + Linux runner: heartbeat -> claim -> ComfyUI canary -> result collection.
- Live Colab and Kaggle, when an eligible runtime/relay are available: install the actual built artifact, doctor, heartbeat, one authorized small workflow, project collection, and interrupted-session handling. Record each host separately; CI mocks do not establish live deployment success.
- UI verification covers source/mask/ref selection, hosting presets, growl dismissal, image tab padding and screenshot.
- Inspect final diff for secrets, weights, personal paths in runnable configuration, drafts and unintended files.

## Risks / edge cases

- CPU endpoint 8188 has no checkpoints; use verified Desktop endpoint 8189 for weighted acceptance. Registry visibility does not prove model execution succeeds.
- Notebook runtime availability, Internet/secret grants, Linux binary compatibility and session termination can block remote acceptance. A reachable authenticated relay has not yet been configured.
- Colab free managed-runtime restrictions affect external worker use. Kaggle hosting restrictions and account limits must be checked for the chosen runtime; no keepalive or policy-bypass helpers.
- Notebook outputs may be shared; agent/download credentials must never appear there. Artifact checksums require a trusted pinned manifest, not an untrusted URL-supplied digest.
- Arbitrary editor JSON cannot be converted reliably without the exact node registry/frontend behavior. Paired exports preserve compatibility without guessing custom widget order.
- API/editor node/type agreement is validated, but execution semantics come from the API export; incompatible versions are surfaced rather than silently converted.
- Linux secret storage depends on an available/unlocked Secret Service. Headless runner uses its existing token configuration, not GUI keyring assumptions.
- retired hosted provider catalog visibility does not prove account access, API schema or cost. An unconfigured catalog card remains blocked for execution.
- An SDXL masked-edit example cannot guarantee specialized garment fidelity; the UI describes its actual capability.
- Ad-hoc signing does not provide Apple notarization. Linux GUI/Finder-style package interactions need platform-specific acceptance.

## Out of scope

Remote LoRA training, browser-profile automation, full private RunPod/S3 deployment, automatic weight/custom-node downloads, a universal visual graph editor, specialized try-on model installation, and automatic updates/notarized public releases.

## Sources

- Tauri build/release pipeline: https://v2.tauri.app/distribute/pipelines/github/
- ComfyUI save/API formats: https://github.com/Comfy-Org/docs/blob/main/development/api-development/workflow-api-format.mdx
- keyring 3.6.3 platform features: https://docs.rs/crate/keyring/3.6.3/source/Cargo.toml
- retired hosted provider catalog: https://example.invalid/retired-provider
- Outfit-change candidate (API schema/access unverified): https://example.invalid/retired-provider

- Google Colab runtime restrictions/lifecycle: https://research.google.com/colaboratory/faq.html
- Kaggle secret API: https://github.com/Kaggle/docker-python/blob/main/patches/kaggle_secrets.py
- Kaggle notebook deployment tooling: https://github.com/Kaggle/kaggle-cli/blob/main/docs/kernels.md
