# RunPod ComfyUI agent

RunPod ComfyUI is the primary production execution target. RunningHub is an
optional workflow test destination. The same Jobs draft can target either;
private RunPod uses a **relay** connection and an outbound Linux agent.

## Download the agent

Branch builds on GitHub publish `comfyui-agent-linux-x86_64`; GitLab publishes
`comfyui-agent-linux-x86_64-<branch>`. Version tags publish the same files with checksums.
Use `mymovie-agent-linux-x86_64.tar.gz`, its `.json` metadata and
`SHA256SUMS-agent.txt` from the **same build**. The archive contains the actual
ELF x86_64 agent and this guide. It is built on Ubuntu 22.04; use a compatible
Linux x86_64 image with glibc 2.35 or newer.

For ARM64 Linux workers, use `mymovie-agent-linux-aarch64.tar.gz`, its `.json`
metadata and `SHA256SUMS-agent-aarch64.txt` instead. It is built and smoke-tested
on Ubuntu 22.04 ARM64 and requires an ARM64 image with glibc 2.35 or newer.
The executable inside either archive is named `mymovie-agent`; do not mix
architecture-specific archives or metadata. Colab/Kaggle notebooks use x86_64.

Verify the SHA-256 against metadata from a trusted build before extracting:

```sh
sha256sum mymovie-agent-linux-x86_64.tar.gz
tar -xzf mymovie-agent-linux-x86_64.tar.gz
chmod +x mymovie-agent
./mymovie-agent --version
```

## Prepare the private runtime

Start ComfyUI with authorized weights and required custom nodes already installed
in your pinned container image. Keep its port private. The agent does not install
weights or run arbitrary shell commands. Check its local endpoint:

```sh
./mymovie-agent doctor --comfy-url http://127.0.0.1:8188 --data /workspace/mymovie-agent
```

The relay must run separately at an authenticated HTTPS address reachable by
both the Mac and the pod. It brokers jobs and results, so the pod needs outbound
HTTPS access but no public IP or exposed ComfyUI port. The relay's current asset
transport stores data on its persistent disk; automatic S3 LoRA/runtime sync and
full RunPod/S3 acceptance remain unfinished.

Build/deploy `mymovie-relay` separately from this repository. Configure persistent
`MYMOVIE_RELAY_DATA`, `MYMOVIE_RELAY_BIND` behind your HTTPS reverse proxy,
distinct 24+ character `MYMOVIE_DESKTOP_TOKEN` and `MYMOVIE_AGENT_TOKEN`, and
`MYMOVIE_NODE_IDS=runpod-gpu0` (comma-separated for multiple workers). These
secrets belong in the host's secret environment, never in workflow JSON or Git.

## Connect the worker

Inject `MYMOVIE_AGENT_TOKEN` through the pod's secret environment, matching the
relay agent token. Launch under your container supervisor:

```sh
./mymovie-agent serve \
  --comfy-url http://127.0.0.1:8188 \
  --relay https://YOUR-RELAY-HOST \
  --node-id runpod-gpu0 \
  --data /workspace/mymovie-agent
```

Persist the data directory: receipts prevent blind replay after session loss.
In MyMovie Studio → Connections, add **Private runner relay**, set its HTTPS URL
and node ID `runpod-gpu0`, and enter the separate desktop token using the secure
credential field. Use concurrency **1** for this worker. Check connection health,
then select it in Jobs, configure exact inputs, review and start.

For multiple GPUs, run one ComfyUI process and agent per GPU, each with isolated
CUDA visibility, local port, node ID and receipt directory. Add one relay
connection per node. Jobs sends these independently in parallel; it does not
combine GPU memory. The relay must allowlist every node ID.

Waiting jobs reopen paused and require Resume. An ambiguous submission remains
unknown until its remote task is reconciled; it must not be submitted again
blindly. A live GPU/RunPod roundtrip requires a reachable relay and your running
pod; a successful CI build alone does not establish runtime readiness.
