"""Verify managed installs, extra-directory placement and plugin integrity."""
import hashlib
import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('runtime_helper',ROOT/'deploy/runner/mymovie_runtime.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)

class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.dirs={'loras':[str(self.root/'shared/loras')],'custom_nodes':[str(self.root/'custom_nodes')],'wheels':[str(self.root/'wheels')]}
        self.paths=patch.object(h,'paths',return_value=self.dirs);self.paths.start()
        self.runtime=patch.object(h,'runtime',return_value=({},'f'*64));self.runtime.start()
    def tearDown(self):self.paths.stop();self.runtime.stop();self.tmp.cleanup()
    def artifact(self,source,kind='model',target='test.safetensors'):
        return {'kind':kind,'category':'loras','target':target,'sha256':h.sha(source),'size':source.stat().st_size,'architecture':'any','revision':'a'*40,'stripPrefix':''}
    def test_external_is_read_only_and_shared_model_path_is_used(self):
        source=self.root/'download';source.write_bytes(b'weights');a=self.artifact(source)
        with self.assertRaisesRegex(ValueError,'read-only'):h.install(self.root,a,source,False)
        h.install(self.root,a,source,True)
        self.assertEqual((self.root/'shared/loras/test.safetensors').read_bytes(),b'weights')
        self.assertEqual(h.inventory(self.root,[a])['files'][0]['state'],'verified')
        (self.root/'shared/loras/test.safetensors').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError,'conflicts'):h.install(self.root,a,source,True)
    def archive(self,name='pinned/plugin.py'):
        source=self.root/'plugin.tar.gz'
        with tarfile.open(source,'w:gz') as tar:
            item=tarfile.TarInfo(name);data=b'NODE_CLASS_MAPPINGS = {}';item.size=len(data);tar.addfile(item,io.BytesIO(data))
        return source
    def test_plugin_strip_prefix_and_every_source_file_is_checked(self):
        source=self.archive();a=self.artifact(source,'plugin','example');a['stripPrefix']='pinned'
        h.install(self.root,a,source,True)
        self.assertEqual(h.inventory(self.root,[a])['files'][0]['state'],'verified')
        (self.root/'custom_nodes/example/injected.py').write_text('unsafe')
        self.assertEqual(h.inventory(self.root,[a])['files'][0]['state'],'conflict')
    def test_traversal_and_symlink_destinations_rejected(self):
        source=self.archive('../escape.py');a=self.artifact(source,'plugin','example')
        with self.assertRaises(ValueError):h.install(self.root,a,source,True)
        target=self.root/'link';target.symlink_to(self.root)
        with self.assertRaises(ValueError):h.confined(self.root,'link/file')
        with self.assertRaises(ValueError):h.confined(self.root,'../escape')
    def test_wrong_hash_or_architecture_never_installs(self):
        source=self.root/'download';source.write_bytes(b'weights');a=self.artifact(source);a['sha256']='0'*64
        with self.assertRaisesRegex(ValueError,'integrity'):h.install(self.root,a,source,True)
        a=self.artifact(source);a['architecture']='unavailable'
        with self.assertRaisesRegex(ValueError,'architecture'):h.install(self.root,a,source,True)

if __name__=='__main__':unittest.main()
