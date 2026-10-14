"""Generate output-free notebooks from the one reviewed bootstrap implementation."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HELPER = (ROOT / "scripts/notebook-bootstrap.py").read_text()


def cell(kind, source, hidden=False):
    result = {"cell_type": kind, "metadata": {"jupyter": {"source_hidden": True}} if hidden else {}, "source": source.splitlines(True)}
    if kind == "code": result.update(execution_count=None, outputs=[])
    return result


for host, root, count in [("colab", "/content", 1), ("kaggle", "/kaggle/working", 2)]:
    intro = f"""# MyMovie Studio · {host.title()} ComfyUI client
Deploy the **actual Linux x86_64 `mymovie-agent` feature-build artifact**, not a GUI or Rust compiler.

1. Enable a GPU runtime and Internet access. For Kaggle choose T4 ×2 to run two independent queues (or set `GPU_COUNT = 1`). Each process has its own GPU, port, input/output/user/temp files and receipts. GPU memory is not pooled.
2. Install ComfyUI and its dependencies separately. For managed Start, supply a clean, pinned Git revision; the agent installs only reviewed, hash-pinned models/plugins/wheels during explicit initialization. Kaggle datasets remain read-only: select an extra-model-paths YAML explicitly.
3. Add `MYMOVIE_AGENT_TOKEN` to {"Colab Secrets (grant notebook access)" if host == "colab" else "Kaggle Secrets (attach it to this notebook)"}. Configure a **reachable authenticated HTTPS relay** with a different studio token. This notebook never publishes ComfyUI or creates a tunnel.
4. Build the new feature client with the repository's CI (published 0.1.5 predates initialization), or upload its `mymovie-agent-linux-x86_64.tar.gz`. Copy the expected SHA256 from a trusted release/checksums source. Draft/private releases require an uploaded archive or a GitHub API asset URL plus optional `MYMOVIE_DOWNLOAD_TOKEN` Secret.
5. Run Install and Configure, copy its node IDs into the relay's `MYMOVIE_NODE_IDS` and Studio → Connections → Colab / Kaggle, then Start. Keep this object for stop/start within the session. A fresh session creates new IDs; do not point it at old outstanding jobs.
6. In Studio run Inventory, pin the returned native runtime fingerprint in Settings → App Runner, select workflows, Review initialization and Initialize. Repeat after installing plugins/wheels and restarting. Submit small jobs to each initialized connection, collect results into `.mymovie`, then Drain each node before Stop. A terminated notebook loses temporary files; expired jobs become unknown and are not automatically resubmitted.

{ "Google's free managed runtimes restrict distributed workers and primarily external control. Use an eligible paid runtime with positive compute balance, Enterprise, or your own runtime. See https://research.google.com/colaboratory/faq.html ." if host == "colab" else "Account GPU access, Internet/Secret grants and notebook lifetime depend on Kaggle. No keepalive or quota workaround is included. See https://www.kaggle.com/docs/notebooks ." }

The helper below is embedded from `scripts/notebook-bootstrap.py` so no unverified bootstrap code is downloaded. Process logs are suppressed to keep shared notebook outputs free of secrets. Status gives safe diagnostics; inspect your own installation separately for custom-node errors.
"""
    config = f'''from pathlib import Path
HOST = "{host}"
GPU_COUNT = {count}  # Kaggle: 1 or 2; Colab: 1
WORK_DIR = Path("{root}/mymovie-session")
ARTIFACT_SOURCE = "{root}/mymovie-agent-linux-x86_64.tar.gz"  # upload or pinned HTTPS asset URL
ARTIFACT_SHA256 = ""  # trusted release checksum (required)
RELAY_URL = "https://YOUR-RELAY"  # relay URL, not ComfyUI URL
ALLOW_QUICK_TUNNEL_POLLING = False  # explicit temporary test only; Quick Tunnel has no SSE
COMFY_ROOT = Path("{root}/ComfyUI")
COMFY_REVISION = ""  # full 40-character Git commit, required for managed Start
FIRST_PORT = 8190  # both workers use 8190/8191; set 8188 to attach your existing server
ATTACH_EXISTING = False  # one GPU only; leaves the existing ComfyUI running on Stop
MODEL_PATHS_YAML = None  # optional absolute path; Kaggle datasets are read-only
USE_PRIVATE_DOWNLOAD_SECRET = False
'''
    setup = '''if "runner" in globals() and runner.status()["state"] == "running":
    raise SetupError("Stop the current runner before reconfiguring it.")
download_token = secret(HOST, "MYMOVIE_DOWNLOAD_TOKEN") if USE_PRIVATE_DOWNLOAD_SECRET else None
try:
    binary = install_artifact(ARTIFACT_SOURCE, ARTIFACT_SHA256, WORK_DIR / "artifacts", download_token)
finally:
    download_token = None
runner = NotebookRunner(binary, RELAY_URL, WORK_DIR, GPU_COUNT, first_port=FIRST_PORT, allow_quick_tunnel=ALLOW_QUICK_TUNNEL_POLLING)
print(json.dumps(runner.configuration(), indent=2))
print("Copy relayAllowlist into MYMOVIE_NODE_IDS on the relay; add each node in Studio Connections.")
'''
    start = '''agent_token = secret(HOST, "MYMOVIE_AGENT_TOKEN")
try:
    print(json.dumps(runner.start(agent_token, comfy_root=COMFY_ROOT, expected_revision=COMFY_REVISION,
                                  attach=ATTACH_EXISTING, model_paths=MODEL_PATHS_YAML), indent=2))
finally:
    agent_token = None
'''
    cells = [cell("markdown", intro), cell("code", HELPER, True), cell("markdown", "## Configure\nNo secrets belong in this cell. The SHA256 is mandatory.\n"), cell("code", config), cell("markdown", "## Install artifact and prepare node IDs\nNothing is started until the next cell.\n"), cell("code", setup), cell("markdown", "## Start independent workers\nInspect Studio connection health after this cell completes. The new artifact must contain mymovie_runtime.py. Inspect Inventory and initialize the pinned workflow profile before submitting.\n"), cell("code", start), cell("markdown", "## Status\nThese are local process states. Studio health reports the relay heartbeat, Doctor and workflow readiness.\n"), cell("code", 'print(json.dumps(runner.status(), indent=2))\n'), cell("markdown", "## Bounded interactive session\nOptional: wait up to 30 minutes, then stop owned processes. Interrupting this cell also stops them. This does not keep a runtime alive against notebook limits.\n"), cell("code", '# Uncomment when ready:\n# runner.run_for(minutes=30)\n'), cell("markdown", "## Stop\nCollect results and Drain both nodes first. Only processes started by this runner are stopped; an attached existing ComfyUI is left running. Lost/in-flight jobs may need receipt reconciliation.\n"), cell("code", 'print(json.dumps(runner.stop(), indent=2))\n')]
    notebook = {"cells": cells, "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"}, "language_info": {"name": "python"}}, "nbformat": 4, "nbformat_minor": 5}
    for i, c in enumerate(cells): c["id"] = f"mymovie-{host}-{i}"
    (ROOT / f"deploy/{host}/MyMovie_ComfyUI.ipynb").write_text(json.dumps(notebook, indent=2) + "\n")
