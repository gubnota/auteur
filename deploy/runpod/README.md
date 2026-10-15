# RunPod ComfyUI agent

RunPod ComfyUI is the primary cloud execution target. Local and private nodes
reuse the same workflow wrappers and Jobs composer. Private RunPod uses a
**relay** connection and an outbound Linux agent; live cloud acceptance remains pending.

## Download the agent

Branch builds on GitHub publish `comfyui-agent-linux-x86_64`; GitLab publishes
`comfyui-agent-linux-x86_64-<branch>`. Version tags publish the same files with checksums.
Use `mymovie-agent-linux-x86_64.tar.gz`, its `.json` metadata and
`SHA256SUMS-agent.txt` from the **same build**. The archive contains the actual
ELF x86_64 agent, this guide, the runtime helper, profile preparer and tiny test workflows.
The new initialization bundle is in current source/CI builds; published v0.1.6
archives predate it. Use the archive and bootstrap from the same new build. It is built on Ubuntu 22.04; use a compatible
Linux x86_64 image with glibc 2.35 or newer.

For ARM64 Linux workers, use `mymovie-agent-linux-aarch64.tar.gz`, its `.json`
metadata and `SHA256SUMS-agent-aarch64.txt` instead. It is built and smoke-tested
on Ubuntu 22.04 ARM64 and requires an ARM64 image with glibc 2.35 or newer.
The executable inside either archive is named `mymovie-agent`; do not mix
architecture-specific archives or metadata. Colab/Kaggle notebooks use x86_64.

Verify the SHA-256 against metadata from a trusted build before extracting:

```sh
sha256sum mymovie-agent-linux-x86_64.tar.gz
tar -xzf mymovie-agent-linux-x86_64.tar.gz
chmod +x mymovie-agent
./mymovie-agent --version
```

## Prepare the private runtime

Start a pinned ComfyUI revision in an isolated Python environment. Keep its port
private. Read-only mode inspects an existing runtime; `--managed-runtime` allows
only reviewed, integrity-verified dependencies. It does not run arbitrary shell.
See [portable workflow setup](../../docs/WORKFLOW_SETUP.md) in the source checkout;
packaged workflows and profile preparer sit beside the extracted binary.

```sh
./mymovie-agent inventory --comfy-url http://127.0.0.1:8188 \
  --comfy-root /workspace/ComfyUI --python /workspace/ComfyUI/.venv/bin/python \
  --runtime-helper ./mymovie_runtime.py --data /workspace/mymovie-agent
```

Use ComfyUI's own root/interpreter, including `--model-paths` for its extra model
paths file. Review runtime fingerprint, nodes, installed weights and downloaded
plugin/wheel/model pins before initialization. App-managed installs are atomic,
confined and cached; plugin changes require an idle worker restart and re-review.
The first session must pass a weight-free mask canary before generation readiness.

The relay must run separately at an authenticated HTTPS address reachable by
both the Mac and the pod. It brokers jobs and results, so the pod needs outbound
HTTPS access but no public IP or exposed ComfyUI port. The relay's asset transport
uses persistent disk. Explicit S3 transfer manifests support model/LoRA downloads;
full private cloud/S3/GPU acceptance still needs a running deployment.

Current CI client archives include `mymovie-relay`; deploy it as a separate service for persistent RunPod use. Alternatively build it from this repository. Configure persistent
`MYMOVIE_RELAY_DATA`, `MYMOVIE_RELAY_BIND` behind your HTTPS reverse proxy,
distinct 24+ character `MYMOVIE_DESKTOP_TOKEN` and `MYMOVIE_AGENT_TOKEN`, and
`MYMOVIE_NODE_IDS=runpod-gpu0` (comma-separated for multiple workers). These
secrets belong in the host's secret environment, never in workflow JSON or Git.

## Connect the worker

Inject `MYMOVIE_AGENT_TOKEN` through the pod's secret environment, matching the
relay agent token. Launch under your container supervisor:

```sh
./mymovie-agent serve \
  --comfy-url http://127.0.0.1:8188 \
  --relay https://YOUR-RELAY-HOST \
  --node-id runpod-gpu0 \
  --data /workspace/mymovie-agent \
  --comfy-root /workspace/ComfyUI \
  --python /workspace/ComfyUI/.venv/bin/python \
  --runtime-helper ./mymovie_runtime.py \
  --cache /workspace/mymovie-cache
```

Persist the data directory: receipts prevent blind replay after session loss.
In MyMovie Studio → Connections, add **Private runner relay**, set its HTTPS URL
and node ID `runpod-gpu0`, and enter the separate desktop token using the secure
credential field. Use concurrency **1** for this worker. Check connection health,
then select workflows, run Inventory, Review initialization and Initialize reviewed
workflows. Save the profile in Settings → App Runner. Add `--managed-runtime`
only for an isolated app-managed session. In Generate/Jobs configure exact inputs,
review the batch and start. A changed runtime/session must initialize again.

