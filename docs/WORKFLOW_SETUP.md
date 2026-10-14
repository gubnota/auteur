# Workflow compatibility and portable setup

Open **Workflows → workflow → Compatibility & initialization**. Set Unspecified,
Universal, Apple Silicon only, NVIDIA CUDA, AMD ROCm or CPU. Imported workflows
start Unspecified; a filename does not establish compatibility. Universal is an
explicit declaration, not an automatic conversion. Hardware restrictions are
checked against the live node before uploads. Hosted APIs do not expose enough
hardware inventory to verify restrictive flags.

Add each model, LoRA, plugin archive and offline Python wheel. Record its exact
HTTPS source or private transfer object reference, SHA256, byte size, destination,
authorized license and architecture. Plugins require their full source commit.
No secrets or signed URLs belong in this metadata. Unresolved dependencies block
managed readiness. Direct connections can check installed registry models/nodes,
but cannot attest or install their filesystem dependencies.

## Import once, prepare for a saved target

In **Workflows**, import ordinary ComfyUI editor JSON or API JSON once. It is
pinned inside this movie and added to the local catalogue. In **Generate/Jobs**,
choose **Browse workflow catalogue**, select a saved connection, then
**Prepare / refresh inputs**. Preparation reads the live node registry and uses
that instance’s frontend exporter for editor graphs. It does not submit a job.
Two image loaders produce two independent media cards; text, numbers, booleans,
choices and supported media loaders use typed controls. Linked inputs remain
links. Unsupported custom controls are marked for manual bindings.

Use **Customize input form** for saved labels, groups, order, advanced controls
and output selection. Ratio applies to an explicit width/height pair, including
active dynamic branch fields. Switching a dynamic branch requires re-export and
preparation; arbitrary plugin frontend behavior is not universally guaranteed.
**Export editor** preserves the source; **Export API** writes the prepared target
profile. Runtime schema changes require refreshing preparation before dispatch.
RunningHub reuses a saved authorized hosted deployment, not arbitrary graph uploads.

### Compiler prerequisites (Mac or Linux)

The agent archive includes the compiler helper and pinned requirements, not
Python or Chromium. Install once in a dedicated environment on the machine
performing compilation. On the Mac, set **Settings → General → Compiler Python**
to its Python path; an optional browser executable override supports an existing
compatible Chromium installation. For an outbound worker, set these paths on its
`serve` command (see `mymovie-agent serve --help`).

```sh
RUNNER_DIR="/path/to/extracted-agent"
COMPILER_ENV="/path/to/mymovie-compiler-env"
python3 -m venv "$COMPILER_ENV"
"$COMPILER_ENV/bin/python" -m pip install -r "$RUNNER_DIR/workflow-compiler-requirements.txt"
"$COMPILER_ENV/bin/python" -m playwright install chromium
# Linux: install Chromium system libraries with your administrator, or use
# python -m playwright install --with-deps chromium in a reviewed build environment.

"$RUNNER_DIR/mymovie-agent" workflow-compile \
  --comfy-url http://127.0.0.1:8188 --data /path/to/agent-data \
  --workflow-source /path/to/workflow_editor.json \
  --workflow-compiler "$RUNNER_DIR/mymovie_workflow_compiler.py" \
  --python "$COMPILER_ENV/bin/python" > compilation-receipt.json
```

The receipt contains `graph` plus source/API/registry/frontend hashes. The CLI
also offers `workflow-inspect` and `workflow-install`; check their `--help` for
required paths. Installation registers an immutable source in agent-owned
storage. It does not replace the active ComfyUI canvas or write a user’s workflow
folder. Compilation loads it into an isolated temporary browser context, exports
through ComfyUI, then closes that context. Missing plugins, models and licenses
remain reviewed initialization requirements; filenames do not identify trusted
weight download URLs.

## Portable paths and activation

On the **machine running ComfyUI**, use that instance's Python environment and
root. For Desktop, use the instance interpreter, not the system Python. The
helper reads ComfyUI's `folder_paths` and optional extra-model-paths configuration;
it uses the first effective destination and checks all configured paths for
already installed matching weights. Categories include `diffusion_models`,
`text_encoders`, `vae`, `loras`, `checkpoints`, and plugin-specific categories.
Unknown categories must be configured before installation. Existing conflicting
files are never silently overwritten. Mac, Linux and Windows paths are accepted
by the Python helper; published agents target Linux x86_64/ARM64 and macOS Intel/Apple Silicon.
Download the matching archive; a Linux binary cannot run on a Mac. For Windows, activate its instance Python
and use `python.exe` paths with the helper; a Windows outbound agent is not shipped.

Export **workflow-setup.json** from the workflow modal. It contains a list of
workflows with API graphs, exact bindings and setup requirements. Normal editor imports retain their original JSON; preparation creates a separate
target-specific API profile.

