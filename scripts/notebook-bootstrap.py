"""Verified Linux agent deployment with CPU or independent notebook GPU workers.

Stdlib bootstrap; installs base runtime/tools, never weights or workflow plugins.
"""
from __future__ import annotations

import fcntl
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import signal
import socket
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.parse
import urllib.request
import uuid

MAX_ARTIFACT = 256 * 1024 * 1024
MAX_BINARY = 128 * 1024 * 1024


class SetupError(RuntimeError):
    """Public messages are deliberately independent of network/secret exceptions."""


def prepare_runtime(binary, comfy_root, revision, work_dir, *, tunnel_source=None, tunnel_sha256=None, cpu=False):
    """Provision a base install; reviewed workflow dependencies belong to Studio."""
    if platform.system() != "Linux" or platform.machine() != "x86_64":
        raise SetupError("Automatic notebook setup requires a Linux x86_64 runtime.")
    if not re.fullmatch(r"[a-f0-9]{40}", revision or ""):
        raise SetupError("The notebook must contain a pinned ComfyUI revision.")
    root, work = Path(comfy_root).resolve(), Path(work_dir).resolve()
    work.mkdir(parents=True, exist_ok=True)
    log = work / "installation.log"
    log.touch(mode=0o600); log.chmod(0o600)
    env = {k: v for k, v in os.environ.items() if not k.startswith("MYMOVIE_")}
    env.update(GIT_TERMINAL_PROMPT="0", PIP_NO_INPUT="1", DEBIAN_FRONTEND="noninteractive")

    def command(args, stage, timeout=1200):
        print(stage, flush=True)
        try:
            with log.open("a") as output:
                subprocess.run([str(a) for a in args], check=True, stdout=output,
                               stderr=subprocess.STDOUT, env=env, timeout=timeout)
        except Exception:
            raise SetupError(f"{stage} failed. Inspect {log} in this runtime, then retry Run all.") from None

    if not root.exists():
        root.parent.mkdir(parents=True, exist_ok=True)
        # Publish a complete checkout; interrupted clones cannot leave a broken target.
        with tempfile.TemporaryDirectory(prefix=".comfy-", dir=root.parent) as directory:
            checkout = Path(directory) / "repo"
            command(["git", "init", checkout], "Preparing base ComfyUI")
            command(["git", "-C", checkout, "fetch", "--depth=1",
                     "https://github.com/Comfy-Org/ComfyUI.git", revision], "Downloading pinned ComfyUI")
            command(["git", "-C", checkout, "checkout", "--detach", "FETCH_HEAD"], "Activating pinned ComfyUI")
            checkout.rename(root)
    try:
        actual = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL, timeout=10).strip()
        dirty = subprocess.check_output(["git", "-C", str(root), "status", "--porcelain", "--untracked-files=no"], text=True, stderr=subprocess.DEVNULL, timeout=10).strip()
    except Exception:
        raise SetupError(f"Cannot verify {root}. Existing files were left untouched; choose an empty COMFY_ROOT.") from None
    if actual != revision or dirty or not (root / "main.py").is_file():
        raise SetupError(f"Existing ComfyUI at {root} conflicts with the pinned clean revision; it was left untouched.")

    requirements = Path(binary).parent / "workflow-compiler-requirements.txt"
    if not requirements.is_file():
        raise SetupError("The agent archive must include workflow-compiler-requirements.txt.")
    python = work / "env/bin/python"
    marker = work / "base-runtime.json"
    expected = {"schema": 1, "device": "cpu" if cpu else "cuda", "revision": revision, "python": sys.executable,
                "pythonVersion": sys.version, "comfyRoot": str(root),
                "requirements": hashlib.sha256((root / "requirements.txt").read_bytes() + requirements.read_bytes()).hexdigest()}
    try:
        cached = python.is_file() and json.loads(marker.read_text()) == expected
    except (OSError, ValueError):
        cached = False
    if not cached:
        marker.unlink(missing_ok=True)
        # Reuse the runtime's PyTorch without changing notebook packages.
        # Colab may omit ensurepip; inherit its existing pip instead of requiring apt.
        command([sys.executable, "-m", "venv", "--without-pip", "--system-site-packages", work / "env"], "Creating isolated Python environment")
        command([python, "-m", "pip", "install", "-r", root / "requirements.txt", "-r", requirements], "Installing ComfyUI and workflow-import dependencies")
        command([python, "-m", "playwright", "install", "--with-deps", "chromium"], "Installing workflow-import browser")
    # A marker alone is never readiness; validate the chosen device and the browser's OS libraries.
    try:
        command([python, "-c", "import sys; sys.path.insert(0, sys.argv[1]); sys.argv=sys.argv[:1]; import torch, aiohttp, folder_paths; "
                 "from playwright.sync_api import sync_playwright; " +
                 ("assert torch.ones(1).device.type == 'cpu'; " if cpu else "assert torch.cuda.is_available(), 'CUDA unavailable'; ") +
                 "p=sync_playwright().start(); browser=p.chromium.launch(headless=True, args=['--no-sandbox']); browser.close(); p.stop()", root],
                f"Verifying {'CPU' if cpu else 'CUDA'} and workflow-import browser", timeout=90)
    except SetupError:
        marker.unlink(missing_ok=True)
        raise
    temporary = marker.with_suffix(".tmp")
    temporary.write_text(json.dumps(expected)); temporary.replace(marker)
    tunnel = None
    if tunnel_source:
        private_url(tunnel_source)
        if not re.fullmatch(r"[a-f0-9]{64}", tunnel_sha256 or ""):
            raise SetupError("A pinned cloudflared SHA256 is required.")
        tunnel = work / "cloudflared"
        if not tunnel.is_file() or hashlib.sha256(tunnel.read_bytes()).hexdigest() != tunnel_sha256:
            print("Downloading verified cloudflared", flush=True)
            temporary = tunnel.with_suffix(".part")
            try:
                with urllib.request.urlopen(tunnel_source, timeout=60) as response, temporary.open("wb") as output:
                    size, digest = 0, hashlib.sha256()
                    while chunk := response.read(1024 * 1024):
                        size += len(chunk)
                        if size > MAX_BINARY:
                            raise SetupError("cloudflared download exceeds the size limit.")
                        digest.update(chunk); output.write(chunk)
                if digest.hexdigest() != tunnel_sha256:
                    raise SetupError("cloudflared checksum mismatch; executable was not installed.")
                temporary.chmod(0o700); temporary.replace(tunnel)
            except SetupError:
                raise
            except Exception:
                raise SetupError("cloudflared download failed. Check Internet access and retry Run all.") from None
            finally:
                temporary.unlink(missing_ok=True)
        tunnel.chmod(0o700)
    print("Base runtime ready. Models and workflow plugins will be installed from Studio.", flush=True)
    return {"python": str(python), "cloudflared": str(tunnel) if tunnel else None}


