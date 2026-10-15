"""Exercise real helper processes: pipe-loss cleanup and interactive PTY transport."""
import json
import os
from pathlib import Path
import selectors
import subprocess
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[2]

class AgentExecutionTests(unittest.TestCase):
    def helper(self, name, *args):
        p = subprocess.Popen([sys.executable, '-u', str(ROOT / 'deploy/runner' / name), *args],
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.addCleanup(self.cleanup, p)
        return p

    @staticmethod
    def cleanup(p):
        if p.stdin and not p.stdin.closed:
            p.stdin.close()
        try:
            p.wait(timeout=3)
        except subprocess.TimeoutExpired:
            p.kill()
            p.wait()
        p.stdout.close()
        p.stderr.close()

    def read_until(self, p, expected):
        data = b''
        with selectors.DefaultSelector() as selector:
            selector.register(p.stdout, selectors.EVENT_READ)
            deadline = time.monotonic() + 8
            while expected not in data and time.monotonic() < deadline:
                for key, _ in selector.select(.2):
                    chunk = os.read(key.fd, 4096)
                    if not chunk:
                        self.fail(f'Helper ended before expected output: {data!r}')
                    data += chunk
        self.assertIn(expected, data)
        return data

    def test_script_preserves_failure_and_merged_output(self):
        p = self.helper('mymovie_script.py', 'echo step-start; echo step-error >&2; exit 7')
        self.read_until(p, b'step-error')
        self.assertEqual(p.wait(timeout=5), 7)

    def test_lost_agent_pipe_terminates_script_group(self):
        with tempfile.TemporaryDirectory() as folder:
            marker = Path(folder) / 'escaped'
            # A descendant must not survive cancellation and write this file later.
            p = self.helper('mymovie_script.py', f'(sleep 1; touch "{marker}") & echo ready; wait')
            self.read_until(p, b'ready')
            p.stdin.close()
            self.assertEqual(p.wait(timeout=5), 130)
            time.sleep(1.2)
            self.assertFalse(marker.exists())

    def test_console_accepts_batched_input_resize_and_close(self):
        p = self.helper('mymovie_console.py')
        commands = [dict(type='resize', cols=80, rows=24), dict(type='input', data="printf 'PTY-%s\\n' works\n")]
        p.stdin.write(b''.join((json.dumps(c) + '\n').encode() for c in commands))
        p.stdin.flush()
        self.read_until(p, b'PTY-works')
        p.stdin.write(b'{"type":"close"}\n')
        p.stdin.flush()
        self.assertEqual(p.wait(timeout=5), 0)
