"""Weight-free real ComfyUI HTTP/WebSocket/history/result acceptance."""
import json, time, urllib.request, hashlib, pathlib, sys
url = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8188'
def get(path):
    return json.load(urllib.request.urlopen(url + path, timeout=15))
graph = json.loads(pathlib.Path('fixtures/cpu-workflow.json').read_text())
registry = get('/object_info')
assert all(n['class_type'] in registry for n in graph.values())
req = urllib.request.Request(url + '/prompt', data=json.dumps({'prompt': graph, 'client_id': 'mymovie-cpu-acceptance', 'extra_data': {'mymovie_attempt': 'cpu-canary'}}).encode(), headers={'Content-Type': 'application/json'})
response = json.load(urllib.request.urlopen(req, timeout=30))
prompt_id = response['prompt_id']
for _ in range(60):
    history = get('/history/' + prompt_id)
    if prompt_id in history:
        entry = history[prompt_id]
        assert entry['status']['status_str'] == 'success', entry['status']
        image = entry['outputs']['2']['images'][0]
        from urllib.parse import urlencode
        data = urllib.request.urlopen(url + '/view?' + urlencode(image), timeout=30).read()
        assert data.startswith(b'\x89PNG\r\n\x1a\n')
        output = pathlib.Path('artifacts/acceptance')
        output.mkdir(parents=True, exist_ok=True)
        (output / 'cpu-canary.png').write_bytes(data)
        (output / 'cpu-receipt.json').write_text(json.dumps({'promptId': prompt_id, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'status': 'success'}, indent=2))
        print('CPU canary passed:', len(data), 'bytes; verified PNG and durable history')
        break
    time.sleep(1)
else:
    raise RuntimeError('ComfyUI canary timed out')
