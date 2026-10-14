export type SetupHost = "macos" | "linux" | "colab" | "kaggle";
export type SetupAction =
  "inventory" | "serve" | "workflow-install" | "workflow-compile" | "provision";
export interface ScriptConfig {
  artifact: string;
  sha256: string;
  root: string;
  python: string;
  comfyUrl: string;
  relay: string;
  nodeId: string;
  action: SetupAction;
  managed: boolean;
}
const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;
// Every entered value is shell data, never executable shell syntax.
export function setupScript(c: ScriptConfig): string {
  const env: Record<string, string> = {
    MYMOVIE_ARTIFACT_SOURCE: c.artifact,
    MYMOVIE_ARTIFACT_SHA256: c.sha256,
    COMFY_ROOT: c.root,
    COMFY_PYTHON: c.python,
    COMFY_URL: c.comfyUrl,
    RELAY_URL: c.relay,
    NODE_ID: c.nodeId,
  };
  return `#!/bin/sh
set -eu
${Object.entries(env)
  .map(([k, v]) => `${k}=${quote(v)}\nexport ${k}`)
  .join("\n")}
# Run in a dedicated working directory on the ComfyUI machine (SSH is fine).
# Obtain the archive and SHA256SUMS from the same CI build or release.
CLIENT_DIR=$(python3 - <<'PY'
import hashlib, os, pathlib, platform, re, tarfile, tempfile, urllib.request
source = os.environ['MYMOVIE_ARTIFACT_SOURCE']
digest = os.environ['MYMOVIE_ARTIFACT_SHA256'].lower()
if not re.fullmatch(r'[0-9a-f]{64}', digest): raise SystemExit('Enter a trusted archive SHA256 first')
cache = pathlib.Path('.mymovie-client-cache')
if cache.is_symlink(): raise SystemExit('Unsafe client cache')
cache = cache.resolve()
cache.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(dir=cache) as tmp:
    archive = pathlib.Path(tmp) / 'agent.tar.gz'
    with (urllib.request.urlopen(source, timeout=60) if source.startswith('https://') else open(source, 'rb')) as stream, archive.open('wb') as out:
        total = 0
        while chunk := stream.read(1024*1024):
            total += len(chunk)
            if total > 256*1024*1024: raise SystemExit('Archive exceeds size limit')
            out.write(chunk)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != digest: raise SystemExit('Archive checksum mismatch')
    target = cache / digest
    if target.is_symlink(): raise SystemExit('Unsafe client destination')
    target.mkdir(exist_ok=True)
    with tarfile.open(archive) as bundle:
        members = bundle.getmembers()
        if len(members)>128 or sum(m.size for m in members)>512*1024*1024: raise SystemExit('Oversized archive')
        for m in members:
            p = pathlib.PurePosixPath(m.name)
            if not m.isfile() or p.is_absolute() or len(p.parts)!=1 or p.name in ('..', '.'): raise SystemExit('Unsafe archive entry')
            dest = target / p.name
            if dest.is_symlink(): raise SystemExit('Unsafe extracted destination')
            with bundle.extractfile(m) as inp, dest.open('wb') as out: out.write(inp.read())
    agent = target / 'mymovie-agent'
    header = agent.read_bytes()[:20]
    arch = platform.machine().lower()
    cpu = {'arm64':b'\\x0c\\x00\\x00\\x01','aarch64':b'\\x0c\\x00\\x00\\x01','x86_64':b'\\x07\\x00\\x00\\x01'}.get(arch)
    machine = {'arm64':b'\\xb7\\x00','aarch64':b'\\xb7\\x00','x86_64':b'\\x3e\\x00'}.get(arch)
    if cpu is None or machine is None: raise SystemExit('Unsupported agent architecture')
    valid = platform.system()=='Darwin' and header[:4]==b'\\xcf\\xfa\\xed\\xfe' and header[4:8]==cpu or platform.system()=='Linux' and header[:6]==b'\\x7fELF\\x02\\x01' and header[18:20]==machine
    if not valid: raise SystemExit('Select the agent archive for this OS and architecture')
    agent.chmod(0o755)
    print(target)
PY
)
"$CLIENT_DIR/mymovie-agent" --version
set -- ${c.action} --comfy-root "$COMFY_ROOT" --python "$COMFY_PYTHON" --comfy-url "$COMFY_URL" --runtime-helper "$CLIENT_DIR/mymovie_runtime.py" --workflow-compiler "$CLIENT_DIR/mymovie_workflow_compiler.py" --data "$PWD/agent-data" --cache "$PWD/agent-cache"
${c.action.startsWith("workflow-") ? 'set -- "$@" --workflow-source "$PWD/workflow.json"' : ""}
${c.action === "workflow-install" ? 'set -- "$@" --publish-to-comfyui' : ""}
${c.action === "provision" ? '# Export both reviewed files from Studio first. This command previews; it does not install.\nset -- "$@" --profile "$PWD/profile.json" --workflows "$PWD/workflow-setup.json"' : ""}
${c.action === "serve" ? ': "${MYMOVIE_AGENT_TOKEN:?Set the separate agent token in your secret environment}"\nset -- "$@" --relay "$RELAY_URL" --node-id "$NODE_ID"' : ""}
${c.managed ? 'set -- "$@" --managed-runtime' : ""}
# Optional: append --model-paths /absolute/path/extra_model_paths.yaml.
# Compiler needs the packaged requirements and Playwright Chromium in COMFY_PYTHON.
"$CLIENT_DIR/mymovie-agent" "$@"
# In Studio: Connections > Inventory > Review initialization > Initialize.
# The runner verifies this session, dependency pins and canary before marking ready.
# Repeat on a fresh session or changed runtime; a stale marker is never readiness.
`;
}
