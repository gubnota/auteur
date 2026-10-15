import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('local_supervisor', Path(__file__).resolve().parents[2] / 'deploy/runner/mymovie_local.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class LocalSupervisorTests(unittest.TestCase):
    def test_restart_marker_cleared_only_after_owned_process_is_ready(self):
        with tempfile.TemporaryDirectory() as folder:
            data = Path(folder)
            marker = data / 'agent/cache/restart-required.json'
            marker.parent.mkdir(parents=True)
            marker.write_text('{}')
            receipt = marker.with_name('recipe-receipt.json')
            receipt.write_text('{}')
            with patch.object(helper, 'wait_ready', side_effect=RuntimeError('not ready')):
                with self.assertRaisesRegex(RuntimeError, 'not ready'):
                    helper.wait_managed_ready('http://127.0.0.1:8193', object(), data)
            self.assertTrue(marker.exists())
            with patch.object(helper, 'wait_ready') as ready:
                helper.wait_managed_ready('http://127.0.0.1:8193', object(), data)
                ready.assert_called_once()
                self.assertFalse(marker.exists())
                self.assertTrue(receipt.exists())
                helper.wait_managed_ready('http://127.0.0.1:8193', object(), data)
