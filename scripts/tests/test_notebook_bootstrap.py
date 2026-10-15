import hashlib
import importlib.util
import io
import ast
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
    def release_response(self, manifest=None, **archive_overrides):
        manifest = manifest if manifest is not None else {
            'target': 'x86_64-unknown-linux-gnu', 'sha256': 'a'*64, 'relayBinarySha256': 'b'*64}
        release = {'tag_name': 'v0.1.13', 'draft': False, 'prerelease': True,
                   'published_at': '2026-10-15T00:00:00Z', 'assets': [
                       {'id': 1, 'name': 'mymovie-agent-linux-x86_64.tar.gz', 'digest': 'sha256:'+'a'*64, **archive_overrides},
                       {'id': 2, 'name': 'mymovie-agent-linux-x86_64.json'}]}
        calls = []
        def open_request(request, **kwargs):
            calls.append(request)
            data = manifest if request.full_url.endswith('/assets/2') else release if '/tags/' in request.full_url else [release]
            return io.BytesIO(json.dumps(data).encode())
        return types.SimpleNamespace(open=open_request), calls

    def test_release_resolution_includes_prereleases_and_verifies_metadata(self):
        opener, calls = self.release_response()
        with patch.object(b.urllib.request, 'build_opener', return_value=opener):
            release = b.release_artifact()
            self.assertEqual(release, {'source': 'https://api.github.com/repos/gubnota/auteur/releases/assets/1', 'sha256': 'a'*64, 'tag': 'v0.1.13'})
            self.assertIn('/releases?per_page=', calls[0].full_url)
            self.assertFalse(any(r.has_header('Authorization') for r in calls))
            b.release_artifact(tag='v0.1.13', download_token='PRIVATE_TEST_TOKEN')
            self.assertIn('/tags/v0.1.13', calls[-2].full_url)
            self.assertEqual(calls[-1].get_header('Authorization'), 'Bearer PRIVATE_TEST_TOKEN')

    def test_release_rejects_legacy_relay_missing_and_checksum_conflicts(self):
        for manifest, archive, message in [
            ({'target': 'x86_64-unknown-linux-gnu', 'sha256': 'a'*64}, {}, 'lacks mymovie-relay'),
            (None, {'digest': 'sha256:'+'c'*64}, 'checksums disagree'),
            (None, {'digest': 42}, 'checksums disagree'),
            ({'target': 'x86_64-unknown-linux-gnu', 'sha256': ''}, {}, 'valid archive SHA256'),
            ({'target': 'aarch64-unknown-linux-gnu'}, {}, 'Linux x86_64 agent')]:
            opener, _ = self.release_response(manifest, **archive)
            with patch.object(b.urllib.request, 'build_opener', return_value=opener):
                with self.assertRaisesRegex(b.SetupError, message): b.release_artifact()
        opener, _ = self.release_response({'target': 'x86_64-unknown-linux-gnu', 'sha256': 'a'*64})
        with patch.object(b.urllib.request, 'build_opener', return_value=opener):
            self.assertEqual(b.release_artifact(require_relay=False)['sha256'], 'a'*64)

    def test_release_unavailable_does_not_claim_public_repository_is_private_or_leak_secret(self):
        token = 'PRIVATE_TEST_TOKEN'
        opener = types.SimpleNamespace(open=lambda *a, **kw: (_ for _ in ()).throw(RuntimeError(token)))
        with patch.object(b.urllib.request, 'build_opener', return_value=opener):
            with self.assertRaisesRegex(b.SetupError, 'Public releases need no token') as error:
                b.release_artifact(download_token=token)
        self.assertNotIn(token, str(error.exception))
        opener = types.SimpleNamespace(open=lambda *a, **kw: io.BytesIO(b'[]'))
        with patch.object(b.urllib.request, 'build_opener', return_value=opener):
            with self.assertRaisesRegex(b.SetupError, 'tag alone'): b.release_artifact()

    def test_local_tunnel_requires_relay_before_installing_agent(self):
        path, digest = self.archive()
        with patch.object(b.platform, 'system', return_value='Linux'), patch.object(b.platform, 'machine', return_value='x86_64'):
            with self.assertRaisesRegex(b.SetupError, 'lacks mymovie-relay'):
                b.install_artifact(str(path), digest, self.root / 'installed', require_relay=True)
        self.assertFalse((self.root / 'installed' / digest).exists())

    def test_generated_setup_resolves_blank_defaults_and_passes_digest_and_relay_requirement(self):
        from unittest.mock import Mock
        for host in ['colab', 'kaggle']:
            notebook = json.loads((ROOT / f'deploy/{host}/MyMovie_ComfyUI.ipynb').read_text())
            config = ''.join(notebook['cells'][3]['source'])
            setup = ''.join(notebook['cells'][5]['source'])
            self.assertTrue(setup.startswith('import platform\n'))
            resolve = Mock(return_value={'source': 'https://example.com/agent', 'sha256': 'a'*64, 'tag': 'v0.1.13'})
            install = Mock(return_value=self.root / 'mymovie-agent')
            runner = Mock(); runner.configuration.return_value = {}
            runtime_platform = types.ModuleType('platform')
            runtime_platform.system = lambda: 'Linux'
            runtime_platform.machine = lambda: 'x86_64'
            namespace = {'secret': b.secret, 'release_artifact': resolve, 'install_artifact': install,
                         'NotebookRunner': Mock(return_value=runner), 'SetupError': b.SetupError, 'json': json, 'print': Mock(),
                         'gpu_indices': lambda: [0, 1], 'prepare_runtime': Mock(return_value={'python': '/env/python', 'cloudflared': '/bin/cloudflared'})}
            exec(config, namespace)
            with patch.dict(sys.modules, {'platform': runtime_platform}):
                exec(setup, namespace)
            resolve.assert_called_once_with('gubnota/auteur', '', None, require_relay=True)
            install.assert_called_once_with('https://example.com/agent', 'a'*64, namespace['WORK_DIR'] / 'artifacts', None, require_relay=True)
            namespace.pop('runner')
            namespace['ARTIFACT_SOURCE'] = '/uploaded/archive.tar.gz'
            with patch.dict(sys.modules, {'platform': runtime_platform}):
                with self.assertRaisesRegex(b.SetupError, 'set both'): exec(setup, namespace)
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
        with patch.object(b,"gpu_indices",return_value=[0,1]), patch.object(b,"comfy_info",return_value={"stats":{"devices":[{"type":"cuda","name":"T4"}]},"nodeCount":3}), patch.object(b.subprocess,"check_output",side_effect=[revision,""]), patch.object(b.subprocess,"run",return_value=types.SimpleNamespace(stdout="--supervisor")), patch.object(b.socket,"socket",return_value=sock), patch.object(b.subprocess,"Popen",return_value=fake) as spawn, patch.object(b.os,"killpg"):
            runner.start("s"*32,comfy_root=repo,expected_revision=revision,python="/fixture/env/bin/python")
            self.assertEqual(spawn.call_count,4)
            calls = spawn.call_args_list
            for i in range(2):
                server, agent = calls[i], calls[i+2]
                args = server.args[0]
                self.assertEqual(args[0], "/fixture/env/bin/python")
                self.assertEqual(agent.args[0][agent.args[0].index("--python")+1], "/fixture/env/bin/python")
                self.assertEqual(args[args.index("--port")+1],str(8190+i))
                self.assertEqual(args[args.index("--cuda-device")+1],str(i))
                self.assertNotIn("MYMOVIE_AGENT_TOKEN",server.kwargs["env"])
                self.assertEqual(agent.kwargs["env"]["MYMOVIE_AGENT_TOKEN"],"s"*32)
                self.assertIn(f"test-gpu{i}",agent.args[0])
                self.assertIn("--supervisor",agent.args[0])
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

    def test_notebook_defaults_match_app_without_active_secrets_lookup(self):
        defaults = json.loads((ROOT / "deploy/node-auth.defaults.json").read_text())
        for host in ["colab", "kaggle"]:
            notebook = json.loads((ROOT / f"deploy/{host}/MyMovie_ComfyUI.ipynb").read_text())
            config = "".join(notebook["cells"][3]["source"])
            tree = ast.parse(config)
            values = {n.targets[0].id: ast.literal_eval(n.value) for n in tree.body
                      if isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Name)
                      and n.targets[0].id in defaults}
            # Avoid including default values in an assertion failure.
            self.assertTrue(values == defaults)
            self.assertNotIn('secret(', ast.unparse(tree))
            start = "".join(notebook["cells"][7]["source"])
            self.assertNotIn('secret(', start)
            self.assertIn('desktop_token=MYMOVIE_DESKTOP_TOKEN', start)

    def test_packaged_relay_and_compiler_extract_and_reject_invalid_relay(self):
        for bad in [False, True]:
            path = self.root / 'full.tar.gz'
            elf = b"\x7fELF\x02\x01" + bytes(12) + b"\x3e\x00" + b'fixture'
            entries = {'mymovie-agent': elf, 'mymovie-relay': b'wrong' if bad else elf,
                       'mymovie_workflow_compiler.py': b'# fixture', 'workflow-compiler-requirements.txt': b''}
            with tarfile.open(path, 'w:gz') as tar:
                for name, data in entries.items():
                    item = tarfile.TarInfo(name); item.size = len(data); tar.addfile(item, io.BytesIO(data))
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if bad:
                with self.assertRaisesRegex(b.SetupError, 'relay binary'): self.install(path, digest)
            else:
                binary = self.install(path, digest)
                self.assertEqual((binary.parent / 'mymovie-relay').stat().st_mode & 0o777, 0o700)
                self.assertTrue((binary.parent / 'mymovie_workflow_compiler.py').is_file())

    def test_local_relay_auth_and_tunnel_lifecycle_no_token_leaks(self):
        from unittest.mock import MagicMock
        binary = self.root / 'mymovie-agent'; binary.touch()
        for name in ['mymovie_runtime.py', 'mymovie-relay', 'mymovie_workflow_compiler.py']:
            (self.root / name).touch()
        repo = self.root / 'ComfyUI'; repo.mkdir(); (repo / 'folder_paths.py').touch()
        runner = b.NotebookRunner(binary, 'http://127.0.0.1:8791', self.root / 'session', first_port=8190)
        fake = types.SimpleNamespace(pid=100, poll=lambda: None, wait=lambda timeout: None)
        sock = MagicMock(); sock.__enter__.return_value.connect_ex.return_value = 1
        response = MagicMock(); response.__enter__.return_value.status = 200
        agent_token = 'a'*32; desktop_token = 'd'*32
        def spawn(args, **kwargs):
            if args[0] == '/fixture/cloudflared':
                kwargs['stderr'].write('https://fixture-node.trycloudflare.com\n'); kwargs['stderr'].flush()
            return fake
        with patch.object(b, 'gpu_indices', return_value=[0]), patch.object(b, 'comfy_info', return_value={'stats': {'devices': [{'type': 'cuda'}]}, 'nodeCount': 3}), patch.object(b.socket, 'socket', return_value=sock), patch.object(b.urllib.request, 'urlopen', return_value=response) as http, patch.object(b.subprocess, 'Popen', side_effect=spawn) as processes, patch.object(b.shutil, 'which', return_value='/fixture/cloudflared'), patch.object(b.os, 'killpg') as kill, patch.dict(b.os.environ, {'MYMOVIE_DESKTOP_TOKEN': desktop_token}):
            status = runner.start(agent_token, attach=True, comfy_root=repo, desktop_token=desktop_token, relay_port=8791, cloudflared='cloudflared')
            self.assertEqual(status['relay'], 'https://fixture-node.trycloudflare.com')
            self.assertEqual(status['processesAlive'], 3)
            relay, agent, tunnel = processes.call_args_list
            self.assertEqual(relay.kwargs['env']['MYMOVIE_DESKTOP_TOKEN'], desktop_token)
            self.assertEqual(relay.kwargs['env']['MYMOVIE_AGENT_TOKEN'], agent_token)
            self.assertNotIn('MYMOVIE_DESKTOP_TOKEN', agent.kwargs['env'])
            self.assertEqual(agent.args[0][agent.args[0].index('--relay')+1], runner.relay)
            self.assertIn('--workflow-compiler', agent.args[0])
            self.assertNotIn('MYMOVIE_DESKTOP_TOKEN', tunnel.kwargs['env'])
            self.assertEqual(http.call_args.args[0].get_header('Authorization'), f'Bearer {desktop_token}')
            self.assertNotIn(agent_token, json.dumps(status)); self.assertNotIn(desktop_token, json.dumps(status))
            self.assertNotIn(desktop_token, (runner.root / 'session.json').read_text())
            runner.stop(); self.assertEqual(kill.call_count, 3)

    def test_tunnel_failure_stops_owned_relay_and_agent(self):
        from unittest.mock import MagicMock
        binary = self.root / 'mymovie-agent'; binary.touch()
        (self.root / 'mymovie_runtime.py').touch()
        repo = self.root / 'ComfyUI'; repo.mkdir(); (repo / 'folder_paths.py').touch()
        runner = b.NotebookRunner(binary, 'http://127.0.0.1:8787', self.root / 'session')
        fake = types.SimpleNamespace(pid=100, poll=lambda: None, wait=lambda timeout: None)
        def relay(*args): runner.children.append(fake)
        with patch.object(runner, '_start_relay', side_effect=relay), patch.object(b, 'gpu_indices', return_value=[0]), patch.object(b, 'comfy_info', return_value={'stats': {'devices': [{'type': 'cuda'}]}, 'nodeCount': 3}), patch.object(b.subprocess, 'Popen', return_value=fake), patch.object(b.shutil, 'which', return_value=None), patch.object(b.os, 'killpg') as kill:
            with self.assertRaisesRegex(b.SetupError, 'Install cloudflared'):
                runner.start('a'*32, attach=True, comfy_root=repo, desktop_token='d'*32, cloudflared='cloudflared')
            self.assertEqual(kill.call_count, 2)
            self.assertEqual(runner.children, []); self.assertIsNone(runner.lock)