def secret(host: str, label: str) -> str:
    try:
        if host == "colab":
            from google.colab import userdata
            value = userdata.get(label)
        elif host == "kaggle":
            from kaggle_secrets import UserSecretsClient
            value = UserSecretsClient().get_secret(label)
        else:
            raise SetupError("Choose colab or kaggle for notebook Secrets.")
    except Exception:
        raise SetupError(f"Grant this notebook access to the {label} Secret.") from None
    if not isinstance(value, str) or len(value) < 24 or any(c.isspace() for c in value):
        raise SetupError(f"The {label} Secret must contain at least 24 non-space characters.")
    return value


def private_url(raw: str, *, loopback=False, allow_query=False, allow_quick_tunnel=False) -> str:
    try:
        u = urllib.parse.urlsplit(raw)
        local = u.hostname in ("127.0.0.1", "localhost", "::1")
        if not u.hostname or u.username or u.password or (u.query and not allow_query) or u.fragment:
            raise ValueError()
        if u.scheme != "https" and not (loopback and local and u.scheme == "http"):
            raise ValueError()
        if (u.hostname == "trycloudflare.com" or u.hostname.endswith(".trycloudflare.com")) and not allow_quick_tunnel:
            raise SetupError("Quick Tunnels do not support relay SSE. Use a stable authenticated HTTPS relay.")
        return raw.rstrip("/")
    except SetupError:
        raise
    except Exception:
        raise SetupError("Use an HTTPS URL without credentials or query parameters.") from None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Private release redirects must not leak the Authorization header.
        target = private_url(newurl, allow_query=True)
        original = urllib.parse.urlsplit(req.full_url).hostname
        headers = dict(req.headers)
        if urllib.parse.urlsplit(target).hostname != original:
            headers = {k: v for k, v in headers.items() if k.lower() != "authorization"}
        return urllib.request.Request(target, headers=headers)


