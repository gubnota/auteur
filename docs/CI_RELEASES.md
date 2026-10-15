# Build artifacts and version tags

The repository provides `.gitlab-ci.yml` and GitHub Actions under `.github/workflows/`.
The configured remote is currently GitHub. A GitLab pipeline requires importing/mirroring the repository into your GitLab project; no GitLab project or runner was created during local verification.

## GitLab

Only version-tag pushes (`vX.Y.Z`) create a pipeline. Branch commits, merge requests
and manual runs do not start builds. Tag pipelines run these checks before packaging:

- Rust formatting and workspace tests; frontend types, tests and production build.
- Mocked workflow-wrapper, optional-input, queue-selection and ComfyUI interaction acceptance; provider HTTP contract tests.
- Notebook bootstrap/release tests and generated notebook parity.
- macOS Apple Silicon DMG, Windows x64 MSI/EXE installers, Linux x86_64 desktop DEB/AppImage. Intel macOS and Linux ARM64 desktop entries are commented out in GitLab.
- Linux x86_64 and macOS Apple Silicon headless ComfyUI client archives with matching relay, workflow compiler helper, SHA-256 metadata, shared bootstrap and Colab/Kaggle notebooks. Intel macOS and Linux ARM64 agent entries are commented out.

Build artifacts remain available for 14 days. A `vX.Y.Z` tag must match the versions in Cargo, npm and Tauri. Successful version tags publish checksummed files to the GitLab Generic Package Registry and create a Release linking to those versioned files. Release-job artifacts remain for 30 days; registry links remain until the packages/project are explicitly deleted. Rerunning a release refuses to overwrite different bytes under the same version.

Linux jobs use Ubuntu 22.04 on `saas-linux-small-amd64`; ARM64 entries remain commented out. Toolchains are Rust 1.96.0 and Node 22.14.0; Node downloads are checksum verified. The macOS job uses `macos-15-xcode-16` and defaults to `MACOS_RUNNER_TAG=saas-macos-medium-m1`, targeting Apple Silicon. GitLab hosted macOS requires an eligible plan; alternatively override that variable with the tag of your prepared macOS shell runner. A self-hosted runner must have Xcode command-line tools and permissions to install the job-local toolchains.

The Windows job requires a prepared x64 PowerShell shell runner tagged `WINDOWS_RUNNER_TAG` (default `windows-x64`) with Node 22.14.0, rustup and Visual Studio C++ build tools. It builds unsigned MSI/NSIS EXE installers; no Windows runner is provisioned by this repository.

Create/protect release tags in the GitLab project settings. Enable the Package Registry. Publication uses the built-in `CI_JOB_TOKEN`; no personal access token is stored in this repository. Every tag pipeline runs the source checks before building. Failed checks/builds prevent publication.

macOS artifacts are ad-hoc signed and are not Apple-notarized. Distribution signing/notarization is a separate unfinished release step. All five desktop builds and all four native Linux/macOS agent smoke tests passed on GitHub for 0.1.6. GitLab execution remains unverified; foreign desktop binaries were not launched on this Mac.

## GitHub

`checks.yml` is reusable (`workflow_call`) only; normal commits and pull requests
do not run it. `release.yml` is triggered only by `v*` tag pushes and rejects tags
that do not match the source version. It calls source acceptance and a native desktop matrix: macOS Apple Silicon, Windows x64, and Linux x86_64/ARM64. Agents are built and smoke-tested natively for Linux x86_64 and macOS Apple Silicon, with matching relays. macOS Intel desktop/agent and Ubuntu ARM64 agent entries are commented out at the user's request; Linux ARM64 desktop remains active on GitHub. `release.yml` validates a `vX.Y.Z` tag, calls that matrix, stages every artifact and checksum in a draft, then **publishes the complete prerelease automatically**. Failed checks/builds prevent publication. Reruns refuse to overwrite an already published release. Nothing creates a tag automatically.

