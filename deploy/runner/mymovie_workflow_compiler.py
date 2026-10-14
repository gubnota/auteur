"""Compile with the selected ComfyUI frontend; never submit or mutate its canvas.

Install requirements and run `python -m playwright install chromium` once.
The executable override is useful for a separately verified browser distribution.
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit

COMPILER_VERSION = "frontend-export-v1"
MAX_SOURCE = 16 * 1024 * 1024


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def validate_source(source):
    if not isinstance(source, dict) or not isinstance(source.get('nodes'), list) or not source['nodes']:
        raise ValueError('Choose a nonempty ComfyUI editor workflow with nodes')
    if len(json.dumps(source).encode()) > MAX_SOURCE:
        raise ValueError('Workflow exceeds 16 MiB')


def compile_workflow(url, source, timeout=90, executable=None):
    from playwright.sync_api import sync_playwright
    validate_source(source)
    target = urlsplit(url)
    if target.scheme not in ('http', 'https') or not target.hostname or target.username or target.password or target.query or target.fragment:
        raise ValueError('Invalid ComfyUI URL')
    origin = (target.scheme, target.netloc)
    blocked = []
    resources = {}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, **({'executable_path': executable} if executable else {}))
        try:
            context = browser.new_context(service_workers='block', accept_downloads=False)
            def route(request):
                req = request.request
                location = urlsplit(req.url)
                if req.method not in ('GET', 'HEAD', 'OPTIONS') or (location.scheme, location.netloc) != origin:
                    blocked.append({'method': req.method, 'path': location.path})
                    request.abort()
                else:
                    request.continue_()
            context.route('**/*', route)
            context.add_init_script("""window.__compilerSocketWrites = [];
                WebSocket.prototype.send = function(data) {
                    window.__compilerSocketWrites.push(String(data).slice(0, 120));
                    throw Error('Compiler blocks outgoing websocket messages');
                };""")
            page = context.new_page()
            page.set_default_timeout(timeout * 1000)
            def capture(response):
                path = urlsplit(response.url).path
                if path.endswith('.js'):
                    try:
                        resources[path] = hashlib.sha256(response.body()).hexdigest()
                    except Exception:
                        pass
            page.on('response', capture)
            page.goto(url.rstrip('/') + '/', wait_until='networkidle')
            page.wait_for_function('window.comfyAPI?.app?.app?.canvas && Object.keys(window.LiteGraph?.registered_node_types ?? {}).length > 0')
            registry = context.request.get(url.rstrip('/') + '/object_info').json()
            # Ignore frontend startup preferences; every write remains blocked.
            blocked.clear()
            page.evaluate("window.__compilerSocketWrites = []")
            result = page.evaluate('''async source => {
                const app = window.comfyAPI.app.app;
                if (typeof app.loadGraphData !== 'function' || typeof app.graphToPrompt !== 'function')
                    throw Error('Unsupported frontend: loadGraphData/graphToPrompt adapter unavailable');
                await app.loadGraphData(source, true, false);
                const missing = [];
                function inspect(graph) {
                    for (const node of graph._nodes ?? []) {
                        if (node.type && !window.LiteGraph.registered_node_types[node.type]) missing.push(node.type);
                        if (node.subgraph) inspect(node.subgraph);
                    }
                }
                inspect(app.graph);
                if (missing.length) throw Error('Missing frontend node types: ' + [...new Set(missing)].join(', '));
                const exported = await app.graphToPrompt();
                if (!exported.output || !Object.keys(exported.output).length) throw Error('Exporter produced no executable nodes');
                return {graph: exported.output, adapter:'comfyAPI.app.graphToPrompt'};
            }''', source)
            if page.evaluate("window.__compilerSocketWrites.length"):
                raise ValueError("Workflow serialization requires outgoing websocket messages")
            if blocked:
                raise ValueError('Workflow serialization requires blocked side effects: ' + json.dumps(blocked))
            result.update(compilerVersion=COMPILER_VERSION, sourceHash=digest(source),
                          apiHash=digest(result['graph']), registryHash=digest(registry),
                          frontendHash=digest(resources), registry=registry)
            return result
        finally:
            browser.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', required=True)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--timeout', type=int, default=90)
    parser.add_argument('--browser-executable')
    args = parser.parse_args()
    try:
        if args.source.stat().st_size > MAX_SOURCE:
            raise ValueError('Workflow exceeds 16 MiB')
        result = compile_workflow(args.url, json.loads(args.source.read_text()), args.timeout, args.browser_executable)
        args.output.write_text(json.dumps(result, indent=2) + '\n')
    except Exception as error:
        args.output.write_text(json.dumps({'error': str(error), 'compilerVersion': COMPILER_VERSION}) + '\n')
        raise SystemExit(1)


if __name__ == '__main__':
    main()
