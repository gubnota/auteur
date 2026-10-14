# Generation acceptance — current main

Date: 2026-10-14. Checks below distinguish published 0.1.6 from current 0.1.9. Publication is recorded in CI_RELEASES. No paid cloud jobs ran.

## 0.1.9 RunningHub compatibility regression

- Latest Redux/r01 failure stopped at the app hardware guard before any media staging or task creation; remote ID absent. The workflow's CUDA flag had inherited the default backend restriction.
- RunningHub Workflow and AI App now accept unspecified/universal/cuda; Apple Silicon/ROCm/CPU/invalid remain rejected. Seven provider tests and six job tests plus doc tests passed. Direct ComfyUI/relay behavior unchanged.
- No paid provider retry performed; this proves admission and mocked provider contracts, not live hosted execution. Old failure receipts remain in history.
- Native ARM64 build, installed version 0.1.9 and strict ad-hoc signature verified; saved movie reopened. Previous app preserved at `/private/tmp/MyMovie Studio-0.1.8-before-0.1.9.app`.
- Native Reuse as draft restored both exact image slots and r01; review opened with Add to queue and Run now available. Left at review without submission. Private verification screenshot retained only in `/private/tmp/mymovie-runninghub-review-0.1.9.png`.

## 0.1.8 installed acceptance

- Installed ARM64 release, version and strict ad-hoc signature verified; previous 0.1.7 app preserved in `/private/tmp/MyMovie Studio-0.1.7-before-0.1.8.app`.
- Backed up personal movie, then configured Redux through native controls: Workflow family/2110376761482002434, 19.image face reference, 86.image base photograph. LTX mapping unchanged. Gallery assignments and drafts persisted after reopening; review displayed both exact inputs and separate Add to queue / Run now controls. No job submitted.
- Refreshed local Klein against ComfyUI 0.40.0/MPS: persisted 37 inputs and scope-v1 registry hash. Fixed preparation panic on one-element model inventory schemas; regression test passes. Old failed-job errors remain historical; Clear finished removed the old row without deleting history.
- Disposable movie: bulk Trash/Restore of three materials passed; repeated video import reused its asset identity. Renders and Library display the same render assets. Native screenshot: [media-workflow-0.1.8.png](screenshots/media-workflow-0.1.8.png).
- Frontend: 20 unit tests and 15 mocked browser acceptance tests passed; TypeScript/Vite and native release builds passed. Rust workspace: all 49 tests and doc tests passed, including the inventory regression.
- Public artifacts remain v0.1.6 until a separately authorized tag/release. Paid RunningHub and cloud GPU acceptance remain open.

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

## Studio refinement, real local and ARM64 acceptance (0.1.7)

- Native production app opened a disposable movie, selected the saved editor mask and local node, then **Add to queue**. No job ran until explicit start. Welcome/reopen preserved the idle queued batch. **Run queued batch** completed and collected a 64 × 64 PNG (559 bytes).
- Attempt `ee179dd7-0e15-4f23-968d-56861dcb1353`; run `1a71e76d-2917-43a9-8960-96156e84c6e7`; prompt `017face2-ec77-40c9-a4e5-24f41d7c2492`.
- API SHA256 `ef8baa085837cadefba7fbbb635d01c722bf5ecfcb57e8d67e465bbd1cc31f6a`; result SHA256 `c1201a3162433d8c5df3d2dcbfb5a6bdc64ae4d1573a2c41180c64362cc4ab2f`.
- Scoped registry `scope-v1:a95fdc2148b21ff5ede10e092737832ee30b88952848848405b79823297e32e3`.
- Native screenshot: [native-queue-0.1.7.png](screenshots/native-queue-0.1.7.png). Later queue editing screenshot uses mocked provider fixtures: [jobs-queue-edit.png](screenshots/jobs-queue-edit.png).
- Native Library imported a synthetic one-second video and generated a real bounded JPEG poster at `media/derived/posters/<source-sha>.jpg`; original remained unchanged.
- Mac utility published the unchanged FaceSwap editor source into ComfyUI Userdata at `workflows/MyMovie/Flux2_Klein_FaceSwap-d4b5e41e606c42b0.json`, verified readback, and returned installed=true/loadedCanvas=false. Source SHA256 `d4b5e41e606c42b0944603e012e52c888f95b839b437157643463160bd3d683f`. This publication did not submit a new FaceSwap generation or replace the active canvas.
- Actual published v0.1.6 Linux ARM64 artifact ran doctor in OrbStack Debian (aarch64, glibc 2.41) against local CPU ComfyUI. Current 0.1.7 ELF was separately built in the Rust 1.90 Bookworm image, then executed in the VM.
- 0.1.7 VM utility published/reused `workflows/MyMovie/MyMovie_mask_canary-8032a4936f6b188a.json` with reused=true and compiled the three-node API using isolated Python/Chromium. Source SHA256 `8032a4936f6b188a9522a70288b1c07abcb18b7ac4c76cdaf817e5dab6214447`; API SHA256 `93850c796b13989e0029365bd1fd707fcea57b24a8f795637c75300a42533714`; frontend SHA256 `13f8f99e0b7a2ec0f9248e9f8935671a3bed11058793dc94d3167c10c8f26892`; compiler `frontend-export-v1`. CPU server: ComfyUI 0.3.76 / frontend 1.32.10.
- Cloud GPU/relay/S3 roundtrip, paid RunningHub generation, foreign desktop launch and release signing remain pending. No cloud resources or large weights were downloaded for the VM test.

### Native bottom queue cleanup — 0.1.7

Installed the rebuilt app in /Applications; Clear finished removed seven completed mask attempts from the bottom queue. All seven receipts remained in Jobs history across three finished batches, and reopening the same disposable movie still showed zero bottom entries. No job records or render files were deleted. Screenshot: `screenshots/native-queue-cleared-0.1.7.png`. Mixed terminal/active/unknown behavior is covered by the browser fixture test.
