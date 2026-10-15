# Local ComfyUI test nodes: OrbStack CPU and Apple Silicon MPS

This guide creates a separate ComfyUI instance on a non-standard port so the
existing installation at `127.0.0.1:8188` stays untouched. Use the CPU node for
connection, registry, workflow import, queue and lightweight mask checks. Use
the Mac MPS node to check Apple Silicon workflows and real local inference.

ComfyUI uses PyTorch MPS on Apple Silicon; “MPS” is the Metal backend (not
CUDA). The OrbStack machine/container uses CPU, not the Mac GPU. Workflow
compatibility still depends on its custom nodes, model files, and supported
precision. A connection test does not mean every workflow can run on either
node.

## Option A — CPU ComfyUI in OrbStack

Start OrbStack, then open Terminal in the repository. This builds the included
weight-free CPU canary image and publishes it only on the Mac loopback interface
at port `8192`:

```sh
cd deploy/cpu
docker build -t auteur-comfy-cpu .
docker run -d --name auteur-comfy-cpu \
  -p 127.0.0.1:8192:8188 \
  -v auteur-comfy-input:/opt/comfy/input \
  -v auteur-comfy-output:/opt/comfy/output \
  auteur-comfy-cpu
```

Check `http://127.0.0.1:8192/system_stats` in a browser. The ComfyUI web page
is at `http://127.0.0.1:8192/`. In Studio → Connections, add a ComfyUI
connection at `http://127.0.0.1:8192`; select it in Workflows before **Prepare
inputs**, installing a workflow, or making a test job. Run the included
weight-free mask canary first. This checks CPU queueing and result collection
without downloading a model.

Stop and restart the container with:

```sh
docker stop auteur-comfy-cpu
docker start auteur-comfy-cpu
```

To remove this test container and its persisted input/output volumes after
testing:

```sh
docker rm -f auteur-comfy-cpu
docker volume rm auteur-comfy-input auteur-comfy-output
```

