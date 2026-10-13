"""Package the CI-built ELF client, notebooks and reproducibility metadata."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile

p = argparse.ArgumentParser()
p.add_argument("binary", type=Path); p.add_argument("destination", type=Path)
a = p.parse_args(); a.destination.mkdir(parents=True, exist_ok=True)
root = Path(__file__).resolve().parents[1]
archive = a.destination / "mymovie-agent-linux-x86_64.tar.gz"
with tarfile.open(archive, "w:gz") as tar:
    tar.add(a.binary, arcname="mymovie-agent", recursive=False)
files = [archive]
for host in ["colab", "kaggle"]:
    dest = a.destination / f"MyMovie_ComfyUI_{host}.ipynb"
    dest.write_bytes((root / f"deploy/{host}/MyMovie_ComfyUI.ipynb").read_bytes()); files.append(dest)
helper = a.destination / "notebook-bootstrap.py"; helper.write_bytes((root / "scripts/notebook-bootstrap.py").read_bytes()); files.append(helper)
manifest = {"target":"x86_64-unknown-linux-gnu", "buildOS":"ubuntu-22.04", "commit":subprocess.check_output(["git","rev-parse","HEAD"],text=True).strip(), "sha256":hashlib.sha256(archive.read_bytes()).hexdigest(), "binarySha256":hashlib.sha256(a.binary.read_bytes()).hexdigest(), "bootstrapSha256":hashlib.sha256(helper.read_bytes()).hexdigest()}
metadata = a.destination / "mymovie-agent-linux-x86_64.json"; metadata.write_text(json.dumps(manifest,indent=2)+"\n"); files.append(metadata)
(a.destination / "SHA256SUMS-agent.txt").write_text("".join(f"{hashlib.sha256(f.read_bytes()).hexdigest()}  {f.name}\n" for f in files))
