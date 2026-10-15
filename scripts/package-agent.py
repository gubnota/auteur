"""Package the CI-built RunPod/ComfyUI ELF agent and reproducibility metadata."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
import gzip
import io

p = argparse.ArgumentParser()
p.add_argument("binary", type=Path); p.add_argument("destination", type=Path)
p.add_argument("--architecture", choices=["x86_64", "aarch64"], default="x86_64")
p.add_argument("--platform", choices=["linux","macos"], default="linux")
p.add_argument("--build-os", default="ubuntu-22.04")
p.add_argument("--relay-binary", type=Path, help="Bundle the matching relay; defaults to the agent's sibling when present")
a = p.parse_args(); a.destination.mkdir(parents=True, exist_ok=True)
root = Path(__file__).resolve().parents[1]
header = a.binary.read_bytes()[:20]
if a.platform == "linux":
    machine = {"x86_64": b"\x3e\x00", "aarch64": b"\xb7\x00"}[a.architecture]
    if len(header) < 20 or header[:6] != b"\x7fELF\x02\x01" or header[18:20] != machine:
        raise SystemExit(f"Expected a Linux ELF64 little-endian {a.architecture} agent binary")
else:
    cpu = {"x86_64": b"\x07\x00\x00\x01", "aarch64": b"\x0c\x00\x00\x01"}[a.architecture]
    if header[:4] != b"\xcf\xfa\xed\xfe" or header[4:8] != cpu:
        raise SystemExit(f"Expected a macOS Mach-O64 {a.architecture} agent binary")
relay = a.relay_binary or a.binary.with_name("mymovie-relay")
if a.relay_binary and not relay.is_file():
    raise SystemExit("Relay binary is missing")
if relay.is_file():
    relay_header = relay.read_bytes()[:20]
    if (a.platform == "linux" and (relay_header[:6] != b"\x7fELF\x02\x01" or relay_header[18:20] != machine)) or (a.platform == "macos" and (relay_header[:4] != b"\xcf\xfa\xed\xfe" or relay_header[4:8] != cpu)):
        raise SystemExit("Relay binary does not match the agent platform and architecture")
archive = a.destination / f"mymovie-agent-{a.platform}-{a.architecture}.tar.gz"
commit = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"],text=True).strip()
# Deterministic, minimal plugin archive: no repository, personal files or weights.
plugin = a.destination / f"mymovie-rembg-{commit}.tar.gz"
data = (root / "deploy/comfy_nodes/mymovie_rembg/__init__.py").read_bytes()
with plugin.open('wb') as f, gzip.GzipFile(fileobj=f, mode='wb', filename='', mtime=0) as gz, tarfile.open(fileobj=gz, mode='w') as tar:
    entry = tarfile.TarInfo('__init__.py'); entry.size = len(data); entry.mode = 0o644
    tar.addfile(entry, io.BytesIO(data))
plugin_metadata = a.destination / 'mymovie-rembg.plugin.json'
plugin_metadata.write_text(json.dumps(dict(kind='plugin',category='custom_nodes',target='mymovie_rembg',
    sha256=hashlib.sha256(plugin.read_bytes()).hexdigest(),size=plugin.stat().st_size,
    license='Apache-2.0 OR MIT',architecture='any',revision=commit,stripPrefix='',source='',sourceRef=plugin.name),indent=2)+'\n')
extras = [plugin, plugin_metadata]
for name in ['sd15-model.json', 'rembg-plugin.json']:
    source = root / 'examples/catalogue' / name
    target = a.destination / name; target.write_bytes(source.read_bytes()); extras.append(target)
guide_examples = a.destination / 'WORKFLOW_EXAMPLES.md'
guide_examples.write_bytes((root / 'docs/WORKFLOW_EXAMPLES.md').read_bytes()); extras.append(guide_examples)
for source in [root / 'scripts/prepare-workflow-profile.py', *sorted((root / 'examples/provision').glob('*.json')),
               *sorted((root / 'examples/workflows').glob('sd15-t4_*.json')), *sorted((root / 'examples/workflows').glob('mask-canary_*.json')), *sorted((root / 'examples/workflows').glob('rembg-u2netp_*.json'))]:
    target = a.destination / source.name; target.write_bytes(source.read_bytes()); extras.append(target)
with tarfile.open(archive, "w:gz") as tar:
    tar.add(a.binary, arcname="mymovie-agent", recursive=False)
    tar.add(root / "deploy/runpod/README.md", arcname="README-RunPod.md", recursive=False)
    tar.add(root / "deploy/runner/mymovie_runtime.py", arcname="mymovie_runtime.py", recursive=False)
    tar.add(root / "deploy/runner/mymovie_local.py", arcname="mymovie_local.py", recursive=False)
    tar.add(root / "deploy/runner/mymovie_workflow_compiler.py", arcname="mymovie_workflow_compiler.py", recursive=False)
    tar.add(root / "deploy/runner/workflow-compiler-requirements.txt", arcname="workflow-compiler-requirements.txt", recursive=False)
    tar.add(root / "scripts/notebook-bootstrap.py", arcname="notebook-bootstrap.py", recursive=False)
    if relay.is_file():
        tar.add(relay, arcname="mymovie-relay", recursive=False)
    for extra in extras:
        tar.add(extra, arcname=extra.name, recursive=False)
files = [archive, *extras]
guide = a.destination / "README-RunPod.md"; guide.write_bytes((root / "deploy/runpod/README.md").read_bytes()); files.append(guide)
for host in ["colab", "kaggle"]:
    dest = a.destination / f"MyMovie_ComfyUI_{host}.ipynb"
    dest.write_bytes((root / f"deploy/{host}/MyMovie_ComfyUI.ipynb").read_bytes()); files.append(dest)
helper = a.destination / "notebook-bootstrap.py"; helper.write_bytes((root / "scripts/notebook-bootstrap.py").read_bytes()); files.append(helper)
manifest = {"target":f"{a.architecture}-{'unknown-linux-gnu' if a.platform == 'linux' else 'apple-darwin'}", "guidedSetupVersion":1, "initializationVersion":1, "consoleVersion":1, "modelCredentialsVersion":1, "localSupervisorVersion":1, "telemetryVersion":1, "managedRestartVersion":1, "compilerVersion":"frontend-export-v1", "compilerSha256":hashlib.sha256((root / "deploy/runner/mymovie_workflow_compiler.py").read_bytes()).hexdigest(), "compilerRequirementsSha256":hashlib.sha256((root / "deploy/runner/workflow-compiler-requirements.txt").read_bytes()).hexdigest(), "browserInstall":"python -m playwright install chromium", "buildOS":a.build_os, "commit":subprocess.check_output(["git","rev-parse","HEAD"],text=True).strip(), "sha256":hashlib.sha256(archive.read_bytes()).hexdigest(), "binarySha256":hashlib.sha256(a.binary.read_bytes()).hexdigest(), "bootstrapSha256":hashlib.sha256(helper.read_bytes()).hexdigest(), "runtimeHelperSha256":hashlib.sha256((root / "deploy/runner/mymovie_runtime.py").read_bytes()).hexdigest()}
if relay.is_file(): manifest["relayBinarySha256"] = hashlib.sha256(relay.read_bytes()).hexdigest()
metadata = a.destination / f"mymovie-agent-{a.platform}-{a.architecture}.json"; metadata.write_text(json.dumps(manifest,indent=2)+"\n"); files.append(metadata)
checksums = f"SHA256SUMS-agent-macos-{a.architecture}.txt" if a.platform == "macos" else "SHA256SUMS-agent.txt" if a.architecture == "x86_64" else f"SHA256SUMS-agent-{a.architecture}.txt"
(a.destination / checksums).write_text("".join(f"{hashlib.sha256(f.read_bytes()).hexdigest()}  {f.name}\n" for f in files))
