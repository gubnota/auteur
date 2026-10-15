"""Verify managed installs, extra-directory placement and plugin integrity."""
import hashlib
import importlib.util
import io
import json
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
    def stale_hash(self,path,digest):
        # Deterministically model a same-size rewrite on a coarse-clock filesystem.
        stat=path.stat()
        h.HASH_CACHE[str(path.resolve())]=[[stat.st_size,stat.st_mtime_ns,stat.st_ctime_ns,stat.st_ino],digest]
    def test_external_is_read_only_and_shared_model_path_is_used(self):
        source=self.root/'download';source.write_bytes(b'weights');a=self.artifact(source)
        with self.assertRaisesRegex(ValueError,'read-only'):h.install(self.root,a,source,False)
        h.install(self.root,a,source,True)
        self.assertEqual((self.root/'shared/loras/test.safetensors').read_bytes(),b'weights')
        self.assertEqual(h.inventory(self.root,[a])['files'][0]['state'],'verified')
        (self.root/'shared/loras/test.safetensors').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError,'conflicts'):h.install(self.root,a,source,True)
    def test_install_rechecks_destination_despite_matching_cached_metadata(self):
        source=self.root/'download';source.write_bytes(b'weights');a=self.artifact(source)
        h.install(self.root,a,source,True)
        dest=self.root/'shared/loras/test.safetensors';dest.write_bytes(b'changed')
        self.stale_hash(dest,a['sha256'])
        self.assertEqual(h.sha(dest),a['sha256'])
        with self.assertRaisesRegex(ValueError,'conflicts'):h.install(self.root,a,source,True)
        self.assertEqual(dest.read_bytes(),b'changed')
    def test_install_rechecks_source_despite_matching_cached_metadata(self):
        source=self.root/'download';source.write_bytes(b'weights');a=self.artifact(source)
        source.write_bytes(b'changed');self.stale_hash(source,a['sha256'])
        self.assertEqual(h.sha(source),a['sha256'])
        with self.assertRaisesRegex(ValueError,'integrity'):h.install(self.root,a,source,True)
        self.assertFalse((self.root/'shared/loras/test.safetensors').exists())
    def test_verified_dependency_is_reused_after_fresh_check(self):
        source=self.root/'download';source.write_bytes(b'weights');a=self.artifact(source)
        h.install(self.root,a,source,True)
        self.assertEqual(h.install(self.root,a,source,True)['state'],'verified')
        self.assertEqual(h.install(self.root,a,source,False)['state'],'verified')
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
    def test_install_rechecks_plugin_files_despite_matching_cached_metadata(self):
        source=self.archive();a=self.artifact(source,'plugin','example');a['stripPrefix']='pinned'
        h.install(self.root,a,source,True)
        dest=self.root/'custom_nodes/example/plugin.py';digest=h.sha(dest)
        dest.write_bytes(b'X'*dest.stat().st_size);self.stale_hash(dest,digest)
        with self.assertRaisesRegex(ValueError,'conflicts'):h.install(self.root,a,source,True)
        self.assertEqual(dest.read_bytes(),b'X'*len(b'NODE_CLASS_MAPPINGS = {}'))
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

class WheelResolutionTests(unittest.TestCase):
    def test_rejects_unpinned_and_install_options(self):
        for pins in [['numpy'], ['numpy>=2'], ['--index-url=https://other'], ['x @ https://other/x.whl']]:
            with self.assertRaisesRegex(ValueError, 'exact'): h.resolve_wheels(pins)
        self.assertEqual(h.resolve_wheels([]), [])

    def resolve(self, urls):
        items = [dict(download_info=dict(url=url,archive_info=dict(hashes=dict(sha256='a'*64))),metadata=dict(name='example',version='1.0')) for url in urls]
        def run(command, **kwargs):
            Path(command[command.index('--report')+1]).write_text(json.dumps({'install':items}))
        def metadata(request, **kwargs):
            return io.BytesIO(json.dumps({'info':{'license_expression':'MIT'}, 'urls':[{'filename':url.rsplit('/',1)[-1], 'url':url,'digests':{'sha256':'a'*64},'size':100} for url in urls]}).encode())
        with patch.object(h.subprocess,'run',side_effect=run), patch('urllib.request.urlopen',side_effect=metadata):
            return h.resolve_wheels(['example==1.0'])

    def test_reports_complete_reviewable_binary_closure(self):
        rows=self.resolve(['https://files.pythonhosted.org/example-1.0-py3-none-any.whl','https://files.pythonhosted.org/dependency-2.0-py3-none-any.whl'])
        self.assertEqual(len(rows),2)
        self.assertTrue(all(r['kind']=='wheel' and r['sha256']=='a'*64 and r['size']==100 and r['license']=='MIT' for r in rows))

    def test_untrusted_index_and_source_builds_blocked(self):
        for url in ['https://other.example/example.whl','https://files.pythonhosted.org/example.tar.gz']:
            with self.assertRaisesRegex(ValueError,'binary wheels'): self.resolve([url])

if __name__=='__main__':unittest.main()