if __name__ == "__main__": unittest.main()


class ManagedRestartTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.root=Path(self.tmp.name)
        self.runner=object.__new__(b.NotebookRunner)
        self.runner.root=self.root
        self.runner.supervisor=self.root/'supervisor'; self.runner.supervisor.mkdir()
        self.runner.workers=[{'port':8188+i,'root':self.root/str(i)} for i in range(2)]
        for w in self.runner.workers:
            data=w['root']/'agent';data.mkdir(parents=True);(data/'attestation.json').write_text('{}')
        from unittest.mock import Mock
        self.children=[Mock(pid=100+i) for i in range(3)]
        for p in self.children:p.poll.return_value=None
        self.runner.children=list(self.children)
        self.runner.comfy_processes=[(p,['python','main.py'],{},self.root) for p in self.children[:2]]
        self.request=self.runner.supervisor/'00000000-0000-4000-8000-000000000001.request.json'
        self.request.write_text(json.dumps({'id':self.request.name.split('.')[0],'action':'restart-comfyui'}))
        cache=self.root/'dependency-cache';cache.mkdir();(cache/'restart-required.json').write_text('{}')
    def tearDown(self):self.tmp.cleanup()
    def reply(self):return json.loads(self.request.with_name(self.request.name.replace('request','response')).read_text())
    def test_busy_second_gpu_stops_neither_worker(self):
        with patch.object(b.urllib.request,'urlopen',side_effect=[io.BytesIO(b'{"queue_running":[],"queue_pending":[]}'),io.BytesIO(b'{"queue_pending":[1]}')]),patch.object(b.os,'killpg') as kill:
            self.runner._service_requests()
        kill.assert_not_called();self.assertFalse(self.reply()['ok'])
        self.assertEqual(self.runner.children,self.children)
    def test_restart_only_comfy_preserves_relay_and_invalidates_both_attestations(self):
        from unittest.mock import Mock
        replacements=[Mock(),Mock()]
        def spawn(*args,**kwargs):
            child=replacements.pop(0);self.runner.children.append(child);return child
        with patch.object(b.urllib.request,'urlopen',side_effect=lambda *a,**k:io.BytesIO(b'{"queue_running":[],"queue_pending":[]}')),patch.object(b.os,'killpg') as kill,patch.object(b,'comfy_info',return_value={}),patch.object(self.runner,'_spawn',side_effect=spawn):
            self.runner._service_requests()
        self.assertTrue(self.reply()['ok']);self.assertEqual(kill.call_count,2)
        self.assertIn(self.children[2],self.runner.children)
        self.assertFalse((self.root/'dependency-cache/restart-required.json').exists())
        for w in self.runner.workers:
            self.assertFalse((w['root']/'agent/attestation.json').exists())
            self.assertTrue((w['root']/'agent/runtime-epoch.json').exists())
