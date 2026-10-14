"""Generate output-free notebooks from the one reviewed bootstrap implementation."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HELPER = (ROOT / "scripts/notebook-bootstrap.py").read_text()
DEFAULT_TOKENS = json.loads((ROOT / "deploy/node-auth.defaults.json").read_text())


def cell(kind, source, hidden=False):
    result = {"cell_type": kind, "metadata": {"jupyter": {"source_hidden": True}} if hidden else {}, "source": source.splitlines(True)}
    if kind == "code": result.update(execution_count=None, outputs=[])
    return result


for host, root, count in [("colab", "/content", 1), ("kaggle", "/kaggle/working", 2)]:
    intro = f"""# MyMovie Studio · {host.title()} ComfyUI client
Deploy the **actual Linux x86_64 `mymovie-agent` feature-build artifact**, not a GUI or Rust compiler.

1. Enable a GPU runtime and Internet access. For Kaggle choose T4 ×2 to run two independent queues (or set `GPU_COUNT = 1`). Each process has its own GPU, port, input/output/user/temp files and receipts. GPU memory is not pooled.
2. Install ComfyUI and its dependencies separately. For managed Start, supply a clean, pinned Git revision; the agent installs only reviewed, hash-pinned models/plugins/wheels during explicit initialization. Kaggle datasets remain read-only: select an extra-model-paths YAML explicitly.
3. The Configure cell uses the same **editable predefined test tokens** as Studio → Settings → Node access. No Secrets are required by default; optional environment/Secrets readers are commented out. These defaults are public and shared; replace both values in the app and notebook for a private deployment.
4. Install artifact automatically selects a published GitHub release (including prereleases), reads its metadata SHA256, and verifies the archive before extraction. No token or manually copied checksum is needed for public releases. Local Cloudflare mode requires an archive containing **both agent and relay**; an older release without the relay is rejected with instructions to publish the updated build. Optionally pin `RELEASE_TAG`, or set **both** `ARTIFACT_SOURCE` and `ARTIFACT_SHA256` for a trusted uploaded archive/custom HTTPS asset. Private downloads optionally use `MYMOVIE_DOWNLOAD_TOKEN`.
5. Install `cloudflared` separately, then run Configure, Install artifact and Start. Start launches an authenticated **local relay** on `RELAY_PORT`, sets its node allowlist, and tunnels only that relay. ComfyUI stays private on loopback; agents connect locally. Copy the printed public `relay` URL and node IDs into Studio → Connections → Colab / Kaggle; enable **Temporary Cloudflare tunnel · polling only**. Quick Tunnels have no SSE. A new tunnel/session gets a new address/node IDs; reconnect before sending jobs. Alternatively set `START_LOCAL_RELAY = False` and supply your own authenticated relay URL/allowlist.
6. In Studio run Inventory, pin the returned native runtime fingerprint in Settings → App Runner, select workflows, Review initialization and Initialize. Repeat after installing plugins/wheels and restarting. Submit small jobs to each initialized connection, collect results into `.mymovie`, then Drain each node before Stop. A terminated notebook loses temporary files; expired jobs become unknown and are not automatically resubmitted.

{ "Google's free managed runtimes restrict distributed workers and primarily external control. Use an eligible paid runtime with positive compute balance, Enterprise, or your own runtime. See https://research.google.com/colaboratory/faq.html ." if host == "colab" else "Account GPU access, Internet/Secret grants and notebook lifetime depend on Kaggle. No keepalive or quota workaround is included. See https://www.kaggle.com/docs/notebooks ." }