OrbStack runs the Docker engine in its Linux VM; the container's `8188` is
forwarded to Mac-only `127.0.0.1:8192`. If Docker says it cannot reach its
daemon, start OrbStack first. See [OrbStack's quick start](https://docs.orbstack.dev/quick-start).

## Option B — fresh ComfyUI on M2 Max (Apple Silicon MPS)

Install into a new folder and Python environment. This does not change your
existing ComfyUI Desktop or its models. The example uses port `8191`.

```sh
cd "$HOME"
git clone https://github.com/Comfy-Org/ComfyUI.git ComfyUI-mymovie-mps
cd "$HOME/ComfyUI-mymovie-mps"
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install --pre torch torchvision torchaudio
python -m pip install -r requirements.txt
python -c 'import torch; print("MPS available:", torch.backends.mps.is_available())'
python main.py --listen 127.0.0.1 --port 8191
```

Use a recent Python supported by ComfyUI and its custom nodes. If the MPS check
prints `False`, resolve the PyTorch/macOS environment before treating this as a
GPU test. The official ComfyUI project currently recommends a PyTorch nightly
for Apple Silicon; consult its [manual install notes](https://github.com/Comfy-Org/ComfyUI#apple-mac-silicon)
and [Apple's PyTorch/Metal guide](https://developer.apple.com/metal/pytorch/)
if the install commands change. Keep this ComfyUI folder, `.venv`, `user`, and
`models` separate from your other installation.

In Studio → Connections, add a ComfyUI connection at
`http://127.0.0.1:8191`. Confirm its registry is populated, select it in
Workflows, and choose **Prepare inputs / Refresh inputs**. Import an editor
workflow once, prepare it against this node, configure Inputs/Outputs, then
create a small job. For MPS, use a workflow explicitly compatible with Apple
Silicon and start with a small image/short clip and a model that fits unified
memory. CUDA-only custom nodes or CUDA-only workflow profiles will not become
MPS compatible by changing the node URL.

## Running the agent against the local node

There are two levels of testing:

1. A direct ComfyUI connection tests registry discovery, workflow preparation,
   installation in ComfyUI's saved-workflow library, job submission, history,
   and result collection. It does not provide remote dependency installation,
   custom scripts, or the interactive agent console.
2. Studio's agent initialization, cancellation/progress, reconnect, dependency
   setup, and console need a running `mymovie-agent` connected to an
   authenticated HTTPS relay. For these full checks, run the agent on the Mac
   against the fresh MPS ComfyUI root. The OrbStack container is a good direct
   CPU workflow target; agent-managed filesystem installs need an agent running
   inside that Linux runtime with its matching Linux binary. Only the relay
   needs a temporary HTTPS address; keep ComfyUI bound to loopback. Use a
   private token pair for console/custom-script checks.

### Agent workflow commands without a relay

Build the current agent utilities in the repository:

```sh
cargo build --release -p mymovie-agent -p mymovie-relay
```

Set paths for the fresh MPS ComfyUI. Substitute `8192` for the OrbStack CPU
node, or `8191` for the MPS instance:

```sh
export COMFY_URL=http://127.0.0.1:8191
export COMFY_ROOT="$HOME/ComfyUI-mymovie-mps"
export AGENT_BIN="$PWD/target/release/mymovie-agent"
export AGENT_DATA="$HOME/Library/Application Support/MyMovie/local-mps-agent"
mkdir -p "$AGENT_DATA"
```

Inspect the local runtime, then test immutable workflow registration and
publication using an editor-format workflow JSON:

```sh
"$AGENT_BIN" doctor --comfy-url "$COMFY_URL"
"$AGENT_BIN" inventory --comfy-url "$COMFY_URL" \
  --comfy-root "$COMFY_ROOT" --python "$COMFY_ROOT/.venv/bin/python" \
  --runtime-helper "$PWD/deploy/runner/mymovie_runtime.py" --data "$AGENT_DATA"
"$AGENT_BIN" workflow-install --comfy-url "$COMFY_URL" \
  --workflow-source /absolute/path/to/workflow_editor.json \
  --workflow-name "Local MPS test" --publish-to-comfyui --data "$AGENT_DATA"
```

Compilation of ordinary editor JSON also requires the agent's compiler helper,
Python compiler requirements, and Playwright Chromium. Follow the
[compiler setup](WORKFLOW_SETUP.md#compiler-prerequisites-mac-or-linux) before
testing `workflow-compile`. `workflow-install` publishes the original editor
workflow to the chosen ComfyUI library; it does not replace the active canvas
or submit a job.

### Full Studio agent, setup and console path

This path exposes the relay, not the ComfyUI port. Use it only for a temporary
local test session; the temporary tunnel address changes after it stops.

1. In Studio → Settings → Node access, create a **private**, distinct desktop
   token and agent token (at least 24 characters). Do not use the shared
   predefined test pair for the console. Keep the values in the OS vault.
2. In one terminal, start the relay on loopback port `8789`. Enter the same
   private values when prompted; they are not saved in shell history:

   ```sh
   cd /path/to/auteur
   export MYMOVIE_RELAY_BIND=127.0.0.1:8789
   export MYMOVIE_NODE_IDS=local-mps-0
   printf 'Private desktop token: '; read -r -s MYMOVIE_DESKTOP_TOKEN; printf '\n'; export MYMOVIE_DESKTOP_TOKEN
   printf 'Private agent token: '; read -r -s MYMOVIE_AGENT_TOKEN; printf '\n'; export MYMOVIE_AGENT_TOKEN
   cargo run --release -p mymovie-relay
   ```

3. In a second terminal, start a Cloudflare Quick Tunnel to the loopback relay:

   ```sh
   brew install cloudflared
   cloudflared tunnel --url http://127.0.0.1:8789
   ```

   Copy the printed `https://…trycloudflare.com` address. Do not tunnel port
   `8191`, `8192`, or ComfyUI's `8188`.
4. In a third terminal, start the local agent. Enter the private agent token
   again at the prompt. Use `COMFY_URL` and `COMFY_ROOT` for the chosen instance.
   Add `--allow-console` only for this private test pair:

   ```sh
   cd /path/to/auteur
   export COMFY_URL=http://127.0.0.1:8191
   export COMFY_ROOT="$HOME/ComfyUI-mymovie-mps"
   export AGENT_BIN="$PWD/target/release/mymovie-agent"
   export AGENT_DATA="$HOME/Library/Application Support/MyMovie/local-mps-agent"
   printf 'Private agent token: '; read -r -s MYMOVIE_AGENT_TOKEN; printf '\n'; export MYMOVIE_AGENT_TOKEN
   "$AGENT_BIN" serve --comfy-url "$COMFY_URL" \
     --relay https://YOUR-QUICK-TUNNEL.trycloudflare.com \
     --node-id local-mps-0 --data "$AGENT_DATA" \
     --comfy-root "$COMFY_ROOT" --python "$COMFY_ROOT/.venv/bin/python" \
     --runtime-helper "$PWD/deploy/runner/mymovie_runtime.py" \
     --managed-runtime --allow-console
   ```

   Keep the same agent binary, helper files, and repository checkout available.
   This MPS agent can use the Mac filesystem to install reviewed files into the
   fresh MPS root. The OrbStack CPU container can use direct ComfyUI actions;
   for managed setup there, run a Linux agent inside its Linux runtime, mount
   its actual ComfyUI root, assign node ID `local-cpu-0`, and add that ID to
   `MYMOVIE_NODE_IDS` before restarting the relay.
5. In Studio → Connections, add a **Private runner** using the temporary HTTPS
   relay URL, the exact node ID, and the private desktop token. Turn on
   **Temporary Cloudflare tunnel · polling only**. Confirm the node is online.
6. Select that agent node in the workflow's setup modal. Run Inventory, review
   dependencies, then Initialize. Start with a workflow whose required models
   and plugins are already installed. The setup helper is limited to its
   reviewed dependency records; it is not an unrestricted remote shell.
7. Test Activity progress/reconnect/cancel on a setup with safe, small
   dependencies; open and close the remote console; prepare a workflow; queue
   and run a minimal job; confirm its result appears in Renders/Library. Stop
   the agent, tunnel, and relay when done. A fresh Quick Tunnel URL needs to be
   copied into Connections again.

If the local agent reports that the runtime is external/read-only, use the
direct workflow commands above for that node. Do not enable managed installation
on an existing personal ComfyUI root. Keep agent initialization pointed at the
fresh test root so any reviewed plugin/model changes stay isolated.

## Test matrix

| Test | OrbStack CPU (`8192`) | Mac MPS (`8191`) |
| --- | --- | --- |
| Connect and read node registry | Yes | Yes |
| Import/prepare editor and API workflows | Yes, if dependencies exist | Yes, if dependencies exist |
| Run weight-free mask canary | Yes | Yes |
| Apple Silicon/MPS model workflow | No | Yes, if its nodes/weights support MPS |
| CUDA workflow | No | No |
| Agent inventory/install/progress/console | Yes, with a Linux agent inside the container | Yes, via local Mac agent + relay |

