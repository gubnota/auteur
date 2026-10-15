# Local ComfyUI + agent: Apple Silicon and OrbStack CPU

Studio works without opening a Movie. For the complete test use **Instances →
Add connection → Local Mac / Linux** and connect to the agent's relay. A direct
ComfyUI connection can execute workflows but cannot install dependencies or open
the agent terminal.

## Ports and ownership

| Service | Mac MPS | Linux CPU example | Exposure |
| --- | --- | --- | --- |
| ComfyUI | 8191 | 8192 | Loopback inside its machine |
| Relay | 8789 | 8790 | Localhost for local tests; reachable relay for remote nodes |
| Agent | No listening port | No listening port | Outbound authenticated connection to relay |

The agent needs no public IP, SSH server or open inbound port. For a notebook or
RunPod behind NAT, run the agent beside ComfyUI and connect it to a reachable
relay. The bundled notebooks can expose **the relay** with Cloudflare. The relay
URL is an authenticated API, not the ComfyUI website. SSH public-key access is a
separate transport and does not by itself make a private address reachable.

## 1. Fresh Mac ComfyUI on port 8191

Your existing test installation is `$HOME/Downloads/ComfyUI-mymovie-mps`.
For a fresh installation:

```sh
cd "$HOME/Downloads"
git clone https://github.com/Comfy-Org/ComfyUI.git ComfyUI-mymovie-mps
cd "$HOME/Downloads/ComfyUI-mymovie-mps"
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install --pre torch torchvision torchaudio
python -m pip install -r requirements.txt
python -c 'import torch; print("MPS available:", torch.backends.mps.is_available())'
```

If you already started `python main.py --port 8191`, stop that process with
Ctrl+C before step 3. The supervisor must own the process to restart it after
plugin installation. `--attach` is available for an existing server, but attached
runtimes are read-only for dependency installation and managed restart.

## 2. Install matching agent and relay

Download and verify the matching macOS arm64 agent archive from the project's
release assets. It contains `mymovie-agent`, `mymovie-relay`, runtime/compiler
helpers and `mymovie_local.py`. Extract all files to one folder. Alternatively,
build and package this checkout (Rust and the Apple command line tools required):

```sh
cd "$HOME/Documents/petProjects/auteur"
DEVELOPER_DIR=/Library/Developer/CommandLineTools cargo build --release -p mymovie-agent -p mymovie-relay
python3 scripts/package-agent.py target/release/mymovie-agent artifacts/local-mac \
  --platform macos --architecture aarch64 --build-os macos
mkdir -p "$HOME/Downloads/mymovie-client-mac"
tar -xzf artifacts/local-mac/mymovie-agent-macos-aarch64.tar.gz \
  -C "$HOME/Downloads/mymovie-client-mac"
chmod +x "$HOME/Downloads/mymovie-client-mac/mymovie-agent" \
  "$HOME/Downloads/mymovie-client-mac/mymovie-relay"
```

For ordinary editor-workflow JSON conversion, install the compiler's browser
requirements in the ComfyUI environment. API JSON does not require conversion:

```sh
"$HOME/Downloads/ComfyUI-mymovie-mps/.venv/bin/python" -m pip install \
  -r "$HOME/Downloads/mymovie-client-mac/workflow-compiler-requirements.txt"
"$HOME/Downloads/ComfyUI-mymovie-mps/.venv/bin/python" -m playwright install chromium
```

## 3. Start ComfyUI, relay and agent together

```sh
python3 "$HOME/Downloads/mymovie-client-mac/mymovie_local.py" \
  --comfy-root "$HOME/Downloads/ComfyUI-mymovie-mps" \
  --python "$HOME/Downloads/ComfyUI-mymovie-mps/.venv/bin/python" \
  --data "$HOME/Downloads/mymovie-local-mps" \
  --port 8191 --relay-port 8789 --node-id local-mps-0 --allow-console
```

Keep this terminal running. It waits for ComfyUI and agent registration before
printing Ready. Ctrl+C stops its owned processes. Logs and private credentials
are saved in `mymovie-local-mps/`; repeated starts reuse the same pair.
`--allow-console` enables the private interactive terminal and custom setup
scripts. Use it only with a private token pair. The supervisor generates one;
it does not use the notebooks' shared demonstration defaults.

In Studio → Instances, add a relay connection:

- Relay: `http://127.0.0.1:8789`.
- Node ID: `local-mps-0`.
- Desktop token: the `MYMOVIE_DESKTOP_TOKEN` value in
  `$HOME/Downloads/mymovie-local-mps/tokens.json`. Read it locally; do not post it.
- Cloudflare polling: off for this localhost connection.

The agent uses the other token automatically. The desktop never sends the agent
token as its own credential. ComfyUI's optional browser UI remains
`http://127.0.0.1:8191/`.

Predefined public test tokens do not access Keychain. This supervisor creates a
private pair instead: save its desktop token when adding the connection. After
relaunch, explicitly **Check connection** to unlock its saved credential for
monitoring and background work. **Settings → Node access → Load saved private
tokens** is needed only to retrieve a custom saved pair; browsing Studio does
not request it.