The helper below is embedded from `scripts/notebook-bootstrap.py` so no unverified bootstrap code is downloaded. Process logs are suppressed to keep shared notebook outputs free of secrets. Status gives safe diagnostics; inspect your own installation separately for custom-node errors.
"""
    config = f'''from pathlib import Path
HOST = "{host}"
GPU_COUNT = {count}  # Kaggle: 1 or 2; Colab: 1
WORK_DIR = Path("{root}/mymovie-session")
RELEASE_REPOSITORY = "gubnota/auteur"
RELEASE_TAG = ""  # blank: newest published release with Linux agent assets, including prereleases
ARTIFACT_SOURCE = ""  # blank: resolve from GitHub; or uploaded archive / pinned HTTPS asset URL
ARTIFACT_SHA256 = ""  # auto from release metadata; required only with a custom ARTIFACT_SOURCE
START_LOCAL_RELAY = True
RELAY_PORT = 8787  # custom local port; separate from ComfyUI ports
RELAY_URL = f"http://127.0.0.1:{{RELAY_PORT}}"
# For an existing relay: START_LOCAL_RELAY = False; RELAY_URL = "https://your-relay.example"
ALLOW_QUICK_TUNNEL_POLLING = True  # temporary test mode; REST polling, no SSE
CLOUDFLARED_BINARY = "cloudflared"  # install separately before Start
COMFY_ROOT = Path("{root}/ComfyUI")
COMFY_REVISION = ""  # full 40-character Git commit, required for managed Start
FIRST_PORT = 8190  # both workers use 8190/8191; set 8188 to attach your existing server
ATTACH_EXISTING = False  # one GPU only; leaves the existing ComfyUI running on Stop
MODEL_PATHS_YAML = None  # optional absolute path; Kaggle datasets are read-only
USE_PRIVATE_DOWNLOAD_SECRET = False

# Public, shared test defaults; also populated in Studio Settings → Node access.
# Edit both here and in Studio to use a private pair. Never print token values.
{chr(10).join(f'{name} = {json.dumps(value)}' for name, value in DEFAULT_TOKENS.items())}
# Optional overrides, disabled by default:
# MYMOVIE_AGENT_TOKEN = os.environ["MYMOVIE_AGENT_TOKEN"]
# MYMOVIE_DESKTOP_TOKEN = os.environ["MYMOVIE_DESKTOP_TOKEN"]
# MYMOVIE_AGENT_TOKEN = secret(HOST, "MYMOVIE_AGENT_TOKEN")
# MYMOVIE_DESKTOP_TOKEN = secret(HOST, "MYMOVIE_DESKTOP_TOKEN")
'''
    setup = '''if "runner" in globals() and runner.status()["state"] == "running":
    raise SetupError("Stop the current runner before reconfiguring it.")
download_token = secret(HOST, "MYMOVIE_DOWNLOAD_TOKEN") if USE_PRIVATE_DOWNLOAD_SECRET else None
try:
    source, digest = ARTIFACT_SOURCE, ARTIFACT_SHA256
    if not source and not digest:
        release = release_artifact(RELEASE_REPOSITORY, RELEASE_TAG, download_token, require_relay=START_LOCAL_RELAY)
        source, digest = release["source"], release["sha256"]
        print(f"Verified release metadata: {release['tag']} · Linux x86_64")
    elif not source or not digest:
        raise SetupError("For a custom artifact, set both ARTIFACT_SOURCE and ARTIFACT_SHA256; leave both blank for automatic GitHub setup.")
    binary = install_artifact(source, digest, WORK_DIR / "artifacts", download_token, require_relay=START_LOCAL_RELAY)
finally:
    download_token = None
runner = NotebookRunner(binary, RELAY_URL, WORK_DIR, GPU_COUNT, first_port=FIRST_PORT, allow_quick_tunnel=ALLOW_QUICK_TUNNEL_POLLING)
print(json.dumps(runner.configuration(), indent=2))
print("Start next, then copy its public relay address and node IDs into Studio Connections.")
if not START_LOCAL_RELAY:
    print("External relay: copy relayAllowlist into its MYMOVIE_NODE_IDS before Start.")
'''
    start = '''print(json.dumps(runner.start(MYMOVIE_AGENT_TOKEN, comfy_root=COMFY_ROOT, expected_revision=COMFY_REVISION,
                              attach=ATTACH_EXISTING, model_paths=MODEL_PATHS_YAML,
                              desktop_token=MYMOVIE_DESKTOP_TOKEN if START_LOCAL_RELAY else None,
                              relay_port=RELAY_PORT, cloudflared=CLOUDFLARED_BINARY if START_LOCAL_RELAY else None), indent=2))
'''
    cells = [cell("markdown", intro), cell("code", HELPER, True), cell("markdown", "## Configure\nPredefined values below are public test defaults. Use a private pair for private deployments. The artifact SHA256 is mandatory.\n"), cell("code", config), cell("markdown", "## Install artifact and prepare node IDs\nNothing is started until the next cell.\n"), cell("code", setup), cell("markdown", "## Start independent workers\nInspect Studio connection health after this cell completes. Local tunnel mode requires an archive containing mymovie-agent, mymovie-relay and mymovie_runtime.py. No model download occurs in this cell. Inspect Inventory and initialize the pinned workflow profile before submitting.\n"), cell("code", start), cell("markdown", "## Status\nThese are local process states. Studio health reports the relay heartbeat, Doctor and workflow readiness.\n"), cell("code", 'print(json.dumps(runner.status(), indent=2))\n'), cell("markdown", "## Bounded interactive session\nOptional: wait up to 30 minutes, then stop owned processes. Interrupting this cell also stops them. This does not keep a runtime alive against notebook limits.\n"), cell("code", '# Uncomment when ready:\n# runner.run_for(minutes=30)\n'), cell("markdown", "## Stop\nCollect results and Drain both nodes first. Only processes started by this runner are stopped; an attached existing ComfyUI is left running. Lost/in-flight jobs may need receipt reconciliation.\n"), cell("code", 'print(json.dumps(runner.stop(), indent=2))\n')]
    notebook = {"cells": cells, "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}, "language_info": {"name": "python"}}, "nbformat": 4, "nbformat_minor": 5}
    for i, c in enumerate(cells): c["id"] = f"mymovie-{host}-{i}"
    (ROOT / f"deploy/{host}/MyMovie_ComfyUI.ipynb").write_text(json.dumps(notebook, indent=2) + "\n")
