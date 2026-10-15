#!/usr/bin/env python3
"""Local/NAT agent supervisor. No weights, plugins or arbitrary setup at bootstrap."""
import argparse
import json
import os
from pathlib import Path
import secrets
import signal
import subprocess
import time
import urllib.request


def atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.chmod(0o600)
    temporary.replace(path)


def wait_ready(url, process, timeout=180):
    until = time.monotonic() + timeout
    while time.monotonic() < until:
        if process and process.poll() is not None:
            raise RuntimeError('ComfyUI exited; inspect comfyui.log')
        try:
            with urllib.request.urlopen(url + '/system_stats', timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(.5)
    raise RuntimeError('ComfyUI did not become ready; inspect comfyui.log')


def wait_node(url, node_id, token, children, timeout=90):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if any(child.poll() is not None for child in children):
            raise RuntimeError('A managed process exited; inspect agent.log and relay.log')
        request = urllib.request.Request(url.rstrip('/') + '/v1/nodes/' + node_id,
                                         headers={'Authorization': 'Bearer ' + token})
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                if json.load(response).get('connected') is True:
                    return
        except Exception:
            pass
        time.sleep(.5)
    raise RuntimeError('Agent registration timed out; inspect agent.log and relay.log')


def wait_managed_ready(url, process, data):
    wait_ready(url, process)
    # Only acknowledge dependency changes after the replacement process is healthy.
    (data / 'agent' / 'cache' / 'restart-required.json').unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--comfy-root', type=Path, required=True)
    parser.add_argument('--python', type=Path, required=True)
    parser.add_argument('--client', type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument('--data', type=Path, required=True)
    parser.add_argument('--port', type=int, default=8191)
    parser.add_argument('--relay-port', type=int, default=8789)
    parser.add_argument('--relay', help='Reachable relay URL; omission starts a private loopback relay')
    parser.add_argument('--node-id', default='local-mps-0')
    parser.add_argument('--cpu', action='store_true')
    parser.add_argument('--attach', action='store_true', help='Attach read-only; existing ComfyUI cannot be restarted or initialized')
    parser.add_argument('--allow-console', action='store_true', help='Private PTY and custom initialization scripts')
    args = parser.parse_args()
    root, client, data = (p.expanduser().resolve() for p in (args.comfy_root, args.client, args.data))
    # Keep the venv entry point: resolving its symlink loses pyvenv.cfg discovery.
    python = Path(os.path.abspath(args.python.expanduser()))
    required = [python, root/'main.py', client/'mymovie-agent', client/'mymovie_runtime.py', client/'mymovie_workflow_compiler.py']
    if not args.relay:
        required.append(client/'mymovie-relay')
    for path in required:
        if not path.is_file():
            parser.error('Missing prerequisite: ' + str(path))
    if args.port == args.relay_port:
        parser.error('ComfyUI and relay require different ports')
    data.mkdir(parents=True, exist_ok=True)
    data.chmod(0o700)
    token_file = data/'tokens.json'
    tokens = json.loads(token_file.read_text()) if token_file.exists() else {
        'MYMOVIE_AGENT_TOKEN': secrets.token_urlsafe(36),
        'MYMOVIE_DESKTOP_TOKEN': secrets.token_urlsafe(36)}
    for key in tokens:
        tokens[key] = os.environ.get(key, tokens[key])
    atomic(token_file, tokens)
    env = {**os.environ, **tokens}
    processes, logs = [], []
    supervisor = data/'supervisor'
    supervisor.mkdir(exist_ok=True)
    comfy_url = f'http://127.0.0.1:{args.port}'
    relay_url = args.relay or f'http://127.0.0.1:{args.relay_port}'
    def start(name, command, environment=env, cwd=None):
        log = (data/(name+'.log')).open('ab'); logs.append(log)
        child = subprocess.Popen([str(v) for v in command], cwd=cwd, env=environment, stdout=log, stderr=subprocess.STDOUT)
        processes.append(child)
        return child
    def start_comfy():
        return start('comfyui', [python, '-u', root/'main.py', '--listen', '127.0.0.1', '--port', args.port, *(['--cpu'] if args.cpu else [])], cwd=root)
    comfy = None
    try:
        if not args.attach:
            comfy = start_comfy()
            wait_managed_ready(comfy_url, comfy, data)
        else:
            wait_ready(comfy_url, comfy)
        if not args.relay:
            relay_env = {**env, 'MYMOVIE_RELAY_BIND': f'127.0.0.1:{args.relay_port}', 'MYMOVIE_NODE_IDS': args.node_id, 'MYMOVIE_RELAY_DATA':str(data/'relay')}
            start('relay', [client/'mymovie-relay'], relay_env, data)
            time.sleep(.5)
        command = [client/'mymovie-agent', 'serve', '--comfy-url', comfy_url, '--relay', relay_url, '--node-id', args.node_id, '--data', data/'agent', '--comfy-root', root, '--python', python, '--runtime-helper', client/'mymovie_runtime.py', '--workflow-compiler', client/'mymovie_workflow_compiler.py']
        if not args.attach:
            command += ['--managed-runtime', '--supervisor', supervisor]
        if args.allow_console:
            command += ['--allow-console']
        start('agent', command, cwd=data)
        wait_node(relay_url, args.node_id, tokens['MYMOVIE_DESKTOP_TOKEN'], processes)
        print(f'Ready: relay {relay_url}, node {args.node_id}', flush=True)
        print(f'Copy the desktop token from {token_file} into Studio Connections. Token values are not printed. Logs: {data}', flush=True)
        print('Keep this supervisor running. Ctrl+C stops its owned processes.', flush=True)
        while True:
            for child in processes:
                if child.poll() is not None:
                    raise RuntimeError('A managed process exited; inspect logs in ' + str(data))
            for request in supervisor.glob('*.request.json'):
                response = request.with_name(request.name.replace('.request.json','.response.json'))
                try:
                    body=json.loads(request.read_text())
                    if body.get('action') != 'restart-comfyui' or args.attach:
                        raise RuntimeError('This supervisor does not own this runtime')
                    comfy.terminate()
                    try: comfy.wait(timeout=15)
                    except subprocess.TimeoutExpired: comfy.kill(); comfy.wait()
                    processes.remove(comfy)
                    comfy=start_comfy(); wait_managed_ready(comfy_url, comfy, data)
                    atomic(response, {'id':body['id'],'ok':True})
                except Exception as exc:
                    atomic(response, {'ok':False,'error':str(exc)})
                request.unlink(missing_ok=True)
            time.sleep(.25)
    finally:
        for child in reversed(processes):
            if child.poll() is None:
                child.terminate()
                try: child.wait(timeout=10)
                except subprocess.TimeoutExpired: child.kill(); child.wait()
        for log in logs:
            log.close()


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        pass
