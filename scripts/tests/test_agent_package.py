"""The RunPod artifact must contain an ELF x86_64 agent, guide and checksums."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class AgentPackageTests(unittest.TestCase):
    def run_packager(self, binary, dest, architecture="x86_64"):
        return subprocess.run([sys.executable, str(ROOT / "scripts/package-agent.py"), str(binary), str(dest), "--architecture", architecture], capture_output=True, text=True)

    def test_archive_metadata_and_guide(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            binary = directory / "agent"
            binary.write_bytes(b"\x7fELF\x02\x01" + bytes(12) + b"\x3e\x00" + b"fixture-payload")
            binary.chmod(0o755)
            dest = directory / "dist"
            result = self.run_packager(binary, dest)
            self.assertEqual(result.returncode, 0, result.stderr)
            archive = dest / "mymovie-agent-linux-x86_64.tar.gz"
            with tarfile.open(archive) as tar:
                self.assertEqual(tar.getnames()[:3], ["mymovie-agent", "README-RunPod.md", "mymovie_runtime.py"])
                self.assertIn("mymovie_workflow_compiler.py", tar.getnames())
                self.assertIn("workflow-compiler-requirements.txt", tar.getnames())
                self.assertIn("mask-canary_api.json", tar.getnames())
                self.assertIn("mymovie-rembg.plugin.json", tar.getnames())
                self.assertLessEqual(len(tar.getnames()), 18)
                self.assertEqual(tar.extractfile("mymovie-agent").read(), binary.read_bytes())
                self.assertTrue(tar.getmember("mymovie-agent").mode & 0o111)
            metadata = json.loads((dest / "mymovie-agent-linux-x86_64.json").read_text())
            self.assertEqual(metadata["sha256"], hashlib.sha256(archive.read_bytes()).hexdigest())
            self.assertEqual(metadata["binarySha256"], hashlib.sha256(binary.read_bytes()).hexdigest())
            for line in (dest / "SHA256SUMS-agent.txt").read_text().splitlines():
                digest, name = line.split("  ")
                self.assertEqual(digest, hashlib.sha256((dest / name).read_bytes()).hexdigest())

    def test_rejects_macos_and_wrong_architecture(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            for header in [b"Mach-O" + bytes(20), b"\x7fELF\x02\x01" + bytes(12) + b"\xb7\x00"]:
                binary = directory / "agent"
                binary.write_bytes(header)
                result = self.run_packager(binary, directory / "dist")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("Expected a Linux ELF64", result.stderr)

    def test_arm_archive_is_distinct_and_rejects_x86_binary(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            binary = directory / "agent"
            binary.write_bytes(b"\x7fELF\x02\x01" + bytes(12) + b"\xb7\x00" + b"arm-payload")
            binary.chmod(0o755)
            dest = directory / "dist"
            result = self.run_packager(binary, dest, "aarch64")
            self.assertEqual(result.returncode, 0, result.stderr)
            metadata = json.loads((dest / "mymovie-agent-linux-aarch64.json").read_text())
            self.assertEqual(metadata["target"], "aarch64-unknown-linux-gnu")
            archive = dest / "mymovie-agent-linux-aarch64.tar.gz"
            self.assertEqual(metadata["sha256"], hashlib.sha256(archive.read_bytes()).hexdigest())
            self.assertTrue((dest / "SHA256SUMS-agent-aarch64.txt").exists())
            binary.write_bytes(b"\x7fELF\x02\x01" + bytes(12) + b"\x3e\x00")
            self.assertNotEqual(self.run_packager(binary, dest, "aarch64").returncode, 0)

    def test_macos_compiler_archive(self):
        with tempfile.TemporaryDirectory() as temp:
            directory=Path(temp); binary=directory/'agent'
            binary.write_bytes(b"\xcf\xfa\xed\xfe\x0c\x00\x00\x01"+bytes(32));binary.chmod(0o755)
            dest=directory/'dist'
            result=subprocess.run([sys.executable,str(ROOT/'scripts/package-agent.py'),str(binary),str(dest),'--platform','macos','--architecture','aarch64'],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            metadata=json.loads((dest/'mymovie-agent-macos-aarch64.json').read_text())
            self.assertEqual(metadata['target'],'aarch64-apple-darwin')
            with tarfile.open(dest/'mymovie-agent-macos-aarch64.tar.gz') as archive:
                self.assertEqual(hashlib.sha256(archive.extractfile('mymovie_workflow_compiler.py').read()).hexdigest(),metadata['compilerSha256'])