def release_artifact(repository="gubnota/auteur", tag="", download_token=None, *, require_relay=True) -> dict:
    """Resolve a published release (including prereleases), without executing downloads."""
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise SetupError("Use a GitHub owner/repository name.")
    api = f"https://api.github.com/repos/{repository}"

    def request_json(url, asset=False):
        headers = {"User-Agent": "MyMovie-Notebook", "Accept": "application/octet-stream" if asset else "application/vnd.github+json"}
        if download_token:
            headers["Authorization"] = f"Bearer {download_token}"
        try:
            with urllib.request.build_opener(NoRedirect()).open(urllib.request.Request(url, headers=headers), timeout=30) as response:
                data = response.read(2 * 1024 * 1024 + 1)
            if len(data) > 2 * 1024 * 1024:
                raise ValueError()
            return json.loads(data)
        except Exception:
            raise SetupError("Cannot read the GitHub release metadata. Check the repository/tag and Internet access. Public releases need no token; private releases need download access.") from None

    releases = [request_json(f"{api}/releases/tags/{urllib.parse.quote(tag, safe='')}")] if tag else request_json(f"{api}/releases?per_page=20")
    if not isinstance(releases, list):
        raise SetupError("Unexpected GitHub release list.")
    archive_name = "mymovie-agent-linux-x86_64.tar.gz"
    for release in releases:
        if not isinstance(release, dict) or release.get("draft") or not release.get("published_at"):
            continue
        assets = {a.get("name"): a for a in release.get("assets", []) if isinstance(a, dict)}
        archive = assets.get(archive_name)
        metadata = assets.get("mymovie-agent-linux-x86_64.json")
        if not archive or not metadata:
            continue
        # Construct API URLs ourselves so a release cannot forward credentials to an arbitrary host.
        if any(type(a.get("id")) is not int for a in [archive, metadata]):
            raise SetupError("Invalid release asset IDs.")
        manifest = request_json(f"{api}/releases/assets/{metadata['id']}", asset=True)
        if not isinstance(manifest, dict) or manifest.get("target") != "x86_64-unknown-linux-gnu":
            raise SetupError("Release metadata does not describe the Linux x86_64 agent.")
        digest = manifest.get("sha256", "")
        if not isinstance(digest, str) or not re.fullmatch(r"[a-fA-F0-9]{64}", digest):
            raise SetupError("Release metadata has no valid archive SHA256.")
        github_digest = archive.get("digest")
        if github_digest and (not isinstance(github_digest, str) or github_digest.lower() != f"sha256:{digest.lower()}"):
            raise SetupError("GitHub and release metadata checksums disagree; nothing was installed.")
        relay_digest = manifest.get("relayBinarySha256", "")
        if require_relay and (not isinstance(relay_digest, str) or not re.fullmatch(r"[a-fA-F0-9]{64}", relay_digest)):
            raise SetupError("This published agent archive lacks mymovie-relay for local Cloudflare mode. Publish a new version from the updated CI, or upload a current agent+relay archive with its SHA256. Changing tokens cannot fix an old archive.")
        return {"source": f"{api}/releases/assets/{archive['id']}", "sha256": digest.lower(), "tag": release.get("tag_name", "")}
    raise SetupError("No published release contains the Linux x86_64 agent and metadata. A Git tag alone does not publish artifacts; wait for the release build, or supply an archive and SHA256.")


