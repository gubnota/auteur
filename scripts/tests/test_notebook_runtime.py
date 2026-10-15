"""Exercise fresh/reused notebook setup without network, pip, GPU or generation."""
import ast
import hashlib
import io
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

from test_notebook_bootstrap import b, ROOT


class RuntimePreparationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name).resolve()
        quiet = patch.object(b, 'print', Mock(), create=True)
        quiet.start(); self.addCleanup(quiet.stop)
        self.repo = self.work / 'ComfyUI'
        self.binary = self.work / 'client/mymovie-agent'
        self.binary.parent.mkdir()
        (self.binary.parent / 'workflow-compiler-requirements.txt').write_text('playwright==1.58.0\n')
        self.revision = 'a' * 40
        self.tunnel = b'fixture-cloudflared'
        self.digest = hashlib.sha256(self.tunnel).hexdigest()
        self.commands = []

    def command(self, args, **kwargs):
        self.commands.append(args)
        self.assertFalse(any(k.startswith('MYMOVIE_') for k in kwargs['env']))
        if args[:2] == ['git', 'init']:
            root = Path(args[2]); root.mkdir()
            (root / 'main.py').touch()
            (root / 'requirements.txt').write_text('torch\n')
        if 'venv' in args:
            python = Path(args[-1]) / 'bin/python'
            python.parent.mkdir(parents=True, exist_ok=True); python.touch()

    def prepare(self):
        return b.prepare_runtime(self.binary, self.repo, self.revision, self.work,
                                 tunnel_source='https://example.com/cloudflared', tunnel_sha256=self.digest)

    def fixture(self):
        return patch.multiple(b.platform, system=lambda: 'Linux', machine=lambda: 'x86_64')

    def test_fresh_install_then_cached_reuse_still_validates_live_runtime(self):
        with self.fixture(), patch.object(b.subprocess, 'run', side_effect=self.command), patch.object(b.subprocess, 'check_output', side_effect=lambda args, **kw: self.revision if 'rev-parse' in args else ''), patch.object(b.urllib.request, 'urlopen', return_value=io.BytesIO(self.tunnel)) as download, patch.dict(b.os.environ, {'MYMOVIE_AGENT_TOKEN': 'private-test-secret'}):
            runtime = self.prepare()
            self.assertTrue((self.work / 'base-runtime.json').is_file())
            self.assertEqual(runtime['python'], str(self.work / 'env/bin/python'))
            self.assertEqual((self.work / 'cloudflared').stat().st_mode & 0o777, 0o700)
            self.assertEqual((self.work / 'installation.log').stat().st_mode & 0o777, 0o600)
            self.assertTrue(any('pip' in c for c in self.commands))
            self.assertTrue(any('--with-deps' in c for c in self.commands))
            self.commands.clear()
            self.prepare()
            self.assertEqual(len(self.commands), 1)  # health check, no clone/pip/browser download
            self.assertIn('-c', self.commands[0])
            download.assert_called_once()

    def test_existing_conflicting_checkout_is_never_reset(self):
        self.repo.mkdir(); sentinel = self.repo / 'personal.txt'; sentinel.write_text('keep')
        with self.fixture(), patch.object(b.subprocess, 'run') as run, patch.object(b.subprocess, 'check_output', side_effect=['b' * 40, '']):
            with self.assertRaisesRegex(b.SetupError, 'conflicts'): self.prepare()
            run.assert_not_called()
            self.assertEqual(sentinel.read_text(), 'keep')

    def test_broken_cached_runtime_invalidates_marker_for_install_retry(self):
        with self.fixture(), patch.object(b.subprocess, 'run', side_effect=self.command) as run, patch.object(b.subprocess, 'check_output', side_effect=lambda args, **kw: self.revision if 'rev-parse' in args else ''), patch.object(b.urllib.request, 'urlopen', return_value=io.BytesIO(self.tunnel)):
            self.prepare()
            run.side_effect = RuntimeError('browser removed')
            with self.assertRaisesRegex(b.SetupError, 'Verifying CUDA'): self.prepare()
            self.assertFalse((self.work / 'base-runtime.json').exists())
            self.commands.clear(); run.side_effect = self.command
            self.prepare()
            self.assertTrue(any('pip' in c for c in self.commands))

    def test_gpu_preflight_fails_before_any_network_install(self):
        notebook = json.loads((ROOT / 'deploy/colab/MyMovie_ComfyUI.ipynb').read_text())
        install = Mock(); resolve = Mock()
        namespace = {'platform': types.SimpleNamespace(system=lambda: 'Linux', machine=lambda: 'x86_64'),
                     'gpu_indices': lambda: [], 'install_artifact': install, 'release_artifact': resolve,
                     'SetupError': b.SetupError, 'print': Mock()}
        exec(''.join(notebook['cells'][3]['source']), namespace)
        with self.assertRaisesRegex(b.SetupError, 'Enable the requested GPU'):
            exec(''.join(notebook['cells'][5]['source']), namespace)
        install.assert_not_called(); resolve.assert_not_called()

    def test_failed_install_can_retry_without_a_false_marker_or_partial_checkout(self):
        with self.fixture(), patch.object(b.subprocess, 'run', side_effect=RuntimeError('private-test-secret')):
            with self.assertRaises(b.SetupError) as error: self.prepare()
            self.assertNotIn('private-test-secret', str(error.exception))
            self.assertFalse(self.repo.exists())
            self.assertFalse((self.work / 'base-runtime.json').exists())
            self.assertEqual(list(self.work.glob('.comfy-*')), [])
        with self.fixture(), patch.object(b.subprocess, 'run', side_effect=self.command), patch.object(b.subprocess, 'check_output', side_effect=lambda args, **kw: self.revision if 'rev-parse' in args else ''), patch.object(b.urllib.request, 'urlopen', return_value=io.BytesIO(self.tunnel)):
            self.prepare()

    def test_tunnel_checksum_failure_never_installs_or_keeps_partial_executable(self):
        with self.fixture(), patch.object(b.subprocess, 'run', side_effect=self.command), patch.object(b.subprocess, 'check_output', side_effect=[self.revision, '']), patch.object(b.urllib.request, 'urlopen', return_value=io.BytesIO(b'corrupt')):
            with self.assertRaisesRegex(b.SetupError, 'checksum mismatch'): self.prepare()
        self.assertFalse((self.work / 'cloudflared').exists())
        self.assertFalse((self.work / 'cloudflared.part').exists())

    def test_run_all_starts_once_leaves_running_and_reuses_session_without_secret_lookup(self):
        for host, count in [('colab', 1), ('kaggle', 2)]:
            notebook = json.loads((ROOT / f'deploy/{host}/MyMovie_ComfyUI.ipynb').read_text())
            status = {'state': 'stopped', 'relay': 'https://fixture.trycloudflare.com', 'nodes': [{'nodeId': f'test-{i}'} for i in range(count)]}
            runner = Mock(); runner.status.side_effect = lambda: dict(status)
            runner.start.side_effect = lambda *a, **kw: status.update(state='running')
            prepare = Mock(return_value={'python': '/fixture/env/bin/python', 'cloudflared': '/fixture/cloudflared'})
            resolve = Mock(return_value={'source': 'https://example.com/archive', 'sha256': 'a'*64, 'tag': 'v0.1.15'})
            secrets = Mock(side_effect=AssertionError('No Secrets needed for defaults'))
            namespace = {'platform': types.SimpleNamespace(system=lambda: 'Linux', machine=lambda: 'x86_64'),
                         'gpu_indices': lambda: list(range(count)), 'prepare_runtime': prepare, 'release_artifact': resolve,
                         'install_artifact': Mock(return_value=self.binary), 'NotebookRunner': Mock(return_value=runner),
                         'SetupError': b.SetupError, 'json': json, 'print': Mock(), 'secret': secrets}
            for repeat in range(2):
                for cell in notebook['cells'][2:]:
                    if cell['cell_type'] == 'code': exec(''.join(cell['source']), namespace)
                self.assertEqual(status['state'], 'running')
                runner.stop.assert_not_called()
                runner.run_for.assert_not_called()
            runner.start.assert_called_once()
            self.assertEqual(runner.start.call_args.kwargs['python'], '/fixture/env/bin/python')
            prepare.assert_called_once(); resolve.assert_called_once(); secrets.assert_not_called()
            for cell in notebook['cells']:
                if cell['cell_type'] == 'code': ast.parse(''.join(cell['source']), feature_version=(3, 10))


if __name__ == '__main__': unittest.main()
