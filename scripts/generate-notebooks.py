"""Generate output-free, Run-all notebooks from one reviewed bootstrap."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HELPER = (ROOT / "scripts/notebook-bootstrap.py").read_text()
DEFAULT_TOKENS = json.loads((ROOT / "deploy/node-auth.defaults.json").read_text())
RUNTIME = json.loads((ROOT / "deploy/notebook-runtime.defaults.json").read_text())


def cell(kind, source, hidden=False):
    result = {"cell_type": kind, "metadata": {"jupyter": {"source_hidden": True}} if hidden else {}, "source": source.splitlines(True)}
    if kind == "code": result.update(execution_count=None, outputs=[])
    return result


for host, root, count in [("colab", "/content", 1), ("kaggle", "/kaggle/working", 2)]:
    intro = f"""# MyMovie Studio · {host.title()} ComfyUI client
**Enable a GPU runtime and Internet, then choose Run all. No edits, Secrets, copied hashes or manual installs are needed for the default test setup.**

The notebook installs pinned ComfyUI {RUNTIME['comfyRelease']} in its own session folder, reuses the runtime's CUDA PyTorch in an isolated Python environment, installs the workflow-import browser and checksum-verified cloudflared, and downloads a verified released Linux x86_64 agent + relay. **No model weights or workflow plugins are downloaded.** Install those later through Studio's workflow initialization.

The predefined public test keys match Studio → Settings → Node access. Optional environment/Secrets overrides are commented out. Use a private pair in both places for private deployments. Public agent releases require no GitHub token; optional custom release/archive settings are below. Run all cells from the top; do not skip the bootstrap helper cell (it is visible so Kaggle executes it).

At the end copy the **public relay URL** and **node ID** into Studio → Connections → Colab / Kaggle; enable **Temporary Cloudflare tunnel · polling only**. ComfyUI stays on loopback. Quick Tunnels use polling, not SSE; their addresses change after a restart. Select Inventory, pin its native runtime fingerprint in Settings → App Runner, then Review initialization and Initialize your workflow. Collect results into `.mymovie` before ending the session.

Kaggle defaults to two independent T4 workers (select T4 ×2, or optionally set `GPU_COUNT = 1`). GPU memory is not pooled. Colab defaults to one GPU. A healthy repeated Run all reuses the running session. The final Stop cell is disabled by default, so Run all leaves the node running. Runtime termination still ends the session; no keepalive is included.