def install_artifact(source: str, digest: str, destination: Path, download_token=None, *, require_relay=False) -> Path:
    if platform.system() != "Linux" or platform.machine() not in ("x86_64", "AMD64"):
        raise SetupError("This artifact requires Linux x86_64 (Colab/Kaggle GPU runtime).")
    if not re.fullmatch(r"[a-fA-F0-9]{64}", digest):
        raise SetupError("Copy the trusted release SHA256 before installing the artifact.")
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    temporary = tempfile.TemporaryDirectory(dir=destination)
    try:
        archive = Path(temporary.name) / "agent.tar.gz"
        try:
            if source.startswith("https://"):
                url = private_url(source)
                headers = {"User-Agent": "MyMovie-Notebook", "Accept": "application/octet-stream"}
                if download_token:
                    headers["Authorization"] = f"Bearer {download_token}"
                stream = urllib.request.build_opener(NoRedirect()).open(urllib.request.Request(url, headers=headers), timeout=30)
            else:
                stream = Path(source).open("rb")
            total = 0
            h = hashlib.sha256()
            with stream, archive.open("wb") as out:
                while chunk := stream.read(1024 * 1024):
                    total += len(chunk)
                    if total > MAX_ARTIFACT:
                        raise SetupError("Artifact exceeds the download size limit.")
                    h.update(chunk)
                    out.write(chunk)
        except SetupError:
            raise
        except Exception:
            raise SetupError("Artifact unavailable. Check Internet access, release access, or upload the archive locally.") from None
        if h.hexdigest() != digest.lower():
            raise SetupError("Artifact SHA256 mismatch; nothing was executed.")
        try:
            with tarfile.open(archive, "r:gz") as tar:
                members = tar.getmembers()
                if len(members) > 128 or sum(m.size for m in members) > MAX_ARTIFACT:
                    raise SetupError("Unexpected artifact contents.")
                binaries = []; auxiliary = {}; seen = set()
                for member in members:
                    path = Path(member.name)
                    if path.is_absolute() or ".." in path.parts or member.issym() or member.islnk() or not (member.isfile() or member.isdir()):
                        raise SetupError("Unsafe artifact archive; nothing was extracted.")
                    if member.size > MAX_BINARY:
                        raise SetupError("Artifact member exceeds the size limit.")
                    if member.name in seen:
                        raise SetupError("Duplicate artifact member.")
                    seen.add(member.name)
                    if member.name == "mymovie-agent" and member.isfile():
                        binaries.append(member)
                    elif member.isfile() and (member.name in {"mymovie-relay", "mymovie_workflow_compiler.py", "workflow-compiler-requirements.txt", "mymovie_runtime.py", "prepare-workflow-profile.py", "WORKFLOW_EXAMPLES.md", "sd15-model.json", "rembg-plugin.json", "sd15-t4_api.json", "sd15-t4_editor.json", "mask-canary.template.json", "rembg-u2netp.model.json", "mymovie-rembg.plugin.json", "mask-canary_api.json", "mask-canary_editor.json", "rembg-u2netp_api.json", "rembg-u2netp_editor.json"} or re.fullmatch(r"mymovie-rembg-[a-f0-9]{40,64}\.tar\.gz", member.name)):
                        if member.name in auxiliary: raise SetupError("Duplicate runtime helper.")
                        auxiliary[member.name] = tar.extractfile(member).read(MAX_BINARY+1)
                if len(binaries) != 1:
                    raise SetupError("Artifact must contain exactly one mymovie-agent binary.")
                data = tar.extractfile(binaries[0]).read(MAX_BINARY + 1)
        except SetupError:
            raise
        except Exception:
            raise SetupError("Artifact is not a valid agent archive.") from None
        # ELF64 little-endian x86_64: reject a GUI/Mach-O/wrong-target artifact early.
        if data[:6] != b"\x7fELF\x02\x01" or data[18:20] != b"\x3e\x00":
            raise SetupError("The artifact binary is not Linux x86_64 ELF.")
        relay = auxiliary.get("mymovie-relay")
        if require_relay and relay is None:
            raise SetupError("This archive lacks mymovie-relay. Use a current agent+relay archive for local Cloudflare mode.")
        if relay is not None and (relay[:6] != b"\x7fELF\x02\x01" or relay[18:20] != b"\x3e\x00"):
            raise SetupError("The relay binary is not Linux x86_64 ELF.")
        final_dir = destination / digest.lower()
        final_dir.mkdir(exist_ok=True)
        final = final_dir / "mymovie-agent"
        staged = Path(temporary.name) / "mymovie-agent"
        staged.write_bytes(data)
        staged.chmod(0o700)
        os.replace(staged, final)
        for name, contents in auxiliary.items():
            path = final_dir / name
            if path.is_symlink(): raise SetupError("Symlink runtime helper destination.")
            staged = Path(temporary.name) / name
            staged.write_bytes(contents); staged.chmod(0o700 if name == "mymovie-relay" else 0o600); os.replace(staged,path)
        return final
    finally:
        temporary.cleanup()


