# Generation acceptance — current main

Date: 2026-10-14. These checks concern the 0.1.6 implementation. Publication is recorded in CI_RELEASES. No paid cloud jobs ran.

## Real local executions

The native Rust integration example creates a disposable `.mymovie`, imports
media, resolves exact workflow bindings, checks compatibility, uploads through
the ComfyUI adapter, submits, polls and collects hash-verified results with
durable receipts and provenance. This is provider/document integration evidence;
it is not a claim that generation was submitted through the graphical UI.

| Test | Runtime | Result |
| --- | --- | --- |
| Flux2_Klein_4B_AppleSilicon_FaceSwap | Local ComfyUI 0.40, MPS | Completed; two results imported |
| Portable mask canary | Same local instance, core nodes | Completed; one 64 × 64 PNG imported |

The FaceSwap test used the approved non-explicit portrait and face reference.
Personal inputs, graphs, documents and outputs stay in ignored local artifacts.
No existing models or plugins were installed, overwritten or removed.
The original editor workflow remained unchanged, with SHA256
`6680f3476f7fe3450144e1844caef5a72ed5646507e88ce5d8247fb3ddba079f`.

FaceSwap receipt evidence:
- ComfyUI prompt ID: `6d51154d-cad4-451c-9f5c-b0bedb2fb9ff`.
- Bound workflow version: `16480798f145e841af74bb6f1cdcf42df70cef758e9a216c63ae1075e79c3092`.
- Main result: 2,814,305 bytes, SHA256 `4022cf7a9edbc53af802b97f4d80e7fe6fd31439c9204a450441d25252f2a2c4`.
- Second result: 58,155 bytes, SHA256 `5fdfeec14c6112ef660f0e43e4f7e894bbb23cd77b5fcc282cc058f24ddf5e3e`.

Mask receipt evidence:
- ComfyUI prompt ID: `a14ae7d8-f3eb-4442-ab13-da3e45386d21`.
- Bound workflow version: `b90468fd452b4843710d84b19be4be796d39c2af41a557172676c7150f0a19ad`.
- Result: 439 bytes, SHA256 `d50112bfbd3c256fbfd1c2734be980bcbb33df651ffa5f2cf6bd7237be36e84f`.

## Native and automated checks

The installed 0.1.6 app also submitted a real job through Generate → Jobs
review → Validate/start. The saved mask editor workflow and local node were
reused without uploading the workflow again. Its frozen inputs were width 64,
height 114 and mask value 0.5. Renders collected the resulting 64 × 114 PNG
inside the movie and displayed the generation provenance.

- Attempt: `2336b2bd-5d3d-433e-a6b3-90d5cc9cb307`.
- ComfyUI prompt: `8cdb6e8b-9b37-4a30-ac8d-aa172c6ff1f3`.
- Workflow version: `ef8baa085837cadefba7fbbb635d01c722bf5ecfcb57e8d67e465bbd1cc31f6a`.
- Result: 613 bytes, SHA256 `70a20b299d4007b09c6074c6c36aea72e3977d6eaa60876cdfe5bf59eb1d6dd6`.
- Native receipt screenshot: [native-job-0.1.6.png](screenshots/native-job-0.1.6.png).

The ARM64 macOS release build opened the completed disposable mask document.
Its Workflows screen displayed the Universal flag, completed job and custom
compatibility picker. Screenshot: [workflow-compatibility.png](screenshots/workflow-compatibility.png).
The Generate screenshot uses non-sensitive browser fixtures:
[generate.png](screenshots/generate.png).

Workspace unit/integration tests, frontend unit tests, seven browser acceptance
tests, Python packaging/runtime/profile tests and the native build pass. Browser
provider replies are mocked; they prove UI behavior, not live cloud execution.
Exact counts and commands are recorded in [TASK_LOG.md](TASK_LOG.md).

## Remaining live checks

- Colab/RunPod needs a reachable authenticated relay, active worker and current
  branch artifact. No current cloud session URL was available.
- Live managed model/plugin/wheel installation and learned u2netp removal have
  not run on a cloud GPU. The included weight-free mask is the first smoke test.
- Local-plus-cloud parallel dispatch and two real Kaggle GPU workers remain
  unverified. Existing queue tests verify endpoint isolation and ordering.
- RunningHub charged generation, cross-platform desktop runtime launch and
  signing/notarization remain separate acceptance steps.

See [WORKFLOW_SETUP.md](WORKFLOW_SETUP.md) for reviewed dependency metadata,
portable activation commands, and first-session initialization. See
[RunPod instructions](../deploy/runpod/README.md) for relay addresses and startup.

## Catalogue/compiler acceptance, 0.1.6

- Installed native 0.1.6 imported a normal mask editor source, prepared four inputs/one output, applied 9:16 (64×114), exported the three-node API and saved it to the global catalogue. [Native screenshot](screenshots/native-workflow-0.1.6.png). Saved 9:16 dimensions restored after quitting/reopening. The installed compiler uses a persistent app-support environment and preparation passed again after that path change. Export preserves prepared workflow defaults; draft values belong to the frozen job snapshot.

- Native agent CLI compiled the unchanged 29-node FaceSwap editor graph against local ComfyUI (1,894 registered classes), without submitting during conversion.
- Compiler frontend hash: `a98d776a71f61b5ed006b7fdc1d7339ef5a3642a41c6e4dd1ac16d12ba6c85de`; compiler version `frontend-export-v1`.
- Updated Rust pipeline used that profile, verified the current registry and completed prompt `41b53fd7-bab8-49e0-a3c8-dc0c6d5d0956`, collecting two results with hashes/provenance into a disposable movie.
- Native UI prepared 37 fields and two image loaders; newer V3 COMBO choices and active dotted dimensions were then fixed and regression-tested.
- Browser acceptance verifies searchable catalogue selection, two media slots, dotted width/height ratio application, saved layout, reopen and second draft without a fresh upload. Screenshot: [workflow-catalogue.png](screenshots/workflow-catalogue.png).
- Arbitrary third-party dynamic widgets, primitive/reroute/bypass/subgraph combinations are delegated to the real frontend but have not all received individual live fixtures. This is not a universal custom-plugin compatibility claim.
