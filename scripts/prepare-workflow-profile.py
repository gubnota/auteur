"""Resolve a local inventory and reviewed offline wheelhouse into a runner profile.
No downloads, execution or credential handling. Upload wheels/plugin to private
transfer storage using the object names emitted in sourceRef before provisioning.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re


def prepare(inventory, bundle, wheelhouse=None, licenses=None):
    inventory = inventory.get('inventory', inventory)
    fingerprint = inventory.get('runtimeFingerprint', '')
    if not re.fullmatch(r'[a-fA-F0-9]{64}', fingerprint):
        raise ValueError('Run Inventory on the actual ComfyUI Python runtime first')
    profile = json.loads((bundle / 'mask-canary.template.json').read_text())
    profile['runtime']['fingerprint'] = fingerprint
    if wheelhouse is not None:
        plugin = json.loads((bundle / 'mymovie-rembg.plugin.json').read_text())
        source = bundle / plugin['sourceRef']
        if source.stat().st_size != plugin['size'] or hashlib.sha256(source.read_bytes()).hexdigest() != plugin['sha256']:
            raise ValueError('Plugin bundle integrity mismatch')
        wheels = sorted(wheelhouse.glob('*.whl'))
        if not wheels or not any(p.name.lower().startswith('onnxruntime-') for p in wheels):
            raise ValueError('Supply a reviewed complete onnxruntime CPU wheelhouse for this worker Python/platform')
        profile['artifacts'] = [json.loads((bundle / 'rembg-u2netp.model.json').read_text()), plugin]
        for path in wheels:
            if path.is_symlink():
                raise ValueError('Wheel symlinks are not allowed')
            license = (licenses or {}).get(path.name, '')
            if not isinstance(license, str) or not license.strip():
                raise ValueError('Provide reviewed license metadata for every wheel filename')
            profile['artifacts'].append(dict(kind='wheel',category='wheels',target=path.name,
                sha256=hashlib.sha256(path.read_bytes()).hexdigest(),size=path.stat().st_size,
                architecture=inventory['runtime']['architecture'],license=license,
                sourceRef=path.name,source='',revision='',stripPrefix=''))
        profile['nodeTypes'].append('MyMovieU2netp')
    return profile


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('inventory', type=Path); p.add_argument('destination', type=Path)
    p.add_argument('--bundle', type=Path, default=Path(__file__).resolve().parent)
    p.add_argument('--wheelhouse', type=Path)
    p.add_argument('--wheel-license-review', type=Path, help='JSON map: wheel filename to reviewed license/permission')
    a = p.parse_args()
    if a.destination.exists():
        p.error('Destination already exists; review and choose a new file')
    try:
        licenses = json.loads(a.wheel_license_review.read_text()) if a.wheel_license_review else None
        result = prepare(json.loads(a.inventory.read_text()), a.bundle, a.wheelhouse, licenses)
    except (ValueError, KeyError, OSError) as e:
        p.error(str(e))
    a.destination.write_text(json.dumps(result, indent=2) + '\n')