```sh
# Replace these three paths with paths on this ComfyUI machine.
COMFY_ROOT="/path/to/ComfyUI"
COMFY_PYTHON="/path/to/ComfyUI/.venv/bin/python"
RUNNER_DIR="/path/to/extracted-agent"

"$RUNNER_DIR/mymovie-agent" inventory --comfy-root "$COMFY_ROOT" \
  --python "$COMFY_PYTHON" --runtime-helper "$RUNNER_DIR/mymovie_runtime.py" \
  --comfy-url http://127.0.0.1:8188 > inventory.json

# For the weight-free mask smoke test; review profile.json before use.
"$COMFY_PYTHON" "$RUNNER_DIR/prepare-workflow-profile.py" \
  inventory.json profile.json --bundle "$RUNNER_DIR"

# Review only. Mac's existing ComfyUI stays read-only.
"$RUNNER_DIR/mymovie-agent" provision --comfy-root "$COMFY_ROOT" \
  --python "$COMFY_PYTHON" --runtime-helper "$RUNNER_DIR/mymovie_runtime.py" \
  --comfy-url http://127.0.0.1:8188 --profile profile.json \
  --workflows workflow-setup.json

# Add --model-paths /path/to/extra_model_paths.yaml to both commands when needed.
# On an app-managed Linux runtime, add --apply --managed-runtime after review.
```

The CLI is a standalone inspection/test tool. Every invocation gets a new session;
use a long-running `serve` agent and the app's Connections initialization controls
for persistent session readiness. In Settings → App Runner save the reviewed
profile, then Connections → Inventory → Review initialization → Initialize
reviewed workflows. Pin the inventory runtime fingerprint (or Docker image
`sha256` digest). Plugin/wheel installation requests restart; restart only an idle
managed worker, inspect the changed runtime, update its pin and initialize again.
Ready is granted only after the canary succeeds in this session. Workflow, bindings,
runtime or dependency changes invalidate that attestation.

## Tiny tests included in the new agent artifact

1. `mask-canary_api.json` and `_editor.json`: SolidMask → MaskToImage → SaveImage,
   64 × 64, no weights/plugins/GPU needed. This tests transport, execution and
   result collection; it is a fixed mask, not learned segmentation.
2. `rembg-u2netp_api.json` and `_editor.json`: LoadImage → MyMovieU2netp → white
   background image plus foreground mask. CPU inference; 4,574,861-byte u2netp
   weight. It produces a foreground mask, not a transparent PNG.

The artifact includes a minimal original `mymovie_rembg` plugin and a pinned
plugin descriptor. The upstream model descriptor records its public download,
SHA256 and license. Install all runtime dependencies explicitly: numpy, Pillow
and torch come from the pinned ComfyUI environment; the plugin also needs a
compatible **onnxruntime CPU** wheel and its complete transitive dependencies.
In a preparation environment with the same Python/platform, choose a reviewed
onnxruntime version and download its binary wheels:

```sh
# Set REVIEWED_ONNXRUNTIME_VERSION to the version you reviewed for this runtime.
"$COMFY_PYTHON" -m pip download --only-binary=:all: --dest wheelhouse \
  "onnxruntime==$REVIEWED_ONNXRUNTIME_VERSION"
"$COMFY_PYTHON" "$RUNNER_DIR/prepare-workflow-profile.py" \
  inventory.json rembg-profile.json --bundle "$RUNNER_DIR" --wheelhouse wheelhouse \
  --wheel-license-review wheel-licenses.json
```

Review every wheel's license and platform compatibility before using the resulting
profile. Its hashes pin the exact local bytes; they do not establish publisher
trust. Upload each wheel and the `mymovie-rembg-<commit>.tar.gz` to private transfer
storage using the descriptor's `sourceRef` names. Supply signed URLs only via
`MYMOVIE_TRANSFER_MANIFEST` (the existing storage manifest contract), outside
workflow/project files. Alternatively replace references with public immutable
HTTPS artifact URLs after verifying hashes. Installation uses offline
`pip --no-index --no-deps`; an incomplete wheelhouse fails instead of fetching code.
Do not use a wheel built for a different Python version or architecture.

For ComfyUI revisions without `background_removal`, create an extra paths file
with an absolute destination under the managed ComfyUI models directory:

```yaml
mymovie:
  base_path: /path/to/ComfyUI
  background_removal: models/background_removal
```

Pass this file to ComfyUI with `--extra-model-paths-config` and the agent with
`--model-paths`. The agent resolves the configured path; the plugin never downloads
weights implicitly. Bind `1.image` as an image source before submitting removal.
Use a disposable document and inspect the returned image/mask and result hashes.

References: [ComfyUI examples](https://github.com/comfyanonymous/ComfyUI_examples),
[rembg u2netp source](https://github.com/danielgatis/rembg/blob/main/rembg/sessions/u2netp.py),
[U-2-Net license](https://github.com/xuebinqin/U-2-Net/blob/master/LICENSE).
