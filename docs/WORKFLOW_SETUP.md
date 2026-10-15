# Workflow compatibility and portable setup

Open **Workflows → workflow → Setup**. Set Unspecified,
Universal, Apple Silicon only, NVIDIA CUDA, AMD ROCm or CPU. Imported workflows
start Unspecified; a filename does not establish compatibility. Universal is an
explicit declaration, not an automatic conversion. Hardware restrictions are
checked against the live ComfyUI node before uploads. Each family variant keeps its own immutable graph, requirements and prepared profiles.

Add each model, LoRA, plugin archive and offline Python wheel. Record its exact
HTTPS source or private transfer object reference, SHA256, byte size, destination,
authorized license and architecture. Plugins require their full source commit.
No secrets or signed URLs belong in this metadata. Unresolved dependencies block
managed readiness. Direct connections can check installed registry models/nodes,
but cannot attest or install their filesystem dependencies.

## Import once, prepare for a saved target

In **Workflows**, import ordinary ComfyUI editor JSON or API JSON once. It is
pinned inside this movie and added to the local catalogue. In **Generate**,
choose **Browse workflow catalogue**, select a saved connection, then
**Prepare inputs / Refresh inputs**. Preparation reads the live node registry and uses
that instance’s frontend exporter for editor graphs. It does not submit a job.
Two image loaders produce two independent media cards; text, numbers, booleans,
choices and supported media loaders use typed controls. Linked inputs remain
links. Unsupported custom controls are marked for manual bindings.

Use **Inputs / Outputs** for saved labels, groups, order, advanced controls
and output selection. Ratio applies to an explicit width/height pair, including
active dynamic branch fields. Switching a dynamic branch requires re-export and
preparation; arbitrary plugin frontend behavior is not universally guaranteed.
**Export editor** preserves the source; **Export API** writes the prepared target
profile. Runtime schema changes require refreshing preparation before dispatch.

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

The receipt contains `graph` plus source/API/registry/frontend hashes. Compilation
loads the source into an isolated browser context, exports through ComfyUI, then
closes that context. Missing plugins, models and licenses remain reviewed setup
requirements; filenames do not identify trusted weight download URLs.

To publish an ordinary editor workflow into the selected ComfyUI saved-workflow
library, use **Workflow tools → Install in ComfyUI**, or run on the agent machine:

```sh
"$RUNNER_DIR/mymovie-agent" workflow-install \
  --workflow-source /path/to/workflow_editor.json \
  --workflow-name "MyMovie mask canary" --publish-to-comfyui \
  --comfy-url http://127.0.0.1:8188 --data /path/to/agent-data
```

Without `--publish-to-comfyui`, install only registers the immutable source in
agent-owned storage. Explicit publication uses `workflows/MyMovie/<name>-<hash>.json`,
refuses conflicting content, verifies readback and returns installed/reused/path/hash.
The active canvas stays untouched. Choose the same saved workflow/node and Prepare
in the app to export API; no repeated API file upload is needed.

If your Linux VM already has Chromium, add `--compiler-browser /usr/bin/chromium`
to workflow-compile. The 0.1.7 ARM64 utility was executed in OrbStack Debian with
this configuration against local CPU ComfyUI: publish/reuse and three-node API
export passed. See [acceptance evidence](GENERATION_ACCEPTANCE.md).

Before a new review/freeze, legacy or changed ComfyUI profiles refresh automatically.
Preparation errors retain the draft; correct the runtime and retry, or choose another
node. Existing attempts keep their frozen profile and final dispatch guard. Checks
ignore unrelated nodes and changing media lists; selected models must still exist.

Configure reusable slots in **Workflows → Inputs**. Name each input, set its media role,
and mark Optional/Advanced/Hidden. In **Outputs**, select returned files to keep;
ComfyUI still executes its original sink nodes. **Guide** stores an illustrated Markdown
README and collection. Export/import `.mymovie-workflow.json` to reuse wrappers in
another movie; prepare each destination separately. Enter private artifact sources
again in secure settings after import.

## Complete script and first-session order

Open **Setup → Complete setup script**. For Mac/Linux/SSH, choose Inspect, Connect,
Import original workflow, Export API, or Preview dependency installation. Set archive
path/public HTTPS URL and trusted SHA256 from the same build, ComfyUI root, instance
Python and local URL. Run the copied script on that ComfyUI machine, including through
SSH. It verifies archive bytes and OS/architecture before invoking the typed utility.
Export the setup/profile files first where requested; the preview command does not install.

For Colab/Kaggle, the modal provides the notebook Configure/start cells; it intentionally
excludes the Stop cell. Open the current notebook from the
[notebook guide](../deploy/runpod/README.md) and Run all with a CPU or GPU runtime. DEVICE="auto" selects CUDA when available, otherwise one CPU worker; DEVICE="cpu" forces CPU and DEVICE="cuda" requires the requested GPUs. Use the weight-free mask canary for CPU smoke tests; model generation can be very slow. Its defaults
install pinned base ComfyUI, the verified agent/relay and compiler, and cloudflared;
the predefined test keys require no Secrets configuration. Models and workflow plugins
are installed later from Studio. Kaggle uses independent processes/ports per GPU,
without pooled memory.

1. Connect the managed agent; open an example in **Workflows → Examples · start here**.
2. Select **Run and install on** inside the workflow modal. Check its address/node ID.
3. **Setup → Initialize on [instance]** reviews exact sources, sizes, licenses, destination
   paths and compatible Python wheels. It does not install anything yet.
