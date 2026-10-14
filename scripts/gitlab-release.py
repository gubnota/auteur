"""Publish immutable, checksummed build files and release links with a CI job token."""
import hashlib
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen


def prepare(root):
    destination = root / 'release-assets'
    destination.mkdir(exist_ok=True)
    for folder, pattern in [('target', '*.dmg'), ('target', '*.deb'), ('target', '*.AppImage'), ('target', '*.msi'), ('target', '*-setup.exe')]:
        for source in sorted((root / folder).rglob(pattern)):
            target = destination / source.name.replace(' ', '.')
            if target.exists() and target.read_bytes() != source.read_bytes():
                raise RuntimeError('Duplicate release filename')
            target.write_bytes(source.read_bytes())
    files = sorted(p for p in destination.iterdir() if p.is_file() and p.name != 'SHA256SUMS.txt')
    for suffix in ['.dmg', '.deb', '.AppImage', '.msi', '-setup.exe', '.tar.gz', '.ipynb']:
        if not any(p.name.endswith(suffix) for p in files):
            raise RuntimeError(f'Missing release artifact: {suffix}')
    checksums = destination / 'SHA256SUMS.txt'
    checksums.write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in files))
    return files + [checksums]


def publish(files, api, project, tag, token):
    base = f'{api}/projects/{quote(project, safe="")}'
    def request(method, url, body=None, content_type='application/json'):
        req = Request(url, data=body, method=method, headers={'JOB-TOKEN': token, 'Content-Type': content_type})
        try:
            with urlopen(req, timeout=180) as response:
                return response.status, response.read()
        except HTTPError as e:
            # Do not print API response bodies or token-bearing headers.
            status = e.code
            e.close()
            if status == 404: return 404, b''
            raise RuntimeError(f'GitLab {method} failed: HTTP {status}') from None
    links = []
    for p in files:
        url = f'{base}/packages/generic/mymovie-studio/{quote(tag, safe="")}/{quote(p.name, safe="")}'
        status, existing = request('GET', url)
        if status == 200:
            if existing != p.read_bytes(): raise RuntimeError(f'Immutable package differs: {p.name}')
        elif status == 404:
            status, _ = request('PUT', url, p.read_bytes(), 'application/octet-stream')
            if status != 201: raise RuntimeError(f'Unexpected upload status: {status}')
        else: raise RuntimeError(f'Unexpected package status: {status}')
        links.append({'name': p.name, 'url': url, 'link_type': 'package'})
    release_url = f'{base}/releases/{quote(tag, safe="")}'
    status, existing = request('GET', release_url)
    if status == 200:
        current = {(x['name'], x['url']) for x in json.loads(existing)['assets']['links']}
        if current != {(x['name'], x['url']) for x in links}: raise RuntimeError('Existing release has different assets')
        return
    payload = {'name': f'MyMovie Studio {tag}', 'tag_name': tag,
               'description': 'macOS Apple Silicon/Intel, Windows x64 and Linux x86_64/ARM64 desktop builds, Linux ComfyUI agents and Colab/Kaggle notebooks. Verify SHA256SUMS.txt. macOS builds are ad-hoc signed and not notarized; Windows installers are unsigned. Live notebook acceptance remains pending.',
               'assets': {'links': links}}
    status, _ = request('POST', f'{base}/releases', json.dumps(payload).encode())
    if status != 201: raise RuntimeError(f'Unexpected release status: {status}')


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    publish(prepare(root), os.environ['CI_API_V4_URL'], os.environ['CI_PROJECT_ID'], os.environ['CI_COMMIT_TAG'], os.environ['CI_JOB_TOKEN'])