## 4. Test the complete app path without a Movie

1. Workflows → Examples → **Use** the weight-free mask canary.
2. Select `local-mps-0`, Setup → Initialize. Inventory checks this runtime;
   installation/preparation progress is available in Activity after closing the
   modal. This example needs no model download.
3. Configure inputs → Add to queue. Jobs → Scheduled: select the task and
   **Run selected**. Merely adding it must not start it.
4. Confirm completion in Jobs, Renders and Library. These views remain usable
   after closing a Movie or restarting Studio. Clear finished retains media.
5. Instances → Terminal. Type directly: history, Tab, paste, Ctrl+C and resize
   work through a PTY. Closing detaches; reopening reconnects to the same shell.
6. Open or close a Movie while a job or initialization runs. Global activity
   must continue. Attach an existing Library asset to a Movie; use Collect when
   preparing a portable package.

For a model-download test, use the SD 1.5 starter on compatible hardware and
review its exact download size/license first. CUDA-only workflows need CUDA;
choosing a Mac node does not convert their graphs or precision requirements.
Each workflow can include hardware variants and Check / Install / Verify steps.
Checks rerun before installing; successful verified receipts avoid unnecessary
reinstallation. Predefined variables include `COMFYUI_DIR`, `COMFYUI_PYTHON`,
`MODELS_DIR`, `CUSTOM_NODES_DIR`, `WORKFLOW_DIR` and `CACHE_DIR`. Keep downloads
and plugin commands in the workflow setup, not in notebook bootstrap cells.

For your own workflow, open **Guide → Edit dependencies** (or **Setup**). Add or
edit a pinned model/plugin, set its HTTPS source and relative destination, and
review its checksum, size and license. **Open source** opens that URL in your
browser. Models resolve under `$MODELS_DIR/<category>/<relative filename>`;
plugins under `$CUSTOM_NODES_DIR/<relative directory>`. The editor previews the
destination before saving. Examples remain immutable; create an editable copy
to change their dependencies.

**Prepare workflow** on a direct ComfyUI connection shows preparation progress
but cannot install files or provide agent logs. Its **Set up local agent**
button opens this guide. Select the relay-backed instance for **Initialize**,
review dependencies, then **Install & prepare**. Activity retains stage/log
progress across navigation and provides reconnect/cancel controls.

## OrbStack Linux CPU node

Run these steps **inside** the OrbStack Linux VM, with its matching Linux agent
archive extracted to `$HOME/mymovie-client`. This exercises the actual Linux
filesystem and agent, rather than a Mac agent pointing at a forwarded server.

```sh
sudo apt-get update
sudo apt-get install -y python3 python3-venv python3-pip git
cd "$HOME"
git clone https://github.com/Comfy-Org/ComfyUI.git ComfyUI-mymovie-cpu
python3 -m venv "$HOME/ComfyUI-mymovie-cpu/.venv"
"$HOME/ComfyUI-mymovie-cpu/.venv/bin/python" -m pip install \
  torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
"$HOME/ComfyUI-mymovie-cpu/.venv/bin/python" -m pip install \
  -r "$HOME/ComfyUI-mymovie-cpu/requirements.txt"
python3 "$HOME/mymovie-client/mymovie_local.py" \
  --comfy-root "$HOME/ComfyUI-mymovie-cpu" \
  --python "$HOME/ComfyUI-mymovie-cpu/.venv/bin/python" \
  --data "$HOME/mymovie-cpu-data" --cpu --port 8192 \
  --relay-port 8790 --node-id local-cpu-0 --allow-console
```

Use a Linux archive matching `uname -m`. In another **Mac terminal**, forward the
relay over OrbStack SSH (substitute your actual VM alias):

```sh
ssh -N -L 8790:127.0.0.1:8790 debian.orb.local
```

Connect Studio to `http://127.0.0.1:8790`, node `local-cpu-0`, using that VM's
desktop token. Keep both processes running. No Cloudflare is required locally.
Use the mask canary on CPU. Mac MPS GPU acceleration is unavailable inside this
Linux VM. Production remote nodes can instead use `--relay https://your-relay`
with matching private credentials and an allowed node ID on that relay.

## Troubleshooting

- Not Ready: inspect `comfyui.log`, `agent.log`, `relay.log` in the data folder.
- Address in use: stop the previous standalone test process or choose two unused
  distinct ports; do not stop your personal ComfyUI instance on 8188.
- Terminal/script capability missing: use the matching agent build, private
  credentials and `--allow-console`; reconnect the app to the relay connection.
- Initialization read-only: restart this fresh test root under the supervisor
  instead of attaching to an unrelated existing process.
- Cloudflare notebook: enable Temporary Cloudflare tunnel · polling only. The
  root path may return 404. Test the authenticated `/v1/nodes/<node-id>` endpoint
  with the desktop token; never expose tokens in screenshots or shared logs.
