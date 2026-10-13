import importlib.util
import json
from pathlib import Path
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
    def test_tags_must_match_versions_and_cannot_contain_commands(self):
        current = version.check(ROOT, '')
        self.assertEqual(version.check(ROOT, f'v{current}'), current)
        for tag in ['v99.0.0', 'v1.0', 'v1.0.0;cmd', '../v1.0.0']:
            with self.assertRaises(AssertionError): version.check(ROOT, tag)

    def test_checksums_cover_all_artifacts_and_missing_binaries_block_publish(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); assets = root / 'release-assets'; assets.mkdir()
            with self.assertRaises(RuntimeError): release.prepare(root)
            for name in ['arm.dmg', 'intel.dmg', 'desktop.deb', 'desktop.AppImage', 'client.tar.gz', 'colab.ipynb']:
                (assets / name).write_bytes(name.encode())
            files = release.prepare(root)
            self.assertEqual(len(files), 7)
            self.assertIn('client.tar.gz', (assets / 'SHA256SUMS.txt').read_text())
            self.assertEqual(len(release.prepare(root)), 7)

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