[Published 0.1.5 downloads](https://github.com/gubnota/auteur/releases/tag/v0.1.5) contain 19 assets: macOS ARM/Intel DMGs, Windows x64 MSI/EXE, Linux x86_64/ARM64 DEB/AppImage, both Linux agents, notebooks, guide and checksums. Exact source: `c5955734dea43963e98ade98e0fca457773b4324`. [Hosted run 38512704998](https://github.com/gubnota/auteur/actions/runs/38512704998) passed source checks, all five desktop builds and both native agent smoke tests. Its final publication step failed because an upload glob included empty bundle directories. Publication was recovered from the seven digest-verified artifact archives without rebuilding or changing the tag. All 19 public downloads were then independently verified against asset/global SHA-256, container formats, Linux architecture headers and agent source/bootstrap metadata. Screenshot: [release-0.1.5.jpg](screenshots/release-0.1.5.jpg).

Future release uploads select only regular files; an empty-directory regression and all 18 Python tests passed locally. The failed v0.1.4 tag is retained unchanged; Windows builds invoke the Tauri Node CLI directly to preserve options under PowerShell. The earlier [0.1.3 release](https://github.com/gubnota/auteur/releases/tag/v0.1.3) remains available at its original exact source `ab71e49`.

## 0.1.6 verification

Local source acceptance: 38 Rust tests, 10 frontend tests, seven mocked browser tests and 28 Python tests passed. Normal editor import/preparation/API export and saved input reuse were checked in the installed macOS app. Native Generate → Jobs → Renders produced a 64 × 114 PNG from the saved mask workflow; local MPS FaceSwap also completed.

[Hosted run 38557508498](https://github.com/gubnota/auteur/actions/runs/38557508498) passed source checks, all five desktop builds, all four native agent builds/smoke tests and automatic publication. [Published v0.1.6](https://github.com/gubnota/auteur/releases/tag/v0.1.6) contains 34 assets from exact source `950c707849eb5082d6a7651ec57ab9cc3353184d`. Every public file was downloaded anonymously and verified against asset/global SHA-256. Installer formats, DEB version/architecture, Linux ELF and macOS Mach-O architectures, and agent source/compiler/runtime/bootstrap metadata passed independent verification. No publication recovery or tag replacement was needed.

## RunPod agent (primary target)

Version-tag builds expose **comfyui-agent-linux-x86_64** and **comfyui-agent-macos-aarch64**, independent of the desktop matrix after shared checks pass. Linux ARM64 and macOS Intel agent entries are commented out; the packager still supports those targets. Each archive includes matching metadata/checksums and the [RunPod setup guide](../deploy/runpod/README.md). Packaging rejects wrong ELF/Mach-O architecture headers. Both CI systems explicitly build/package the agent, matching relay binary, guide, runtime helper and workflow compiler. RunPod connects outbound over authenticated HTTPS, without a public ComfyUI port. No live pod or relay is provisioned by CI.

Workflow compilation additionally requires Python, the pinned `workflow-compiler-requirements.txt` dependencies and Playwright Chromium; the browser is not embedded in the archive. See [workflow setup](WORKFLOW_SETUP.md) for installation and inspect/install/compile commands. Direct local/remote compilation uses the selected ComfyUI frontend exporter without opening its interface or changing a live canvas.

Hosted agent acceptance: Linux and macOS, each on x86_64 and ARM64, built and passed native help/version smoke tests in [run 38557508498](https://github.com/gubnota/auteur/actions/runs/38557508498). Durable Linux downloads: [x86_64 archive](https://github.com/gubnota/auteur/releases/download/v0.1.6/mymovie-agent-linux-x86_64.tar.gz), [ARM64 archive](https://github.com/gubnota/auteur/releases/download/v0.1.6/mymovie-agent-linux-aarch64.tar.gz). macOS utilities are available from the same release. Use the corresponding release metadata/checksums to verify the archive and bootstrap. CI job artifacts expire after 14 days; version-tag releases provide durable distribution links. Cloud GPU execution is a separate acceptance step.

## Colab/Kaggle deployment

The generated notebook defaults to automatic release discovery: leave `ARTIFACT_SOURCE` and `ARTIFACT_SHA256` blank. It lists published GitHub releases (including prereleases, unlike `/releases/latest`), resolves the Linux x86_64 archive/metadata, validates the metadata checksum against GitHub's asset digest when present, and verifies downloaded bytes before extraction. `RELEASE_TAG` optionally pins a version. Public releases require no GitHub token. An uploaded/custom artifact still requires both source and trusted SHA256. Download the notebook/bootstrap from a verified source before executing them.

Local Cloudflare mode requires `mymovie-relay` in both release metadata and the archive. Public **v0.1.15** now supplies it; v0.1.12 does not. The notebook installs a checksum-pinned cloudflared automatically and tunnels its authenticated local relay on a configurable port. Shared editable test keys match Settings → Node access; env/Secrets overrides remain commented out.

Open the [current Colab notebook](https://colab.research.google.com/github/gubnota/auteur/blob/main/deploy/colab/MyMovie_ComfyUI.ipynb), enable a GPU runtime, then **Run all without edits**. It installs the immutable ComfyUI commit and cloudflared pinned in `deploy/notebook-runtime.defaults.json`, a separate Python environment reusing the runtime CUDA PyTorch, and the released compiler requirements/Chromium. It preserves unrelated `/content/ComfyUI` installations and downloads no weights or workflow plugins. Healthy repeated runs reuse the session. Stop/bounded-wait cells are commented out by default. Installation stages are printed, private details stay in `mymovie-session/installation.log` and `process-*.log`. The last startup output shows the relay URL/node IDs to paste into Connections with temporary-tunnel polling enabled. Workflow dependencies are initialized later through Studio. Saved Drive copies and older release notebooks do not update automatically; reopen the current source notebook.

The default notebooks install their own base ComfyUI checkout and dependencies; authorized workflow weights are provided later through app initialization. Advanced Attach mode requires an existing checkout/server and installed cloudflared. The notebooks deploy our released client instead of compiling Rust. Kaggle can start two independent processes, each assigned one visible GPU and a separate local port/node ID. This is parallel job execution, with no pooling of GPU memory. Session loss marks work unknown/offline rather than resubmitting blindly. Live Colab/Kaggle deployment still requires the running notebook and reachable relay; use only notebook runtimes whose terms permit remote workers.

Generated sources: `scripts/generate-notebooks.py` and `scripts/notebook-bootstrap.py`. Tests: `scripts/tests/`. Only the authenticated relay is tunneled; ComfyUI stays on loopback. A current archive with mymovie-relay is required for local tunnel mode.

Sources: [GitLab macOS runners](https://docs.gitlab.com/ci/runners/hosted_runners/macos/), [Generic packages](https://docs.gitlab.com/user/packages/generic_packages/), [Release API](https://docs.gitlab.com/api/releases/).

## Preparing a release

Version tags refer to committed files. `git add` only stages changes: tagging before committing still releases the previous source. Tags v0.1.13 and v0.1.14 both refer to source 0.1.12 and failed version validation. Preserve those tags; use the new 0.1.15 source version with its own commit/tag.

Update Cargo workspace, npm workspace and Tauri versions together, including Cargo.lock and package-lock.json. Then validate, commit and publish the exact new tag:

```sh
RELEASE_TAG=v0.1.15 python3 scripts/check-release-version.py
# Review and stage the intended release changes before committing.
git commit -m "Release 0.1.15 with notebook relay setup"
git tag v0.1.15
git push origin main
git push origin v0.1.15
```

The checker reports the requested tag and expected version when they differ. A tag push starts hosted builds; downloads appear only after all required jobs succeed. Do not force-move existing published tags or upload replacements under an old version. The installed app remains unchanged until a new desktop build is installed. Live GitLab and cloud GPU acceptance remain unverified.
