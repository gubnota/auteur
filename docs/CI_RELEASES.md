# Build artifacts and version tags

The repository provides `.gitlab-ci.yml` and GitHub Actions under `.github/workflows/`.
The configured remote is currently GitHub. A GitLab pipeline requires importing/mirroring the repository into your GitLab project; no GitLab project or runner was created during local verification.

## GitLab

Branches and merge requests run checks before packaging:

- Rust formatting and workspace tests; frontend types, tests and production build.
- Mocked RunningHub browser acceptance and provider HTTP contract tests.
- Notebook bootstrap/release tests and generated notebook parity.
- macOS Apple Silicon and Intel DMGs, Windows x64 MSI/EXE installers, Linux x86_64/ARM64 desktop DEB/AppImage.
- Linux x86_64/ARM64 headless ComfyUI client archives, SHA-256 metadata, shared bootstrap and Colab/Kaggle notebooks.

Build artifacts remain available for 14 days. A `vX.Y.Z` tag must match the versions in Cargo, npm and Tauri. Successful version tags publish checksummed files to the GitLab Generic Package Registry and create a Release linking to those versioned files. Release-job artifacts remain for 30 days; registry links remain until the packages/project are explicitly deleted. Rerunning a release refuses to overwrite different bytes under the same version.

Linux jobs use Ubuntu 22.04 on architecture-specific runners (`saas-linux-small-amd64` and `saas-linux-small-arm64`). Toolchains are Rust 1.96.0 and Node 22.14.0; Node downloads are checksum verified. The macOS job uses `macos-15-xcode-16` and defaults to `MACOS_RUNNER_TAG=saas-macos-medium-m1`, cross-compiling Intel on Apple Silicon. GitLab hosted macOS requires an eligible plan; alternatively override that variable with the tag of your prepared macOS shell runner. A self-hosted runner must have Xcode command-line tools and permissions to install the job-local toolchains.

The Windows job requires a prepared x64 PowerShell shell runner tagged `WINDOWS_RUNNER_TAG` (default `windows-x64`) with Node 22.14.0, rustup and Visual Studio C++ build tools. It builds unsigned MSI/NSIS EXE installers; no Windows runner is provisioned by this repository.

Create/protect release tags in the GitLab project settings. Enable the Package Registry. Publication uses the built-in `CI_JOB_TOKEN`; no personal access token is stored in this repository. Tag pipelines use the same source checks as branch pipelines. Failed checks/builds prevent publication.

macOS artifacts are ad-hoc signed and are not Apple-notarized. Distribution signing/notarization is a separate unfinished release step. Hosted Apple Silicon/Intel and Linux x86_64 packaging passed for 0.1.3. Windows and ARM64 hosted acceptance is tracked below; packaging is not tested by executing foreign binaries on this Mac.

## GitHub

`checks.yml` runs source acceptance and a native platform matrix: macOS Apple Silicon/Intel, Windows x64, and Linux x86_64/ARM64. Agents are built and smoke-tested natively for both Linux architectures. `release.yml` validates a `vX.Y.Z` tag, calls that matrix, stages every artifact and checksum in a draft, then **publishes the complete prerelease automatically**. Failed checks/builds prevent publication. Reruns refuse to overwrite an already published release. Nothing creates a tag automatically.

[Published 0.1.3 downloads](https://github.com/gubnota/auteur/releases/tag/v0.1.3): both macOS DMGs, Linux x86_64 DEB/AppImage, agent and notebook assets. These are unchanged artifacts from successful run 38474310778; the tag targets the exact build source `ab71e49`. Every downloaded artifact-container digest and every uploaded release-asset digest was verified before publication. Windows and Linux ARM64 are added in 0.1.4; their hosted acceptance/publication is tracked in TASK_LOG.

## RunPod agent (primary target)

GitHub branch builds expose **comfyui-agent-linux-x86_64** and **comfyui-agent-linux-aarch64**, independent of the desktop build matrix after shared checks pass. GitLab adds a branch suffix to both names. Each contains `mymovie-agent-linux-<architecture>.tar.gz`, matching metadata/checksums and the [RunPod setup guide](../deploy/runpod/README.md). Packaging rejects non-ELF binaries or mismatched ELF architecture headers. The archive includes the agent and guide; the relay is built but must be deployed separately. RunPod connects outbound over authenticated HTTPS, without a public ComfyUI port. No live pod or relay is provisioned by CI.

Hosted acceptance: [GitHub run 38474310778](https://github.com/gubnota/auteur/actions/runs/38474310778), commit `ab71e49`, passed source checks, both macOS desktop builds, Linux x86_64 desktop packaging and the Linux agent build/smoke test. The [Linux agent artifact](https://github.com/gubnota/auteur/actions/runs/38474310778/artifacts/11853018891) is 2,440,831 bytes, with GitHub artifact digest `sha256:a7c535c70ee0326c2832dabb9f141e84fe7b0d9749b2e041193983808240ab55`. This digest identifies the uploaded artifact container; use the included checksums/metadata to verify the agent archive and bootstrap. Branch downloads expire after 14 days; version-tag releases provide durable distribution links. Cloud GPU execution is a separate acceptance step.

## Colab/Kaggle deployment

Download the Linux client archive, its metadata/checksums, `notebook-bootstrap.py` and the appropriate notebook from one verified release. Confirm the archive and bootstrap SHA-256 values before execution. The notebook asks for an authenticated HTTPS relay and reads its token from notebook Secrets; do not paste credentials into cells or movie packages.

The notebooks require an existing ComfyUI checkout, its dependencies and authorized weights. They deploy our client artifact alongside ComfyUI rather than compiling the Rust client in a notebook. Kaggle can start two independent processes, each assigned one visible GPU and a separate local port/node ID. This is parallel job execution, with no pooling of GPU memory. Session loss marks work unknown/offline rather than resubmitting blindly. Live Colab/Kaggle deployment still requires the running notebook and reachable relay; use only notebook runtimes whose terms permit remote workers.

Generated sources: `scripts/generate-notebooks.py` and `scripts/notebook-bootstrap.py`. Tests: `scripts/tests/`. No public unauthenticated ComfyUI tunnel is created by our bootstrap.

Sources: [GitLab macOS runners](https://docs.gitlab.com/ci/runners/hosted_runners/macos/), [Generic packages](https://docs.gitlab.com/user/packages/generic_packages/), [Release API](https://docs.gitlab.com/api/releases/).
