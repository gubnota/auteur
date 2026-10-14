"""Verified Linux agent deployment and two independent notebook GPU workers.

Stdlib only. No tunnels, model downloads, package installers or anti-idle code.
"""
from __future__ import annotations

import fcntl
import hashlib
import json
import os
from pathlib import Path
import platform
import re
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


def install_artifact(source: str, digest: str, destination: Path, download_token=None) -> Path:
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
                if len(members) > 16:
                    raise SetupError("Unexpected artifact contents.")
                binaries = []; auxiliary = {}
                for member in members:
                    path = Path(member.name)
                    if path.is_absolute() or ".." in path.parts or member.issym() or member.islnk() or not (member.isfile() or member.isdir()):
                        raise SetupError("Unsafe artifact archive; nothing was extracted.")
                    if member.size > MAX_BINARY:
                        raise SetupError("Artifact member exceeds the size limit.")
                    if member.name == "mymovie-agent" and member.isfile():
                        binaries.append(member)
                    elif member.isfile() and (member.name in {"mymovie_runtime.py", "prepare-workflow-profile.py", "mask-canary.template.json", "rembg-u2netp.model.json", "mymovie-rembg.plugin.json", "mask-canary_api.json", "mask-canary_editor.json", "rembg-u2netp_api.json", "rembg-u2netp_editor.json"} or re.fullmatch(r"mymovie-rembg-[a-f0-9]{40,64}\.tar\.gz", member.name)):
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
            staged.write_bytes(contents); staged.chmod(0o600); os.replace(staged,path)
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
    def __init__(self, binary: Path, relay: str, root: Path, count=1, prefix=None, first_port=8188, allow_quick_tunnel=False):
        self.binary = Path(binary).resolve()
        self.relay = private_url(relay, loopback=True, allow_quick_tunnel=allow_quick_tunnel)
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        # A fresh session gets a fresh node ID. Keep this object for stop/start with its receipts.
        self.prefix = prefix or f"notebook-{uuid.uuid4().hex[:10]}"
        self.workers = plans(count, self.prefix, self.root, first_port)
        self.children = []
        self.lock = None
        self.started = None

    def configuration(self) -> dict:
        return {"relay": self.relay, "nodes": [{"nodeId": w["nodeId"], "comfyUrl": f'http://127.0.0.1:{w["port"]}', "gpu": w["gpu"]} for w in self.workers], "relayAllowlist": ",".join(w["nodeId"] for w in self.workers)}

    def _spawn(self, args, env, cwd=None):
        # Raw subprocess logs are never copied into shared notebook outputs.
        try:
            child = subprocess.Popen(args, cwd=cwd, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        except Exception:
            raise SetupError("Unable to start the client. Check Linux runtime compatibility and executable permissions.") from None
        self.children.append(child)
        return child

    def start(self, token: str, *, comfy_root=None, expected_revision=None, attach=False, model_paths=None, timeout=120):
        if self.lock or self.children:
            raise SetupError("This runner is already started. Stop it before starting again.")
        if not isinstance(token, str) or len(token) < 24 or any(c.isspace() for c in token):
            raise SetupError("Grant access to a valid MYMOVIE_AGENT_TOKEN Secret.")
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
            devices = gpu_indices()
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
                    args = [sys.executable, str(repo / "main.py"), "--listen", "127.0.0.1", "--port", str(w["port"]), "--cuda-device", str(device), "--disable-auto-launch"]
                    for directory in ("input", "output", "temp", "user"):
                        path = w["root"] / directory; path.mkdir(exist_ok=True)
                        args.extend([f"--{directory}-directory", str(path)])
                    if model_paths:
                        args.extend(["--extra-model-paths-config", str(Path(model_paths).resolve())])
                    # Only agent processes inherit the relay Secret.
                    env = {k: v for k, v in os.environ.items() if k not in ("MYMOVIE_AGENT_TOKEN","MYMOVIE_TRANSFER_MANIFEST")}
                    self._spawn(args, env, cwd=repo)
            deadline = time.monotonic() + timeout
            for w in self.workers:
                url = f'http://127.0.0.1:{w["port"]}'
                while True:
                    if any(p.poll() is not None for p in self.children):
                        raise SetupError("A ComfyUI process exited before readiness. Check its installation and GPU memory.")
                    try:
                        info = comfy_info(url)
                        # Managed workers have explicitly assigned physical GPU indices.
                        cuda = [d for d in info["stats"].get("devices", []) if d.get("type") == "cuda"]
                        if len(cuda) != 1:
                            raise SetupError("Each notebook ComfyUI must expose exactly one CUDA GPU.")
                        w["deviceName"] = cuda[0].get("name", "")
                        w["readiness"] = info["nodeCount"]
                        break
                    except SetupError as e:
                        if str(e) != "ComfyUI is not ready on its loopback port." or time.monotonic() >= deadline:
                            raise
                        time.sleep(1)
            for w in self.workers:
                data = w["root"] / "agent"; data.mkdir(parents=True, exist_ok=True)
                env = dict(os.environ); env["MYMOVIE_AGENT_TOKEN"] = token
                agent_args = [str(self.binary), "serve", "--comfy-url", f'http://127.0.0.1:{w["port"]}', "--relay", self.relay, "--node-id", w["nodeId"], "--data", str(data), "--comfy-root", str(repo), "--python", sys.executable, "--runtime-helper", str(helper), "--cache", str(self.root / "dependency-cache")]
                if not attach: agent_args.append("--managed-runtime")
                if model_paths: agent_args.extend(["--model-paths",str(Path(model_paths).resolve())])
                self._spawn(agent_args, env)
            self.started = time.monotonic()
            (self.root / "session.json").write_text(json.dumps({**self.configuration(), "comfyRevision": revision}, indent=2))
        except Exception as e:
            self.stop()
            if isinstance(e, SetupError):
                raise
            raise SetupError("Runner setup failed; check the installation and working directory.") from None
        return self.status()

    def status(self) -> dict:
        alive = sum(p.poll() is None for p in self.children)
        return {**self.configuration(), "processesAlive": alive, "processesStarted": len(self.children), "state": "running" if alive and alive == len(self.children) else "stopped" if not self.children else "attention"}

    def run_for(self, minutes=30):
        if not isinstance(minutes, (int, float)) or not 0 < minutes <= 120:
            raise SetupError("Choose an interactive run of at most 120 minutes.")
        try:
            end = time.monotonic() + minutes * 60
            while time.monotonic() < end:
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
        if self.lock:
            fcntl.flock(self.lock, fcntl.LOCK_UN); self.lock.close(); self.lock = None
        return self.status()
