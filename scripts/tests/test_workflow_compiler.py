import importlib.util
from pathlib import Path
import unittest
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('workflow_compiler', ROOT/'deploy/runner/mymovie_workflow_compiler.py')
compiler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compiler)

class CompilerTests(unittest.TestCase):
    def test_empty_or_api_source_is_rejected(self):
        for source in [None, {}, {'nodes':[]}, {'1':{'class_type':'LoadImage','inputs':{}}}]:
            with self.assertRaisesRegex(ValueError,'editor workflow'):
                compiler.validate_source(source)
    def test_source_bound_and_canonical_identity(self):
        with self.assertRaisesRegex(ValueError,'16 MiB'):
            compiler.validate_source({'nodes':[{'title':'x'*(16*1024*1024)}]})
        self.assertEqual(compiler.digest({'b':2,'a':1}), compiler.digest({'a':1,'b':2}))
        self.assertNotEqual(compiler.digest({'nodes':[1]}), compiler.digest({'nodes':[2]}))
