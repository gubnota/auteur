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
    def run_packager(self, binary, dest):
        return subprocess.run([sys.executable, str(ROOT / "scripts/package-agent.py"), str(binary), str(dest)], capture_output=True, text=True)

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
                self.assertEqual(tar.getnames(), ["mymovie-agent", "README-RunPod.md"])
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
