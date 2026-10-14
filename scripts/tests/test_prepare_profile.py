"""Profiles require real inventory, reviewed licenses and exact local bytes."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('prepare_profile', ROOT / 'scripts/prepare-workflow-profile.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class ProfileTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.bundle = Path(self.tmp.name)
        for filename in ['mask-canary.template.json', 'rembg-u2netp.model.json']:
            (self.bundle / filename).write_bytes((ROOT / 'examples/provision' / filename).read_bytes())
        self.plugin = self.bundle / 'plugin.tar.gz'
        self.plugin.write_bytes(b'reviewed plugin archive fixture')
        self.descriptor = dict(sourceRef=self.plugin.name, size=self.plugin.stat().st_size,
                               sha256=hashlib.sha256(self.plugin.read_bytes()).hexdigest())
        (self.bundle / 'mymovie-rembg.plugin.json').write_text(json.dumps(self.descriptor))
        self.wheels = self.bundle / 'wheelhouse'
        self.wheels.mkdir()
        self.wheel = self.wheels / 'onnxruntime-1.0-cp313-platform.whl'
        self.wheel.write_bytes(b'reviewed CPU wheel fixture')
        self.inventory = dict(runtimeFingerprint='a' * 64, runtime=dict(architecture='aarch64'))

    def tearDown(self):
        self.tmp.cleanup()

    def test_inventory_fingerprint_required_and_wrapper_supported(self):
        with self.assertRaisesRegex(ValueError, 'Inventory'):
            builder.prepare({}, self.bundle)
        profile = builder.prepare(dict(inventory=self.inventory), self.bundle)
        self.assertEqual(profile['runtime']['fingerprint'], 'a' * 64)
        self.assertEqual(profile['artifacts'], [])

    def test_every_wheel_needs_review_and_emitted_hash_matches_bytes(self):
        with self.assertRaisesRegex(ValueError, 'license'):
            builder.prepare(self.inventory, self.bundle, self.wheels)
        profile = builder.prepare(self.inventory, self.bundle, self.wheels, {self.wheel.name: 'MIT'})
        wheel = profile['artifacts'][-1]
        self.assertEqual(wheel['sha256'], hashlib.sha256(self.wheel.read_bytes()).hexdigest())
        self.assertEqual(wheel['architecture'], 'aarch64')
        self.assertEqual(wheel['sourceRef'], self.wheel.name)
        self.assertIn('MyMovieU2netp', profile['nodeTypes'])

    def test_tampered_plugin_and_symlink_wheel_rejected(self):
        self.plugin.write_bytes(b'tampered')
        with self.assertRaisesRegex(ValueError, 'integrity'):
            builder.prepare(self.inventory, self.bundle, self.wheels)
        self.plugin.write_bytes(b'reviewed plugin archive fixture')
        target = self.bundle / 'outside.whl'
        target.write_bytes(b'outside')
        self.wheel.unlink()
        self.wheel.symlink_to(target)
        with self.assertRaisesRegex(ValueError, 'symlinks'):
            builder.prepare(self.inventory, self.bundle, self.wheels, {self.wheel.name: 'MIT'})
