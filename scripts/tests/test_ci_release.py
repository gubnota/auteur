import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[2]


def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / f'{name}.py')
    result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result)
    return result


release = module('gitlab-release')
version = module('check-release-version')


class Response:
    def __init__(self, status, data): self.status, self.data = status, data
    def __enter__(self): return self
    def __exit__(self, *_): pass
    def read(self): return self.data


class ReleaseTests(unittest.TestCase):
    def test_github_upload_excludes_empty_bundle_directories(self):
        workflow = (ROOT / '.github/workflows/release.yml').read_text()
        step = workflow.split('      - name: Create or update draft\n', 1)[1]
        block = step.split('        run: |\n', 1)[1].split('      - name:', 1)[0]
        script = '\n'.join(line[10:] for line in block.splitlines())
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); assets = root / 'artifacts'; assets.mkdir()
            (assets / 'appimage').mkdir()
            (assets / 'dmg').mkdir()
            names = ['MyMovie.Studio_x64.msi', 'MyMovie.Studio_arm64.dmg', 'SHA256SUMS.txt']
            for name in names: (assets / name).write_bytes(b'asset')
            gh = root / 'gh'
            gh.write_text(f'#!{sys.executable}\nimport json, pathlib, sys\n'
                          'if sys.argv[1:3] == ["release", "view"]: sys.exit(1)\n'
                          'pathlib.Path("upload-args.json").write_text(json.dumps(sys.argv[1:]))\n')
            gh.chmod(0o755)
            env = dict(os.environ, PATH=str(root) + os.pathsep + os.environ['PATH'], RELEASE_TAG='v0.1.5')
            subprocess.run(['bash', '-e', '-c', script], cwd=root, env=env, check=True)
            args = json.loads((root / 'upload-args.json').read_text())
            self.assertEqual(args[:3], ['release', 'create', 'v0.1.5'])
            uploaded = [arg for arg in args if arg.startswith('artifacts/')]
            self.assertEqual(set(uploaded), {f'artifacts/{name}' for name in names})
            self.assertTrue(all((root / arg).is_file() for arg in uploaded))

    def test_tags_must_match_versions_and_cannot_contain_commands(self):
        current = version.check(ROOT, '')
        self.assertEqual(version.check(ROOT, f'v{current}'), current)
        for tag in ['v99.0.0', 'v1.0', 'v1.0.0;cmd', '../v1.0.0']:
            with self.assertRaises(AssertionError): version.check(ROOT, tag)

    def test_tag_mismatch_explains_versions_and_commit_order_in_ci(self):
        current = version.check(ROOT, '')
        env = dict(os.environ, RELEASE_TAG='v99.0.0', CI_COMMIT_TAG='')
        result = subprocess.run(
            [sys.executable, str(ROOT / 'scripts/check-release-version.py')],
            env=env, capture_output=True, text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(f'Release tag v99.0.0 does not match source version {current}', result.stderr)
        self.assertIn(f'expected v{current}', result.stderr)
        self.assertIn('commit the changes', result.stderr)
        self.assertIn('git add only stages files', result.stderr)
        self.assertNotIn('Traceback', result.stderr)

    def test_checksums_cover_all_artifacts_and_missing_binaries_block_publish(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); assets = root / 'release-assets'; assets.mkdir()
            with self.assertRaises(RuntimeError): release.prepare(root)
            for name in ['arm.dmg', 'intel.dmg', 'desktop.deb', 'desktop.AppImage', 'desktop.msi', 'desktop-setup.exe', 'client.tar.gz', 'colab.ipynb']:
                (assets / name).write_bytes(name.encode())
            source = root / 'target' / 'release' / 'bundle'
            source.mkdir(parents=True)
            (source / 'MyMovie Studio.msi').write_bytes(b'installer')
            files = release.prepare(root)
            self.assertEqual(len(files), 10)
            self.assertIn('client.tar.gz', (assets / 'SHA256SUMS.txt').read_text())
            self.assertIn('MyMovie.Studio.msi', (assets / 'SHA256SUMS.txt').read_text())
            self.assertEqual(len(release.prepare(root)), 10)
            (source / 'MyMovie Studio.msi').unlink()
            (assets / 'MyMovie.Studio.msi').unlink()
            (assets / 'desktop.msi').unlink()
            with self.assertRaisesRegex(RuntimeError, 'Missing release artifact: .msi'):
                release.prepare(root)

    def test_uploads_use_job_token_and_release_links_use_versioned_packages(self):
        requests = []
        def fake(req, **_):
            requests.append(req)
            self.assertEqual(req.get_header('Job-token'), 'test-token')
            if req.method == 'GET': raise HTTPError(req.full_url, 404, 'missing', {}, None)
            return Response(201, b'{}')
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'client.tar.gz'; p.write_bytes(b'client')
            with patch.object(release, 'urlopen', fake):
                release.publish([p], 'https://gitlab.test/api/v4', '42', 'v0.1.2', 'test-token')
            upload = next(r for r in requests if r.method == 'PUT')
            self.assertIn('/packages/generic/mymovie-studio/v0.1.2/client.tar.gz', upload.full_url)
            self.assertEqual(upload.data, b'client')
            payload = json.loads(requests[-1].data)
            self.assertEqual(payload['tag_name'], 'v0.1.2')
            self.assertEqual(payload['assets']['links'][0]['url'], upload.full_url)

    def test_republication_cannot_overwrite_existing_versioned_binary(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'client.tar.gz'; p.write_bytes(b'new')
            with patch.object(release, 'urlopen', lambda *a, **k: Response(200, b'old')):
                with self.assertRaisesRegex(RuntimeError, 'Immutable package differs'):
                    release.publish([p], 'https://gitlab.test/api/v4', '42', 'v0.1.2', 'test-token')


if __name__ == '__main__': unittest.main()
