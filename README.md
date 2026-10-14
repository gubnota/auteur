# MyMovie Studio

[Download releases](https://github.com/gubnota/auteur/releases/tag/v0.1.6) — macOS Apple Silicon/Intel, Windows x64, Linux x86_64/ARM64 and headless ComfyUI agents. Windows installers are unsigned; macOS notarization remains pending.

Current main and the installed macOS app are **0.1.11**; the public download remains **v0.1.6** until a new tag. **Generate** is the only job editor; **Jobs** holds queue/history. **Edit queued batch** opens Generate, where you can change **Execution node** and **Save queue changes**. Review offers separate **Add to queue** and **Run now** actions. Remove any batch item, reuse started work as a draft, and use **Clear finished** to hide terminal bottom rows while retaining receipts/results.

Redux FaceSwap is configured once as RunningHub Workflow **2110376761482002434**: **19.image = Face identity reference**, **86.image = Base photograph**. Disconnected loader 88 stays inactive. New jobs reuse these slots; choose media from the gallery or drop files. The hosted mapping is user-confirmed; paid execution has not been tested.

**0.1.9** fixes the pre-upload hardware check that incorrectly rejected CUDA workflows on RunningHub. In **Jobs**, reuse the failed attempt, review the retained images/account and run the new draft. The old failed receipt remains in history.

**0.1.11** uses RunningHub’s documented workflow-resource upload endpoint and retains safe plain-language refusal reasons. Code **605** remains undocumented; the upload contract mismatch is fixed, but a successful live run is still unverified. Existing receipts retain their original message. Reuse failed work as a new reviewed draft to use the corrected adapter.

Configure exact fields once in **Workflows → Reusable inputs**: labels, image/video/audio roles, text/number/boolean/JSON, Advanced and Hidden. The field picker marks used inputs and blocks duplicates. Generate uses this saved form and a searched thumbnail gallery; reused media keeps its asset ID. **Library** and **Renders** share media with Render tags, usage/provenance and bulk **Trash / Restore**. Duplicate imports preserve an existing linked location until explicit Collect. Video posters, filename ellipsis, Welcome navigation and removable recents remain available. See [setup](docs/WORKFLOW_SETUP.md) and [acceptance](docs/GENERATION_ACCEPTANCE.md).

![Queue editing, fixture UI](docs/screenshots/jobs-queue-edit.png)

Version **0.1.6** introduced a reusable workflow catalogue, automatic editor-to-API compilation against the selected ComfyUI frontend, generated input forms, real dimension controls and macOS/Linux agent utilities. Jobs preserve exact inputs, queue on one instance and run in parallel across different instances. RunPod ComfyUI is the main execution target; RunningHub tests saved hosted deployments. Older documents upgrade to schema v4 only after an explicit backed-up migration; older apps cannot open the upgraded package.

Release build: `npm run tauri:build -- --bundles app`; output: `target/release/bundle/macos/MyMovie Studio.app`. Local installation uses an ad-hoc signature; Apple notarization remains pending.

A local-first macOS film studio built with Rust, Tauri and React. Movies are Finder `.mymovie` document packages containing episodes, an ordered storyboard, characters, imported workflows, generation records and media. The desktop uses Fenki’s palette and an original SVG symbol.

[Русский](README.ru.md) · [Français](README.fr.md) · [Implementation status](docs/PROJECT_CONTEXT.md)

![Materials collected inside a movie](docs/screenshots/library-collected.png)

## Current main: Generate and portable workflow setup

**Generate** uses a single Custom workspace for image/video/audio workflows, standalone or storyboard jobs. Select a saved workflow/node, assign media and exact values, then review. **Add to queue** creates idle work; **Jobs → Run queued batch / Run all queued** starts it. One ComfyUI instance queues work; different instances dispatch concurrently.

**Workflows → Compatibility & initialization** provides Unspecified, Universal, Apple Silicon, CUDA, ROCm and CPU flags, plus reviewed model/plugin/wheel sources, hashes, licenses and destinations. [Portable setup commands](docs/WORKFLOW_SETUP.md) explain instance Python, effective model folders, plugin installation, private storage, restart and first-session canary. [RunPod/Colab connection instructions](deploy/runpod/README.md) explain the HTTPS relay address.

Documents use schema **v4**, with backed-up upgrades from v1/v2/v3. Local frontend compilation, safe MPS FaceSwap and the weight-free canary were tested; [acceptance evidence](docs/GENERATION_ACCEPTANCE.md) separates real execution, fixture UI checks and pending cloud tests.

The historical 0.1.6 macOS app completed Generate → Jobs → Renders using a saved editor workflow and local node, producing a 64 × 114 PNG at 9:16. The saved ratio also survived reopening the movie.

![Generate workspace](docs/screenshots/generate.png)


## Working with a movie

Create a movie and choose its location, or open an existing `.mymovie` package. Rename the movie and episodes, add scenes and shots, then arrange keyframes. Edit prompts, comments, aspect ratios and participating characters. Scene characters are inherited by their frames.

Import character reference images through the character editor. File-drop routing is implemented for characters, the Library, existing frames, shot lanes and new scenes. Actual Finder drag-and-drop acceptance is still unverified; use the import buttons if a drop does not arrive.

## Copy or link materials

The **Media imports** control offers two modes:

- **Copy into movie** (default): originals are copied into the package and deduplicated by content.
- **Keep original location**: the movie references the existing file without copying it. Keep the original available at that location.

This applies to imported images, videos, audio and supported LoRA files, including character references. Workflow definitions are imported separately into the movie.

The Library lists linked locations. **Check files** detects missing or changed originals. **Relink** accepts a replacement with the exact original content, preserving frame and character assignments.

Before transferring a linked movie, choose **Collect for export**. It verifies and copies all linked materials into the current `.mymovie`, keeping their assignments. Missing or changed originals stop collection. Close the movie, then copy the complete package in Finder. This is collection into the current movie; a separate archive/export-copy wizard is not implemented.

Native picker import and linked character reference collection were verified in the macOS app.

## Workflows and connections

Import an editor or API workflow once through **Browse workflow catalogue**. Select a saved node and prepare editor workflows through that ComfyUI frontend; [compiler prerequisites](docs/WORKFLOW_SETUP.md) are required. In **Workflows → Reusable inputs**, expose exact literal fields and save their labels, media roles and Advanced/Hidden choices once. API-only fields remain unverified until compatible registry preparation. Old or changed ComfyUI profiles refresh before a new review/freeze; failed preparation retains the draft. Unsupported custom serializers and dynamic branch changes require correction/re-export. Character reference slots can use assigned cast. Original graphs and old attempts remain immutable.

Connections support multiple ComfyUI, RunningHub and private-relay records. Google, DeepSeek and OpenRouter prompt assistance is optional. Enter secrets through secure app controls; credentials are stored in the macOS Keychain. fal/custom generation endpoints currently have configuration UI only.

Job receipts and results persist. Ambiguous submissions become unknown rather than being retried blindly. The relay exposes replayable SSE; the desktop currently polls. Native Dock progress and system notifications accompany in-app notification/log histories.

## Jobs: exact inputs and batches

Create or open a named batch in **Generate**; workflow/keyframe entry points open the same editor. Add, duplicate, remove and reorder independent workflow items. Each chooses a saved node and the workflow’s reusable inputs. Exact overrides preserve empty strings, zero, false and parsed JSON; absent prompt overrides use composed storyboard text. The gallery supports searchable tiles, selected/used markers and direct asset reuse. **Jobs** shows queued work/history and opens Edit/Reuse in Generate.

**Review exact inputs** validates the entire batch before uploads. Preview shows media hashes; final staged graph/payload is stored in the attempt receipt. **Add to queue** freezes idle work; **Run now** freezes and starts. Save queue changes atomically replaces only unstarted attempts, retaining canceled originals. There is no chained output dependency.

Items sharing a normalized ComfyUI endpoint queue in FIFO order, including duplicate connection records. Different endpoints run concurrently. Private relay connections use the relay URL and worker node ID as their lane; use one connection per RunPod GPU worker. RunningHub uses each account’s configured concurrency. Different URL aliases for the same server cannot be automatically identified.

Pause affects waiting items; cancel also requests cancellation of active work. Reopened unsent items are paused until **Resume waiting**. Unknown submissions block their lane until reconciled; other instances continue. The Runs history and Renders provenance retain run/item IDs and exact snapshots.

The schema v4 upgrade creates SQLite/manifest backups under the package’s `backups/` directory. Keep a complete copy of the original package if you need to continue using an older app.

![Jobs queue/history, fixture UI](docs/screenshots/jobs-queue-edit.png)

## Private RunPod ComfyUI

Use the [RunPod agent guide](deploy/runpod/README.md) to deploy the CI-built Linux x86_64/ARM64 agent beside private ComfyUI. It connects outbound to an authenticated HTTPS relay; no public ComfyUI port is required. CI packages the real ELF agent, setup guide, metadata and SHA-256 checksums. The archive includes runtime and workflow compiler helpers. Managed initialization supports reviewed hash-pinned models/plugins/wheels and private transfer manifests; live installation and the private RunPod/S3/GPU roundtrip remain pending.

## RunningHub: create a job

1. Add a RunningHub account in **Connections** and save its key with the secure credential control.
2. Import the API workflow once in **Workflows**, then reuse it from the catalogue. In **RunningHub deployments**, select the account, API family (**Workflow** or **AI App**) and the hosted ID for that exact deployment. An imported JSON graph does not contain proof of a hosted deployment; do not substitute an unrelated AI App ID. An account default is optional.
3. Configure **Reusable inputs** with node IDs, field names and value types from that deployment’s API schema. Character reference slots use the assigned scene/frame cast.
4. Choose **Target keyframe**, click **Create generation job**, then select the account, review the values and **Review exact inputs** → **Add to queue / Run now**. Missing setup is explained in the dialog.

Provider rejections are shown as failed jobs. For an uncertain submission, check RunningHub task history and use **Resolve submission** to attach the existing task ID or confirm that no task was created before retrying. Account/deployment destinations stay frozen in the job receipt.

The UI and provider contracts were tested with fixtures; a paid RunningHub generation has not been verified. The supplied [Workflow page](https://www.runninghub.ai/workflow/2110044532631932930) identifies **Workflow** API ID `2110044532631932930`. The user confirmed that this ID matches the supplied LTX API JSON; public graph details were not independently verified. Its string bindings are `positivePrompt → 121.text`, `negativePrompt → 110.text` and `image → 167.image`. Assign an image to the target keyframe before submission; a missing image is rejected by the native command.

![Installed 0.1.2 workflow job controls, using a temporary example movie](docs/screenshots/workflow-job-0.1.2.png)

## CI artifacts and notebooks

[Build and release guide](docs/CI_RELEASES.md) covers `.gitlab-ci.yml`, GitHub Actions, macOS ARM/Intel DMGs, Windows x64 MSI/EXE installers, Linux desktop packages, and the Linux x86_64/ARM64 ComfyUI client. Version tags must match the application version and publish checksums. Successful tags publish complete GitHub prereleases after all native builds pass. The current remote is GitHub; GitLab needs a project and eligible macOS runner.

Generated [Colab](deploy/colab) and [Kaggle](deploy/kaggle) notebooks deploy the verified client artifact beside an existing ComfyUI installation. Kaggle supports two independent GPU workers with separate ports/node IDs. Live notebook deployment requires an authenticated relay and a permitted active runtime.

## Development

Requirements: Apple Silicon macOS 13 or newer, Xcode Command Line Tools, Rust and Node.js/npm.

```sh
npm ci
npm run tauri:dev
```

Build an unsigned development application:

```sh
npm run tauri:build -- --debug --bundles app
```

Output: `target/debug/bundle/macos/MyMovie Studio.app`. Browser preview (`npm run dev`) uses temporary in-memory state; use the native app for file/package acceptance.

```sh
npm run typecheck
npm test -- --maxWorkers=1
cargo test --workspace
```

## Local CPU execution

```sh
docker compose -f deploy/cpu/compose.yaml up -d --build
python3 scripts/cpu-smoke.py
```

Keep the OrbStack/Docker engine running; the OrbStack window may be closed. The weight-free CPU canary verified ComfyUI health, submission, history and result download. It does not validate the supplied GPU video workflows.

## Current limits

This is a development foundation. Live RunningHub generation, private relay/S3/RunPod roundtrip, live notebook deployment, signing/notarization and complete Finder-drop acceptance remain pending. The published 0.1.6 release passed all five native desktop and four Mac/Linux agent builds; all 34 public downloads passed independent checksum, format and architecture verification. [Publication evidence](docs/CI_RELEASES.md) records the exact source and successful hosted run. Desktop runtime checks on Windows and Linux remain pending. Browser profiles, remote LoRA training and the complete FFmpeg derivative pipeline are later milestones. No paid generation or cloud rental was performed during validation.

See [architecture](docs/ARCHITECTURE_INDEX.md), [contracts](docs/API_CONTRACTS.md) and [test evidence](docs/TASK_LOG.md). Agents should read the six compact context documents before targeted source inspection. Keep `drafts/`, secrets and personal movie packages out of Git.

## License

Apache-2.0 OR MIT; see [Apache license](LICENSE-APACHE) and [MIT license](LICENSE-MIT).

Bundled font licenses: [Manrope](docs/licenses/Manrope-OFL.txt), [IBM Plex Mono](docs/licenses/IBM-Plex-Mono-OFL.txt).