{"Google's managed-runtime usage restrictions still apply; use an eligible runtime for externally controlled workers. See https://research.google.com/colaboratory/faq.html ." if host == "colab" else "Kaggle GPU/Internet access and notebook lifetime depend on your account. See https://www.kaggle.com/docs/notebooks ."}
"""
    config = f'''from pathlib import Path
HOST = "{host}"
GPU_COUNT = {count}  # Kaggle: T4 x2; Colab: one GPU
WORK_DIR = Path("{root}/mymovie-session")
RELEASE_REPOSITORY = "gubnota/auteur"
RELEASE_TAG = ""  # optional: pin a published version; blank resolves automatically
ARTIFACT_SOURCE = ""  # optional uploaded archive / HTTPS asset; blank uses GitHub
ARTIFACT_SHA256 = ""  # automatic; required only for a custom ARTIFACT_SOURCE
START_LOCAL_RELAY = True
RELAY_PORT = 8787
RELAY_URL = f"http://127.0.0.1:{{RELAY_PORT}}"
# External relay override: START_LOCAL_RELAY = False; RELAY_URL = "https://your-relay.example"
ALLOW_QUICK_TUNNEL_POLLING = True
ALLOW_REMOTE_CONSOLE = False  # custom scripts/terminal: replace BOTH shared tokens, then enable
COMFY_ROOT = WORK_DIR / "ComfyUI"  # separate from an existing /content/ComfyUI
COMFY_REVISION = "{RUNTIME['comfyRevision']}"  # ComfyUI {RUNTIME['comfyRelease']}
CLOUDFLARED_SOURCE = "{RUNTIME['cloudflaredSource']}"
CLOUDFLARED_SHA256 = "{RUNTIME['cloudflaredSha256']}"
CLOUDFLARED_BINARY = str(WORK_DIR / "cloudflared")  # installed automatically
COMFY_PYTHON = str(WORK_DIR / "env/bin/python")
FIRST_PORT = 8190
ATTACH_EXISTING = False  # advanced: existing ComfyUI, one GPU; skip base installation
MODEL_PATHS_YAML = None  # optional extra-model-paths YAML; datasets remain read-only
USE_PRIVATE_DOWNLOAD_SECRET = False

# Public shared test defaults, also populated in Studio Settings → Node access.
# Replace both here and in Studio for private use. Never print token values.
{chr(10).join(f'{name} = {json.dumps(value)}' for name, value in DEFAULT_TOKENS.items())}
# Optional overrides, disabled by default:
# MYMOVIE_AGENT_TOKEN = os.environ["MYMOVIE_AGENT_TOKEN"]
# MYMOVIE_DESKTOP_TOKEN = os.environ["MYMOVIE_DESKTOP_TOKEN"]
# MYMOVIE_AGENT_TOKEN = secret(HOST, "MYMOVIE_AGENT_TOKEN")
# MYMOVIE_DESKTOP_TOKEN = secret(HOST, "MYMOVIE_DESKTOP_TOKEN")
print("Default configuration loaded. No key or configuration edits are required.")
'''
    setup = '''import platform

_required_bootstrap = ("SetupError", "gpu_indices", "release_artifact", "install_artifact", "prepare_runtime", "NotebookRunner", "secret")
_missing_bootstrap = [name for name in _required_bootstrap if name not in globals()]
if _missing_bootstrap:
    raise RuntimeError("Run all notebook cells from the top. The bootstrap helper cell was skipped.")

if "runner" in globals() and runner.status()["state"] == "running":
    print("Healthy session already running; reusing its workers and connection address.")
else:
    if "runner" in globals() and runner.status()["state"] == "attention":
        raise SetupError("A session process exited. Inspect process-*.log, then use the Stop cell before retrying.")
    if platform.system() != "Linux" or platform.machine() != "x86_64":
        raise SetupError("Select a Linux x86_64 GPU notebook runtime.")
    if len(gpu_indices()) < GPU_COUNT:
        raise SetupError("Enable the requested GPU runtime first (Colab: one GPU; Kaggle: T4 x2).")
    print("GPU available. Resolving the verified agent release…", flush=True)
    download_token = secret(HOST, "MYMOVIE_DOWNLOAD_TOKEN") if USE_PRIVATE_DOWNLOAD_SECRET else None
    try:
        source, digest = ARTIFACT_SOURCE, ARTIFACT_SHA256
        if not source and not digest:
            release = release_artifact(RELEASE_REPOSITORY, RELEASE_TAG, download_token, require_relay=START_LOCAL_RELAY)
            source, digest = release["source"], release["sha256"]
            print(f"Verified release metadata: {release['tag']} · Linux x86_64", flush=True)
        elif not source or not digest:
            raise SetupError("For a custom artifact, set both ARTIFACT_SOURCE and ARTIFACT_SHA256; leave both blank for automatic GitHub setup.")
        binary = install_artifact(source, digest, WORK_DIR / "artifacts", download_token, require_relay=START_LOCAL_RELAY)
    finally:
        download_token = None
    if not ATTACH_EXISTING:
        runtime = prepare_runtime(binary, COMFY_ROOT, COMFY_REVISION, WORK_DIR,
                                  tunnel_source=CLOUDFLARED_SOURCE if START_LOCAL_RELAY else None,
                                  tunnel_sha256=CLOUDFLARED_SHA256)
        COMFY_PYTHON = runtime["python"]
        CLOUDFLARED_BINARY = runtime["cloudflared"]
    else:
        COMFY_PYTHON = sys.executable
        CLOUDFLARED_BINARY = "cloudflared"  # advanced Attach requires an installed tunnel
    runner = NotebookRunner(binary, RELAY_URL, WORK_DIR, GPU_COUNT, first_port=FIRST_PORT, allow_quick_tunnel=ALLOW_QUICK_TUNNEL_POLLING)
    print("Installation complete. Starting the node in the next cell.", flush=True)
    if not START_LOCAL_RELAY:
        print("External relay: add these node IDs to MYMOVIE_NODE_IDS before Start:", runner.configuration()["relayAllowlist"])
'''
    start = '''if "runner" not in globals():
    raise RuntimeError("Run all notebook cells from the top before starting the node.")
if runner.status()["state"] != "running":
    print("Starting ComfyUI, agent and relay; waiting for readiness and public address…", flush=True)
    runner.start(MYMOVIE_AGENT_TOKEN, comfy_root=COMFY_ROOT, expected_revision=COMFY_REVISION,
                 attach=ATTACH_EXISTING, model_paths=MODEL_PATHS_YAML, python=COMFY_PYTHON, timeout=300,
                 desktop_token=MYMOVIE_DESKTOP_TOKEN if START_LOCAL_RELAY else None,
                 allow_console=ALLOW_REMOTE_CONSOLE, relay_port=RELAY_PORT, cloudflared=CLOUDFLARED_BINARY if START_LOCAL_RELAY else None)
connection = runner.status()
print("\\nREADY — Studio → Connections → Colab / Kaggle")
print("Relay URL:", connection["relay"])
for node in connection["nodes"]:
    print("Node ID:", node["nodeId"])
print("Enable Temporary Cloudflare tunnel · polling only. Settings → Node access already has the matching test keys.")
print("Next: Inventory → Review initialization → Initialize workflow. The node stays running until you stop it or the runtime ends.")
'''
    cells = [
        cell("markdown", intro), cell("code", HELPER),
        cell("markdown", "## 1. Default configuration\nReady to run unchanged. Advanced overrides are optional.\n"), cell("code", config),
        cell("markdown", "## 2. Automatic installation\nThis takes several minutes on a fresh runtime. Stages appear below; detailed output stays in `mymovie-session/installation.log`. No model weights are downloaded.\n"), cell("code", setup),
        cell("markdown", "## 3. Start ComfyUI and connect the agent\nThe final output gives the public relay URL and node IDs for Studio.\n"), cell("code", start),
        cell("markdown", "## Status\nLocal process status; Studio reports relay heartbeat and workflow readiness.\n"), cell("code", 'print(json.dumps(runner.status(), indent=2))\n'),
        cell("markdown", "## Optional bounded session\nDisabled by default. Uncomment to wait up to 30 minutes and then stop owned processes. Interrupting that wait also stops them.\n"), cell("code", '# runner.run_for(minutes=30)\n'),
        cell("markdown", "## Stop — manual action only\nCollect results and Drain nodes first. To stop, uncomment the line below and run **only this cell**. Run all leaves it disabled. Attached external ComfyUI is preserved.\n"), cell("code", '# print(json.dumps(runner.stop(), indent=2))\n')
    ]
    notebook = {"cells": cells, "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}, "language_info": {"name": "python"}}, "nbformat": 4, "nbformat_minor": 5}
    if host == "colab": notebook["metadata"].update(accelerator="GPU", colab={"provenance": [], "gpuType": "T4"})
    for i, c in enumerate(cells): c["id"] = f"mymovie-{host}-{i}"
    (ROOT / f"deploy/{host}/MyMovie_ComfyUI.ipynb").write_text(json.dumps(notebook, indent=2) + "\n")
