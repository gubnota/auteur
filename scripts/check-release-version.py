"""Fail before a tag build when package versions disagree or the tag is invalid."""
import json
import os
from pathlib import Path
import re


def check(root, tag):
    cargo = (root / 'Cargo.toml').read_text().split('[workspace.package]', 1)[1].split('[', 1)[0]
    version = re.search(r'^version\s*=\s*"([^"]+)"', cargo, re.M).group(1)
    for name in ['package.json', 'apps/desktop/package.json', 'packages/schema/package.json', 'apps/desktop/src-tauri/tauri.conf.json']:
        assert json.loads((root / name).read_text())['version'] == version, f'Version mismatch: {name}'
    if tag:
        assert re.fullmatch(r'v\d+\.\d+\.\d+', tag), 'Release tag must be vX.Y.Z'
        assert tag == f'v{version}', (
            f'Release tag {tag} does not match source version {version}; expected v{version}. '
            'Update all package versions and lockfiles, commit the changes, then create a new matching tag. '
            'git add only stages files; tags point to commits.'
        )
    return version


if __name__ == '__main__':
    try:
        print('Version:', check(Path(__file__).resolve().parents[1], os.environ.get('CI_COMMIT_TAG') or os.environ.get('RELEASE_TAG', '')))
    except AssertionError as error:
        raise SystemExit(f'Release validation failed: {error}') from None