For multiple GPUs, run one ComfyUI process and agent per GPU, each with isolated
CUDA visibility, local port, node ID and receipt directory. Add one relay
connection per node. Jobs sends these independently in parallel; it does not
combine GPU memory. The relay must allowlist every node ID.

Waiting jobs reopen paused and require Resume. An ambiguous submission remains
unknown until its remote task is reconciled; it must not be submitted again
blindly. A live GPU/RunPod roundtrip requires a reachable relay and your running
pod; a successful CI build alone does not establish runtime readiness.

## Where the HTTPS address comes from (Colab / Kaggle test)

After notebook startup, use the [desktop connection test](../../docs/WORKFLOW_SETUP.md#test-the-notebook-connection-from-your-desktop)
to verify the current relay URL/node ID with the desktop token. The guide includes
a standalone Python script and explains expected 200/401/404 responses. The relay
has no browser homepage: `/` and `/v1` return 404; use the authenticated node endpoint.

`127.0.0.1:8188` inside a notebook is private to that notebook. It is the address
for its agent, not the URL entered on the Mac. The Mac connects to the **relay**
address: a domain/reverse-proxy you configure on a reachable host. Build the relay
with `cargo build --release -p mymovie-relay`; put the executable behind that
host's authenticated HTTPS reverse proxy with persistent data and the environment
above. On RunPod a proxied HTTP port can host this relay separately; copy its HTTPS
Connect URL. Never use a public raw ComfyUI tunnel as the private relay URL.

For a disposable Colab/Kaggle test, use the bundled notebook. Its Configure cell uses
editable public test defaults matching **Settings → Node access**; no Secrets are
required by default. Environment and Secrets overrides are commented out. For a
private deployment replace both values consistently; the app stores overrides in
the OS vault. Existing connection credentials are updated separately.

Run all from the top: the notebook resolves the release checksum and installs its pinned ComfyUI, browser importer and cloudflared automatically. CPU and GPU runtimes are supported: `DEVICE = "auto"` falls back to one CPU worker without a GPU; `"cpu"` forces CPU; `"cuda"` requires the requested GPUs. Kaggle can run two independent CUDA workers, without pooled memory. For CPU, start with the weight-free mask canary; model generation may be very slow. `START_LOCAL_RELAY = True` starts the bundled relay on
`http://127.0.0.1:RELAY_PORT` (8787 by default) and supplies its node allowlist.
The agent connects locally; cloudflared exposes **only the authenticated relay**.
ComfyUI remains on loopback. Start prints the public relay URL and node IDs, never
tokens. In **Connections → Colab / Kaggle**, enable **Temporary Cloudflare tunnel ·
polling only**, paste that URL/IDs, check the token pair and add the connection.

Quick Tunnels are temporary and do not support SSE; desktop progress uses REST
polling. Stop kills owned agents, relay, tunnel and managed ComfyUI; Attach leaves
an existing ComfyUI running. Reconnect with new addresses/IDs after a new session.
For a persistent deployment use an external relay or a named tunnel with durable
data. No custom ngrok utility is needed. See [Cloudflare’s limits](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

Start with `mask-canary_api.json`, then the reviewed u2netp profile. Two Kaggle GPUs
use independent workers/ports and parallel jobs, with no shared VRAM. Model/plugin
installation remains an explicit, reviewed operation from the app.

### Editor workflow compilation

The agent archive includes `mymovie_workflow_compiler.py` and `workflow-compiler-requirements.txt`. Install them in a dedicated Python environment with Playwright Chromium. Configure `serve --workflow-compiler` and `--python`; the app can then prepare ordinary editor graphs through that worker. See [compiler setup](../../docs/WORKFLOW_SETUP.md). Compilation registers a preserved source and exports through an isolated ComfyUI frontend; it does not replace the active canvas or submit a job.

## Guided example initialization (0.1.16 agent)

Studio **Workflows → Examples · start here** ships original editor sources for a
weight-free connection test, SD 1.5 T4 and tiny background removal. Select the worker,
using **Run and install on** inside its workflow modal. Then **Setup → Initialize on
[instance] → Install & prepare on [instance]** reviews and runs the complete agent
sequence: dependencies, managed idle restart, compilation, publication and canary.
The relay stays online; all GPU workers must be idle to restart. Then explicitly
start selected queued jobs. See
[complete examples guide](../../docs/WORKFLOW_EXAMPLES.md). The matching agent and
notebook supervisor are required; old released binaries cannot provide new controls.
