# Generation acceptance — current main

Date: 2026-10-14. These checks concern the new main implementation, not the
published 0.1.5 binaries or installed 0.1.3 application. No paid cloud jobs ran.

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

The ARM64 macOS release build opened the completed disposable mask document.
Its Workflows screen displayed the Universal flag, completed job and custom
compatibility picker. Screenshot: [workflow-compatibility.png](screenshots/workflow-compatibility.png).
The Generate screenshot uses non-sensitive browser fixtures:
[generate.png](screenshots/generate.png).

Workspace unit/integration tests, frontend unit tests, six browser acceptance
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
