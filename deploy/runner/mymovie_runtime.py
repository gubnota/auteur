"""Trusted runtime inventory and confined installation. JSON stdin/stdout; no shell."""
import argparse
import contextlib
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tarfile


HASH_CACHE = {}

def sha(path, *, refresh=False):
    path=Path(path)
    stat=path.stat()
    key=str(path.resolve())
    signature=[stat.st_size,stat.st_mtime_ns,stat.st_ctime_ns,stat.st_ino]
    cached=HASH_CACHE.get(key)
    if not refresh and cached and cached[0]==signature: return cached[1]
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    value=h.hexdigest()
    HASH_CACHE[key]=[signature,value]
    return value


def confined(root, relative):
    root = Path(root).resolve()
    parts = Path(relative).parts
    if not parts or Path(relative).is_absolute() or any(p in ('.', '..') for p in parts) or '\\' in relative:
        raise ValueError('Unsafe dependency target')
    dest = root
    for part in parts:
        dest = dest / part
        if dest.is_symlink():
            raise ValueError('Symlink dependency target')
    if not dest.resolve().is_relative_to(root):
        raise ValueError('Dependency escapes effective model directory')
    return dest


MODEL_PATHS=None

def paths(root):
    # Ask this worker's own ComfyUI, including its configured extra_model_paths.yaml.
    sys.path.insert(0, str(root))
    with contextlib.redirect_stdout(sys.stderr):
        import folder_paths
    config = MODEL_PATHS or root / 'extra_model_paths.yaml'
    if config.exists():
        from utils.extra_config import load_extra_path_config
        with contextlib.redirect_stdout(sys.stderr):
            load_extra_path_config(str(config))
    result = {k: [str(Path(p).resolve()) for p in v[0]] for k, v in folder_paths.folder_names_and_paths.items()}
    result.setdefault('custom_nodes', [str((root / 'custom_nodes').resolve())])
    result['wheels'] = [str((root / '.mymovie-wheels').resolve())]
    return result


def runtime(root):
    commit = subprocess.run(['git', '-C', str(root), 'rev-parse', 'HEAD'], capture_output=True, text=True, check=True).stdout.strip()
    changes = subprocess.run(['git','-C',str(root),'diff','HEAD','--'],capture_output=True,check=True).stdout
    dependencies = sorted(f'{d.metadata["Name"]}=={d.version}' for d in importlib.metadata.distributions())
    value = {'comfyCommit': commit, 'python': platform.python_version(), 'platform': platform.system(),
             'architecture': platform.machine(), 'trackedChangesHash': hashlib.sha256(changes).hexdigest(), 'dependencyHash': hashlib.sha256('\n'.join(dependencies).encode()).hexdigest()}
    fingerprint = hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return value, fingerprint


def inventory(root, artifacts, *, refresh=False):
    dirs = paths(root)
    identity, fingerprint = runtime(root)
    rows = []
    for a in artifacts:
        category = 'custom_nodes' if a['kind'] == 'plugin' else 'wheels' if a['kind'] == 'wheel' else a['category']
        locations = dirs.get(category, [])
        if not locations:
            rows.append({'target': a['target'], 'state': 'unknown-category'}); continue
        candidates = [confined(p, a['target']) for p in locations]
        dest = next((p for p in candidates if p.exists()), candidates[0])
        if a['kind'] == 'plugin':
            marker = confined(dest, '.mymovie-integrity.json')
            installed = json.loads(marker.read_text()) if marker.is_file() else None
            # A marker is insufficient: every extracted file is rechecked.
            valid = installed and installed.get('archiveHash') == a['sha256'] and installed.get('revision') == a['revision'] and all(confined(dest,k).is_file() and sha(confined(dest,k), refresh=refresh) == h for k,h in installed.get('files', {}).items()) and bool(installed.get('files'))
            if valid:
                expected = set(installed['files'])
                # Runtime bytecode is transient; any new source/config code invalidates verification.
                actual = {str(p.relative_to(dest)) for p in dest.rglob('*') if p.is_file() and p.name != '.mymovie-integrity.json' and '__pycache__' not in p.parts}
                valid = actual == expected and not any(p.is_symlink() for p in dest.rglob('*'))
            state = 'verified' if valid else 'conflict' if dest.exists() else 'missing'
        else:
            state = 'verified' if dest.is_file() and dest.stat().st_size == a['size'] and sha(dest, refresh=refresh) == a['sha256'] else 'conflict' if dest.exists() else 'missing'
        rows.append({'target': a['target'], 'category': category, 'state': state, 'path': str(dest)})
    return {'runtime': identity, 'runtimeFingerprint': fingerprint, 'dockerImage': os.getenv('MYMOVIE_RUNTIME_IMAGE', ''), 'modelDirectories': dirs, 'files': rows}