def gpu_indices() -> list[int]:
    try:
        result = subprocess.run(["nvidia-smi", "--query-gpu=index", "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=10, check=True)
        indices = [int(line.strip()) for line in result.stdout.splitlines() if line.strip()]
        if len(set(indices)) != len(indices):
            raise ValueError()
        return indices
    except Exception:
        raise SetupError("No accessible NVIDIA GPU. Enable a GPU runtime and retry.") from None


def execution_device(mode="auto", count=1):
    """CPU uses one worker; auto uses up to the requested number of CUDA GPUs."""
    if mode not in ("auto", "cpu", "cuda") or count not in (1, 2):
        raise SetupError("Choose DEVICE auto, cpu or cuda and GPU_COUNT 1 or 2.")
    if mode == "cpu":
        return "cpu", 1
    try:
        devices = gpu_indices()
    except SetupError:
        devices = []
    if mode == "cuda" and len(devices) < count:
        raise SetupError("Enable the requested GPU runtime or select DEVICE = 'auto' for CPU fallback.")
    return ("cuda", min(count, len(devices))) if devices else ("cpu", 1)


def comfy_info(url: str) -> dict:
    try:
        with urllib.request.urlopen(f"{url}/system_stats", timeout=5) as response:
            stats = json.load(response)
        with urllib.request.urlopen(f"{url}/object_info", timeout=10) as response:
            registry = json.load(response)
        if not isinstance(registry, dict) or not registry:
            raise ValueError()
        return {"stats": stats, "nodeCount": len(registry)}
    except Exception:
        raise SetupError("ComfyUI is not ready on its loopback port.") from None


def plans(count: int, prefix: str, root: Path, first_port=8188) -> list[dict]:
    if count not in (1, 2) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", prefix):
        raise SetupError("Choose 1 or 2 GPUs and a simple node prefix (letters/digits/hyphens/underscores).")
    if not 1024 <= first_port <= 65534:
        raise SetupError("Choose two available non-privileged ports.")
    return [{"gpu": i, "port": first_port + i, "nodeId": f"{prefix}-gpu{i}", "root": Path(root) / f"gpu{i}"} for i in range(count)]


class NotebookRunner:
    def __init__(self, binary: Path, relay: str, root: Path, count=1, prefix=None, first_port=8188, allow_quick_tunnel=False, cpu=False):
        self.binary = Path(binary).resolve()
        self.relay = private_url(relay, loopback=True, allow_quick_tunnel=allow_quick_tunnel)
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        # A fresh session gets a fresh node ID. Keep this object for stop/start with its receipts.
        self.prefix = prefix or f"notebook-{uuid.uuid4().hex[:10]}"
        self.cpu = cpu
        self.workers = plans(1 if cpu else count, self.prefix, self.root, first_port)
        if cpu:
            self.workers[0].update(gpu=None, nodeId=f"{self.prefix}-cpu0", root=self.root / "cpu0")
        self.children = []
        self.comfy_processes = []
        self.supervisor = self.root / "supervisor"
        self.lock = None
        self.started = None
        self.public_relay = None

    def configuration(self) -> dict:
        return {"relay": self.public_relay or self.relay, "nodes": [{"nodeId": w["nodeId"], "comfyUrl": f'http://127.0.0.1:{w["port"]}', "gpu": w["gpu"]} for w in self.workers], "relayAllowlist": ",".join(w["nodeId"] for w in self.workers)}

    def _spawn(self, args, env, cwd=None, log=None):
        # Raw subprocess logs are never copied into shared notebook outputs.
        owned_log = None
        try:
            if log is None:
                path = self.root / f"process-{len(self.children)}.log"
                path.touch(mode=0o600); path.chmod(0o600)
                owned_log = path.open("a"); log = owned_log
            child = subprocess.Popen(args, cwd=cwd, env=env, stdout=log, stderr=log, start_new_session=True)
        except Exception:
            raise SetupError("Unable to start the client. Check Linux runtime compatibility and executable permissions.") from None
        finally:
            if owned_log: owned_log.close()
        self.children.append(child)
        return child

    def _start_relay(self, token, desktop_token, port):
        if not isinstance(desktop_token, str) or not re.fullmatch(r"[!-~]{24,512}", desktop_token) or token == desktop_token:
            raise SetupError("Use a distinct desktop token of 24–512 printable characters.")
        if not isinstance(port, int) or not 1024 <= port <= 65535 or port in [w["port"] for w in self.workers]:
            raise SetupError("Choose an unused relay port from 1024 to 65535, separate from ComfyUI.")
        if self.relay != f"http://127.0.0.1:{port}":
            raise SetupError("Local relay URL must match http://127.0.0.1:RELAY_PORT.")
        binary = self.binary.parent / "mymovie-relay"
        if not binary.is_file():
            raise SetupError("Install a current client archive containing mymovie-relay for local tunnel mode.")
        with socket.socket() as sock:
            if sock.connect_ex(("127.0.0.1", port)) == 0:
                raise SetupError("Relay port is occupied. Choose another RELAY_PORT; existing processes are left running.")
        env = dict(os.environ)
        env.update(MYMOVIE_AGENT_TOKEN=token, MYMOVIE_DESKTOP_TOKEN=desktop_token,
                   MYMOVIE_NODE_IDS=self.configuration()["relayAllowlist"], MYMOVIE_RELAY_BIND=f"127.0.0.1:{port}",
                   MYMOVIE_RELAY_DATA=str(self.root / "relay-data"))
        child = self._spawn([str(binary)], env)
        deadline = time.monotonic() + 15
        request = urllib.request.Request(f'{self.relay}/v1/nodes/{self.workers[0]["nodeId"]}', headers={"Authorization": f"Bearer {desktop_token}"})
        while time.monotonic() < deadline:
            if child.poll() is not None:
                raise SetupError("Local relay exited. Check the artifact and relay port.")
            try:
                with urllib.request.urlopen(request, timeout=2) as response:
                    if response.status == 200: return
            except Exception:
                time.sleep(0.25)
        raise SetupError("Local authenticated relay did not become ready.")

    def _start_tunnel(self, binary):
        executable = shutil.which(binary)
        if not executable:
            raise SetupError("Install cloudflared in this notebook before Start, or use an external relay.")
        path = self.root / "cloudflared.log"
        if path.is_symlink(): raise SetupError("Symlink tunnel log destination.")
        env = {k: v for k, v in os.environ.items() if k not in ("MYMOVIE_AGENT_TOKEN", "MYMOVIE_DESKTOP_TOKEN", "MYMOVIE_TRANSFER_MANIFEST")}
        with path.open("w") as log:
            path.chmod(0o600)
            child = self._spawn([executable, "--no-autoupdate", "tunnel", "--url", self.relay], env, log=log)
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            if child.poll() is not None: raise SetupError("Cloudflare tunnel exited. Check notebook Internet access and cloudflared installation.")
            match = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com\b", path.read_text(errors="replace")[-65536:])
            if match:
                self.public_relay = match.group(0)
                return
            time.sleep(0.5)
        raise SetupError("Cloudflare did not return a public relay address. Retry Start or use an external relay.")

    def start(self, token: str, *, comfy_root=None, expected_revision=None, attach=False, model_paths=None, timeout=120, desktop_token=None, relay_port=8787, cloudflared=None, python=None, allow_console=False):
        if self.lock or self.children:
            raise SetupError("This runner is already started. Stop it before starting again.")
        if not isinstance(token, str) or not re.fullmatch(r"[!-~]{24,512}", token):
            raise SetupError("Set MYMOVIE_AGENT_TOKEN to 24–512 printable characters without spaces.")
        if cloudflared and desktop_token is None:
            raise SetupError("Local tunnel mode requires the desktop token to start its authenticated relay.")
        self.lock = (self.root / "runner.lock").open("a+")
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            self.lock.close(); self.lock = None
            raise SetupError("Another runner owns this working directory.") from None
        try:
            if not self.binary.is_file():
                raise SetupError("Install the verified Linux client artifact first.")
            helper = self.binary.parent / "mymovie_runtime.py"
            if not helper.is_file(): raise SetupError("This feature requires the new agent archive containing mymovie_runtime.py; rebuild with CI.")
            repo = Path(comfy_root or "").resolve()
            if not (repo / "folder_paths.py").is_file(): raise SetupError("Choose the actual ComfyUI root, including for Attach.")
            if desktop_token is not None:
                self._start_relay(token, desktop_token, relay_port)
            devices = [None] if self.cpu else gpu_indices()
            if len(devices) < len(self.workers):
                raise SetupError("Two GPUs were requested, but fewer than two are available. Select one GPU or change the runtime.")
            revision = None
            if attach and len(self.workers) == 2:
                raise SetupError("For two GPUs, use managed Start to guarantee separate device assignment; Attach supports one existing server.")
            if not attach:
                repo = Path(comfy_root or "").resolve()
                if not (repo / "main.py").is_file() or not re.fullmatch(r"[a-fA-F0-9]{40}", expected_revision or ""):
                    raise SetupError("Select an existing ComfyUI installation and its full pinned Git revision.")
                try:
                    revision = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True, timeout=5).strip()
                    dirty = subprocess.check_output(["git", "-C", str(repo), "status", "--porcelain", "--untracked-files=no"], text=True, timeout=5).strip()
                except Exception:
                    raise SetupError("Unable to verify the ComfyUI revision.") from None
                if revision != expected_revision or dirty:
                    raise SetupError("ComfyUI does not match the clean pinned revision.")
                if model_paths and not Path(model_paths).is_file():
                    raise SetupError("The selected extra-model-paths YAML is missing.")
                for w in self.workers:
                    with socket.socket() as sock:
                        if sock.connect_ex(("127.0.0.1", w["port"])) == 0:
                            raise SetupError("A ComfyUI port is occupied. Choose Attach or another port; existing processes are left running.")
                for w, device in zip(self.workers, devices):
                    w["gpu"] = device
                    w["root"].mkdir(parents=True, exist_ok=True)
                    args = [python or sys.executable, str(repo / "main.py"), "--listen", "127.0.0.1", "--port", str(w["port"]), "--disable-auto-launch"]
                    args.extend(["--cpu"] if self.cpu else ["--cuda-device", str(device)])
                    for directory in ("input", "output", "temp", "user"):
                        path = w["root"] / directory; path.mkdir(exist_ok=True)
                        args.extend([f"--{directory}-directory", str(path)])
                    if model_paths:
                        args.extend(["--extra-model-paths-config", str(Path(model_paths).resolve())])
                    # Only agent processes inherit the relay Secret.
                    env = {k: v for k, v in os.environ.items() if k not in ("MYMOVIE_AGENT_TOKEN","MYMOVIE_DESKTOP_TOKEN","MYMOVIE_TRANSFER_MANIFEST")}
                    child = self._spawn(args, env, cwd=repo)
                    self.comfy_processes.append((child, args, env, repo))
            deadline = time.monotonic() + timeout
            for w in self.workers:
                url = f'http://127.0.0.1:{w["port"]}'
                while True:
                    if any(p.poll() is not None for p in self.children):
                        raise SetupError("A ComfyUI process exited before readiness. Inspect process-*.log in the session folder for the cause.")
                    try:
                        info = comfy_info(url)
                        # Managed workers have an explicit CPU or physical GPU assignment.
                        kind = "cpu" if self.cpu else "cuda"
                        matched = [d for d in info["stats"].get("devices", []) if d.get("type") == kind]
                        if len(matched) != 1:
                            raise SetupError(f"Each notebook ComfyUI must expose exactly one {kind.upper()} device.")
                        w["deviceName"] = matched[0].get("name", "")
                        w["readiness"] = info["nodeCount"]
                        break
                    except SetupError as e:
                        if str(e) != "ComfyUI is not ready on its loopback port." or time.monotonic() >= deadline:
                            raise
                        time.sleep(1)
            for w in self.workers:
                data = w["root"] / "agent"; data.mkdir(parents=True, exist_ok=True)
                env = {k: v for k, v in os.environ.items() if k != "MYMOVIE_DESKTOP_TOKEN"}; env["MYMOVIE_AGENT_TOKEN"] = token
                agent_args = [str(self.binary), "serve", "--comfy-url", f'http://127.0.0.1:{w["port"]}', "--relay", self.relay, "--node-id", w["nodeId"], "--data", str(data), "--comfy-root", str(repo), "--python", python or sys.executable, "--runtime-helper", str(helper), "--cache", str(self.root / "dependency-cache")]
                if allow_console: agent_args.append("--allow-console")
                if not attach:
                    self.supervisor.mkdir(parents=True, exist_ok=True)
                    self.supervisor.chmod(0o700)
                    for stale in self.supervisor.glob("*.request.json"): stale.unlink()
                    agent_args.append("--managed-runtime")
                    capabilities = subprocess.run([str(self.binary), "serve", "--help"], capture_output=True, text=True, timeout=10)
                    if "--supervisor" in capabilities.stdout:
                        agent_args.extend(["--supervisor", str(self.supervisor)])
                    else:
                        print("This agent predates guided setup. Publish/install the matching current release for in-app dependency setup and restarts.", flush=True)
                if model_paths: agent_args.extend(["--model-paths",str(Path(model_paths).resolve())])
                compiler = self.binary.parent / "mymovie_workflow_compiler.py"
                if compiler.is_file(): agent_args.extend(["--workflow-compiler", str(compiler)])
                self._spawn(agent_args, env)
            if cloudflared: self._start_tunnel(cloudflared)
            self.started = time.monotonic()
            (self.root / "session.json").write_text(json.dumps({**self.configuration(), "comfyRevision": revision}, indent=2))
        except Exception as e:
            self.stop()
            if isinstance(e, SetupError):
                raise
            raise SetupError("Runner setup failed; check the installation and working directory.") from None
        return self.status()

    def _service_requests(self):
        if not self.supervisor.is_dir(): return
        for path in sorted(self.supervisor.glob("*.request.json")):
            reply = {"ok": False, "error": "Managed restart failed; inspect process logs."}
            try:
                request = json.loads(path.read_text())
                if request.get("action") != "restart-comfyui" or path.name != f'{request.get("id")}.request.json' or not re.fullmatch(r'[a-f0-9-]{36}', request.get("id", "")):
                    raise SetupError("Invalid supervisor request")
                # Check both workers before stopping either; never interrupt a queued/running job.
                for w in self.workers:
                    with urllib.request.urlopen(f'http://127.0.0.1:{w["port"]}/queue', timeout=10) as response:
                        queue = json.load(response)
                    if queue.get("queue_running") or queue.get("queue_pending"):
                        raise SetupError("ComfyUI has running or queued jobs; finish them before restart.")
                for child, _, _, _ in self.comfy_processes:
                    if child.poll() is None:
                        os.killpg(child.pid, signal.SIGTERM)
                        try: child.wait(timeout=10)
                        except subprocess.TimeoutExpired:
                            os.killpg(child.pid, signal.SIGKILL); child.wait(timeout=5)
                    self.children.remove(child)
                records = self.comfy_processes; self.comfy_processes = []
                for _, args, env, repo in records:
                    child = self._spawn(args, env, cwd=repo)
                    self.comfy_processes.append((child, args, env, repo))
                deadline = time.monotonic()+120
                for w in self.workers:
                    while True:
                        try: comfy_info(f'http://127.0.0.1:{w["port"]}'); break
                        except SetupError:
                            if time.monotonic()>deadline: raise
                            time.sleep(1)
                    data=w["root"]/"agent"
                    (data/"attestation.json").unlink(missing_ok=True)
                    (data/"runtime-epoch.json").write_text(json.dumps(time.time_ns()))
                (self.root/"dependency-cache"/"restart-required.json").unlink(missing_ok=True)
                reply={"ok": True}
            except SetupError as error:
                reply["error"]=str(error)
            except Exception:
                pass
            finally:
                path.unlink(missing_ok=True)
                dest=path.with_name(path.name.replace(".request.json", ".response.json"))
                temporary=dest.with_suffix(".writing"); temporary.write_text(json.dumps(reply)); temporary.replace(dest)

    def status(self) -> dict:
        alive = sum(p.poll() is None for p in self.children)
        return {**self.configuration(), "processesAlive": alive, "processesStarted": len(self.children), "state": "running" if alive and alive == len(self.children) else "stopped" if not self.children else "attention"}

    def run_for(self, minutes=30):
        if not isinstance(minutes, (int, float)) or not 0 < minutes <= 120:
            raise SetupError("Choose an interactive run of at most 120 minutes.")
        try:
            end = time.monotonic() + minutes * 60
            while time.monotonic() < end:
                self._service_requests()
                if self.status()["state"] != "running":
                    raise SetupError("A worker exited. Keep receipts and inspect connection status before restarting.")
                time.sleep(2)
        finally:
            self.stop()

    def stop(self):
        for p in reversed(self.children):
            if p.poll() is None:
                try:
                    os.killpg(p.pid, signal.SIGTERM)
                    p.wait(timeout=10)
                except ProcessLookupError:
                    pass
                except subprocess.TimeoutExpired:
                    try: os.killpg(p.pid, signal.SIGKILL)
                    except ProcessLookupError: pass
                    p.wait(timeout=5)
        self.children.clear()
        self.comfy_processes.clear()
        self.public_relay = None
        if self.lock:
            fcntl.flock(self.lock, fcntl.LOCK_UN); self.lock.close(); self.lock = None
        return self.status()


if __name__ == "__main__":
    print("Setup helpers loaded. Run all continues with automatic installation and startup.", flush=True)
