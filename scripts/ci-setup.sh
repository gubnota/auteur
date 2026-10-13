# Source from Linux Bash or the macOS runner shell. Runtime paths stay job-local.
set -eu
export CARGO_HOME="${CI_PROJECT_DIR:-$PWD}/.ci/cargo"
export RUSTUP_HOME="${CI_PROJECT_DIR:-$PWD}/.ci/rustup"
export PATH="$CARGO_HOME/bin:$PATH"
if ! test -x "$CARGO_HOME/bin/rustup"; then
  curl --fail --silent --show-error https://sh.rustup.rs -o /tmp/mymovie-rustup.sh
  sh /tmp/mymovie-rustup.sh -y --profile minimal --default-toolchain "${RUST_VERSION:-1.96.0}"
fi
rustup toolchain install "${RUST_VERSION:-1.96.0}" --profile minimal --component rustfmt
rustup default "${RUST_VERSION:-1.96.0}"
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) node_platform=linux-x64 ;;
  Darwin-arm64) node_platform=darwin-arm64 ;;
  Darwin-x86_64) node_platform=darwin-x64 ;;
  *) echo 'Unsupported CI host'; return 1 ;;
esac
node_archive="node-v${NODE_VERSION:-22.14.0}-${node_platform}.tar.gz"
node_directory="${CI_PROJECT_DIR:-$PWD}/.ci/node"
mkdir -p "$node_directory"
curl --fail --silent --show-error "https://nodejs.org/dist/v${NODE_VERSION:-22.14.0}/$node_archive" -o "$node_directory/$node_archive"
curl --fail --silent --show-error "https://nodejs.org/dist/v${NODE_VERSION:-22.14.0}/SHASUMS256.txt" -o "$node_directory/SHASUMS256.txt"
python3 - "$node_directory" "$node_archive" <<'PY'
import hashlib, sys
from pathlib import Path
root, name = Path(sys.argv[1]), sys.argv[2]
expected = dict(line.split()[::-1] for line in (root / 'SHASUMS256.txt').read_text().splitlines())[name]
assert hashlib.sha256((root / name).read_bytes()).hexdigest() == expected, 'Node archive checksum mismatch'
PY
tar -xzf "$node_directory/$node_archive" -C "$node_directory" --strip-components=1
export PATH="$node_directory/bin:$PATH"