def install(root, artifact, source, managed):
    a = artifact
    if sha(source, refresh=True) != a['sha256'] or Path(source).stat().st_size != a['size']:
        raise ValueError('Source integrity mismatch')
    if a['architecture'] not in ('any', platform.machine(), 'arm64' if platform.machine() == 'aarch64' else 'aarch64' if platform.machine() == 'arm64' else platform.machine()):
        raise ValueError('Dependency architecture mismatch')
    # Installation decisions must recheck bytes even when filesystem timestamps
    # are too coarse to invalidate the routine inventory hash cache.
    inv = inventory(root, [a], refresh=True); row = inv['files'][0]
    if row['state'] == 'verified': return row
    if row['state'] != 'missing': raise ValueError('Existing dependency conflicts; resolve it before initialization')
    if not managed:
        raise ValueError('External ComfyUI is read-only; install dependencies in its own environment manually')
    dest = Path(row['path']); dest.parent.mkdir(parents=True, exist_ok=True)
    if a['kind'] == 'plugin':
        staging = confined(dest.parent, f'.{dest.name}.installing')
        if staging.exists(): shutil.rmtree(staging)
        staging.mkdir()
        hashes = {}
        try:
            with tarfile.open(source, 'r:*') as archive:
                entries = archive.getmembers()
                if len(entries) > 10000 or sum(m.size for m in entries) > 512*1024*1024: raise ValueError('Plugin archive exceeds limits')
                for member in entries:
                    if not member.isfile() and not member.isdir(): raise ValueError('Plugin links/devices forbidden')
                    # Validate the original path too, before stripping a declared archive root.
                    confined(staging, member.name)
                    prefix = a.get('stripPrefix', '').rstrip('/')
                    name = member.name
                    if prefix:
                        if name.rstrip('/') == prefix:
                            if not member.isdir(): raise ValueError('Archive prefix is not a directory')
                            continue
                        if not name.startswith(prefix + '/'): raise ValueError('Unexpected plugin archive root')
                        name = name[len(prefix) + 1:]
                    target = confined(staging, name)
                    if member.isdir(): target.mkdir(parents=True, exist_ok=True); continue
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with archive.extractfile(member) as f, target.open('xb') as out: shutil.copyfileobj(f, out)
                    hashes[name] = sha(target)
            if not hashes: raise ValueError('Plugin archive is empty')
            confined(staging, '.mymovie-integrity.json').write_text(json.dumps({'archiveHash': a['sha256'], 'revision': a['revision'], 'files': hashes}))
            staging.rename(dest)
        except Exception:
            shutil.rmtree(staging, ignore_errors=True); raise
    else:
        temporary = confined(dest.parent, f'.{dest.name}.installing')
        shutil.copyfile(source, temporary)
        if sha(temporary, refresh=True) != a['sha256']: temporary.unlink(); raise ValueError('Installed dependency integrity mismatch')
        temporary.rename(dest)
    return {'target': a['target'], 'state': 'installed'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--managed', action='store_true')
    parser.add_argument('--model-paths', type=Path)
    parser.add_argument('--cache', type=Path)
    args = parser.parse_args(); payload = json.load(sys.stdin)
    global MODEL_PATHS, HASH_CACHE
    MODEL_PATHS=args.model_paths
    if args.cache and args.cache.is_file():
        try: HASH_CACHE=json.loads(args.cache.read_text())
        except (ValueError,OSError): pass
    root = args.root.resolve()
    if not (root / 'folder_paths.py').is_file(): raise ValueError('Choose the actual ComfyUI root')
    if payload.get('action') == 'install':
        result = install(root, payload['artifact'], payload['source'], args.managed)
    elif payload.get('action') == 'wheels':
        if not args.managed: raise ValueError('External runtime is read-only')
        wheel_paths=[]
        for a in payload['artifacts']:
            row=inventory(root,[a])['files'][0]
            if a['kind']!='wheel' or row['state']!='verified': raise ValueError('Wheel integrity not verified')
            wheel_paths.append(row['path'])
        subprocess.run([sys.executable, '-m', 'pip', 'install', '--disable-pip-version-check', '--no-index', '--no-deps', *wheel_paths], check=True, stdout=sys.stderr)
        result={'installed':len(wheel_paths)}
    else: result = inventory(root, payload.get('artifacts') or [])
    if args.cache:
        args.cache.parent.mkdir(parents=True,exist_ok=True)
        temporary=args.cache.with_suffix('.writing')
        temporary.write_text(json.dumps(HASH_CACHE)); temporary.replace(args.cache)
    print(json.dumps(result))

if __name__ == '__main__':
    try: main()
    except Exception as exc:
        print(json.dumps({'error': str(exc)})); sys.exit(1)
