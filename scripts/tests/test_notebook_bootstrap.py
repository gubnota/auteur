import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("notebook_bootstrap", ROOT / "scripts/notebook-bootstrap.py")
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)


class BootstrapTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = Path(self.tmp.name)
    def tearDown(self): self.tmp.cleanup()
    def archive(self, name="mymovie-agent", link=False, bad_binary=False):
        path = self.root / "agent.tar.gz"
        with tarfile.open(path, "w:gz") as tar:
            item = tarfile.TarInfo(name)
            data = b"wrong" if bad_binary else b"\x7fELF\x02\x01" + b"\x00" * 12 + b"\x3e\x00" + b"test"
            item.size = len(data)
            if link: item.type = tarfile.SYMTYPE; item.linkname = "/tmp/other"
            tar.addfile(item, None if link else io.BytesIO(data))
        return path, hashlib.sha256(path.read_bytes()).hexdigest()
    def install(self, path, digest):
        with patch.object(b.platform, "system", return_value="Linux"), patch.object(b.platform, "machine", return_value="x86_64"):
            return b.install_artifact(str(path), digest, self.root / "installed")
    def test_trusted_binary_and_digest_rejection(self):
        path, digest = self.archive()
        result = self.install(path, digest)
        self.assertTrue(result.is_file()); self.assertEqual(result.stat().st_mode & 0o777, 0o700)
        with self.assertRaisesRegex(b.SetupError, "mismatch"): self.install(path, "0" * 64)
    def test_traversal_links_and_wrong_architecture(self):
        for name, link, bad in [("../mymovie-agent", False, False), ("/mymovie-agent", False, False), ("mymovie-agent", True, False), ("mymovie-agent", False, True)]:
            path, digest = self.archive(name, link, bad)
            with self.assertRaises(b.SetupError): self.install(path, digest)
        with patch.object(b.platform, "machine", return_value="arm64"):
            with self.assertRaisesRegex(b.SetupError, "Linux x86_64"): b.install_artifact("file", "0"*64, self.root)
    def test_network_errors_do_not_leak_tokens(self):
        token = "SECRET_PRIVATE_DOWNLOAD_VALUE"
        opener = types.SimpleNamespace(open=lambda *a, **k: (_ for _ in ()).throw(RuntimeError(token)))
        with patch.object(b.platform, "system", return_value="Linux"), patch.object(b.platform, "machine", return_value="x86_64"), patch.object(b.urllib.request, "build_opener", return_value=opener):
            with self.assertRaises(b.SetupError) as error: b.install_artifact("https://example.com/agent", "0"*64, self.root, token)
        self.assertNotIn(token, str(error.exception))
    def test_redirect_strips_cross_host_authorization(self):
        request = b.urllib.request.Request("https://api.github.com/assets/1", headers={"Authorization":"Bearer secret"})
        redirect = b.NoRedirect().redirect_request(request, None, 302, "", {}, "https://release-assets.githubusercontent.com/asset?signature=example")
        self.assertFalse(redirect.has_header("Authorization"))
    def test_secrets_and_missing_grants(self):
        value = "x" * 32
        google = types.ModuleType("google"); colab = types.ModuleType("google.colab")
        colab.userdata = types.SimpleNamespace(get=lambda label: value)
        kaggle = types.ModuleType("kaggle_secrets"); kaggle.UserSecretsClient = lambda: types.SimpleNamespace(get_secret=lambda label: value)
        with patch.dict(sys.modules, {"google":google,"google.colab":colab,"kaggle_secrets":kaggle}):
            self.assertEqual(b.secret("colab","MYMOVIE_AGENT_TOKEN"), value)
            self.assertEqual(b.secret("kaggle","MYMOVIE_AGENT_TOKEN"), value)
            colab.userdata.get = lambda label: (_ for _ in ()).throw(RuntimeError(value))
            with self.assertRaises(b.SetupError) as error: b.secret("colab","MYMOVIE_AGENT_TOKEN")
            self.assertNotIn(value,str(error.exception))
    def test_separate_gpu_port_and_directories(self):
        workers = b.plans(2,"session",self.root,8190)
        self.assertEqual([w["port"] for w in workers],[8190,8191])
        self.assertEqual([w["gpu"] for w in workers],[0,1])
        self.assertEqual([w["nodeId"] for w in workers],["session-gpu0","session-gpu1"])
        self.assertNotEqual(workers[0]["root"],workers[1]["root"])
    def test_lock_duplicate_start_and_stop_ownership(self):
        binary = self.root / "mymovie-agent"; binary.touch()
        (self.root / "mymovie_runtime.py").touch()
        repo = self.root / "ComfyUI"; repo.mkdir(exist_ok=True); (repo / "folder_paths.py").touch()
        runner = b.NotebookRunner(binary,"https://example.com",self.root,count=1)
        other = b.NotebookRunner(binary,"https://example.com",self.root,count=1)
        fake = types.SimpleNamespace(pid=100, poll=lambda: None, wait=lambda timeout: None)
        with patch.object(b,"gpu_indices",return_value=[0]), patch.object(b,"comfy_info",return_value={"stats":{"devices":[{"type":"cuda","name":"cuda:0 T4"}]},"nodeCount":3}), patch.object(b.subprocess,"Popen",return_value=fake), patch.object(b.os,"killpg") as kill:
            runner.start("x"*32,attach=True,comfy_root=repo)
            with self.assertRaisesRegex(b.SetupError,"already started"): runner.start("x"*32,attach=True,comfy_root=repo)
            with self.assertRaisesRegex(b.SetupError,"Another runner"): other.start("x"*32,attach=True,comfy_root=repo)
            runner.stop(); kill.assert_called_once_with(100,b.signal.SIGTERM)
        self.assertEqual(runner.status()["state"],"stopped")
    def test_two_gpu_request_cannot_silently_fall_back_to_one(self):
        binary = self.root / "mymovie-agent"; binary.touch()
        (self.root / "mymovie_runtime.py").touch()
        repo = self.root / "ComfyUI"; repo.mkdir(exist_ok=True); (repo / "folder_paths.py").touch()
        runner = b.NotebookRunner(binary,"https://example.com",self.root,count=2)
        with patch.object(b,"gpu_indices",return_value=[0]):
            with self.assertRaisesRegex(b.SetupError,"fewer than two"): runner.start("x"*32,comfy_root=repo)
        self.assertIsNone(runner.lock)
    def test_managed_two_gpu_launches_isolated_servers_and_agents(self):
        binary = self.root / "mymovie-agent"; binary.touch()
        (self.root / "mymovie_runtime.py").touch()
        repo = self.root / "ComfyUI"; repo.mkdir(exist_ok=True); (repo / "folder_paths.py").touch()
        repo = self.root / "ComfyUI"; repo.mkdir(exist_ok=True); (repo / "main.py").touch()
        revision = "a" * 40
        runner = b.NotebookRunner(binary,"https://example.com",self.root / "session",count=2,prefix="test",first_port=8190)
        fake = types.SimpleNamespace(pid=100, poll=lambda: None, wait=lambda timeout: None)
        # MagicMock provides socket's context-manager methods.
        from unittest.mock import MagicMock
        sock = MagicMock(); sock.__enter__.return_value.connect_ex.return_value = 1
        with patch.object(b,"gpu_indices",return_value=[0,1]), patch.object(b,"comfy_info",return_value={"stats":{"devices":[{"type":"cuda","name":"T4"}]},"nodeCount":3}), patch.object(b.subprocess,"check_output",side_effect=[revision,""]), patch.object(b.socket,"socket",return_value=sock), patch.object(b.subprocess,"Popen",return_value=fake) as spawn, patch.object(b.os,"killpg"):
            runner.start("s"*32,comfy_root=repo,expected_revision=revision)
            self.assertEqual(spawn.call_count,4)
            calls = spawn.call_args_list
            for i in range(2):
                server, agent = calls[i], calls[i+2]
                args = server.args[0]
                self.assertEqual(args[args.index("--port")+1],str(8190+i))
                self.assertEqual(args[args.index("--cuda-device")+1],str(i))
                self.assertNotIn("MYMOVIE_AGENT_TOKEN",server.kwargs["env"])
                self.assertEqual(agent.kwargs["env"]["MYMOVIE_AGENT_TOKEN"],"s"*32)
                self.assertIn(f"test-gpu{i}",agent.args[0])
            self.assertNotEqual(calls[0].args[0],calls[1].args[0])
            self.assertEqual(runner.status()["processesAlive"],4)
            runner.stop()
    def test_notebooks_embed_same_helper_without_outputs(self):
        for host in ["colab","kaggle"]:
            data = json.loads((ROOT / f"deploy/{host}/MyMovie_ComfyUI.ipynb").read_text())
            self.assertEqual("".join(data["cells"][1]["source"]), (ROOT / "scripts/notebook-bootstrap.py").read_text())
            for cell in data["cells"]:
                if cell["cell_type"] == "code":
                    self.assertEqual(cell["outputs"],[]); compile("".join(cell["source"]),"notebook","exec")


if __name__ == "__main__": unittest.main()