4. **Install & prepare on [instance]** installs, restarts managed idle workers if required,
   prepares the original graph via the utility, publishes it to this ComfyUI library,
   and verifies the prepared workflow/session with a weight-free canary and collection.
   Progress is shown in one place. Verified files are reused; failures stop the sequence.
5. Assign media in Generate and Add to queue; select only intended tasks in Jobs to run.

**Install in ComfyUI** and **Prepare inputs** also use the instance selected inside
this modal. Connection errors name its URL: start that instance or select another.
Notebook ComfyUI localhost addresses refer to the notebook, so use its agent connection
from the desktop. HTTP Userdata permission errors are reported separately from offline nodes.

See [illustrated examples and complete setup](WORKFLOW_EXAMPLES.md), including the
matching agent build requirement and model/license details. Legacy manually prepared
profiles remain supported. Guided reviews bind the current session, runtime and exact
workflow set; changed selections require reviewing again.

The **HTTPS address** belongs to the authenticated relay, not the notebook's 127.0.0.1.
Deploy the relay behind HTTPS or expose it with a configured named tunnel. Put its origin
and allowlisted worker ID in Connections. Keep ComfyUI private. Temporary Quick Tunnels
support polling only and require the notebook's explicit opt-in. See the relay guide for
its launch/configuration; no new ngrok utility is required.

## Test the notebook connection from your desktop

Keep the notebook running. Copy its current **Relay URL** and **Node ID** into
**Connections → Colab / Kaggle**. For a `trycloudflare.com` address, enable
**Temporary Cloudflare tunnel · polling only** before connecting. The Relay URL
field takes only the base address, without `/v1` or the node path. The desktop
token must match **Settings → Node access → MYMOVIE_DESKTOP_TOKEN** and the relay's
configuration; the agent token is not used for this test.

To test independently of Studio, save the following as `test_colab.py` on your
desktop computer. It uses Python 3's standard library and the same predefined
public test token as the app/notebook, so no packages or notebook variables are
needed. For a custom token, set `MYMOVIE_DESKTOP_TOKEN` in your local environment
to the value from Settings → Node access. Tokens belong in the Authorization
header, never the URL.

```python
import argparse
import os
import urllib.error
import urllib.request

parser = argparse.ArgumentParser(description="Test a MyMovie notebook relay")
parser.add_argument("relay_url", help="Current HTTPS relay origin, without /v1")
parser.add_argument("node_id", help="Node ID printed by the running notebook")
args = parser.parse_args()

# Public test default shared with Studio and the notebook.
token = os.environ.get(
    "MYMOVIE_DESKTOP_TOKEN",
    "gkBVLSAztmflyUU5JtWMQc_3owNVKFvNa2XztixRqbg",
)
request = urllib.request.Request(
    f"{args.relay_url.rstrip('/')}/v1/nodes/{args.node_id}",
    headers={"Authorization": f"Bearer {token}"},
)
try:
    with urllib.request.urlopen(request, timeout=30) as response:
        print("HTTP:", response.status)
        print(response.read().decode())
except urllib.error.HTTPError as error:
    print("HTTP:", error.code)
    print(error.read().decode(errors="replace"))
except (urllib.error.URLError, TimeoutError) as error:
    print("Connection failed:", error)
```

Run from your Mac/Linux terminal (replace both values with the current notebook
output; temporary URLs and node IDs change between sessions):

```sh
python3 test_colab.py 'https://YOUR-CURRENT-ADDRESS.trycloudflare.com' 'YOUR-NODE-ID'
```

| Result | Meaning / next step |
| --- | --- |
| HTTP 200, `comfy.connected: true` | Desktop → tunnel → relay → agent → ComfyUI connectivity succeeds. Continue with Inventory → Review initialization → Initialize workflow. |
| HTTP 200, `connected: false` or `state: offline` | Relay authentication succeeds, but the agent heartbeat is missing/stale. Check the notebook's running processes and logs. |
| HTTP 200, `comfy.connected: false` | Agent reports that ComfyUI is unavailable. Check the worker process and its local port. |
| HTTP 401, `Invalid authentication` | Use the desktop token matching the running relay. Changing Settings alone does not reconfigure an already running relay. |
| HTTP 404, `Node missing` | Copy the current node ID; it must be in the relay's allowlist. |
| HTTP 502 or Cloudflare error page | Check that the tunnel and local relay are still running and use the latest printed URL. |
| DNS failure / timeout | Check connectivity and whether this temporary session/address still exists. |

Opening `/` or `/v1` in a browser returns 404 because neither route exists.
The real test is **GET `/v1/nodes/<node-id>`** with
**`Authorization: Bearer <desktop-token>`**; opening that endpoint without the
header returns 401. A successful health response confirms connectivity, not
workflow dependencies, successful initialization or a completed GPU generation.
The nested `comfy.initialization` description is not an initialization receipt;
use the agent's Inventory and reviewed setup actions for filesystem installation.

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
workflows with prepared API graphs or pending editor sources, exact bindings and setup requirements. Normal editor imports retain their original JSON; preparation creates a separate
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

## Durable initialization and remote console

See [Background setup, recipes and remote console](NODE_ACTIVITY.md) for global
progress, cancel/reconnect, shared-GPU scheduling, editable initialization steps
and private agent terminal setup. These require a matching 0.1.18 agent and relay.
