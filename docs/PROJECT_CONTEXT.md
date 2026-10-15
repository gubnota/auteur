# Project Context

## Identity
- Product: MyMovie Studio; repository: auteur.
- Remote: https://github.com/gubnota/auteur.git.
- Purpose: local-first macOS film planning and AI media execution.
- Users: creators organizing episodes, scenes, shots and shared references.
- License: Apache-2.0 OR MIT; original license texts retained.

## Current milestone
- Approved global Studio plan: docs/GLOBAL_STUDIO_PLAN.md, 2026-10-15. Continue on main.
- Current source: 0.1.21. No Movie required for workflows, generation, jobs, media, instances, search or settings.
- App workspace SQLite owns global assets/workflows/drafts/history; Movies retain scenes/cast and reference shared media.
- Migration is journaled by Movie identity/revision and receipt hash; historical pending jobs are quarantined, never resubmitted.
- Opening/closing Movies leaves global dispatch, initialization and terminal sessions intact.
- Immutable built-in examples: connection canary, SD1.5, tiny background removal, FLUX.3 T2I and two-reference I2I.
- Each FLUX family bundles T4/RTX/Apple Silicon original graph variants, pins, scripts, guide and reference illustrations.
- Portable bounded ZIP .mymovie-workflow; legacy JSON import retained; no credentials or installations exported.
- Managed local supervisor, private opted-in PTY, idempotent recipe steps, telemetry, global Activity/cancellation and search implemented.
- Current runtime features require matching agent/relay/helper builds; old releases do not acquire source changes automatically.
- Installed app and verification evidence: latest TASK_LOG entry. Native signing is local ad-hoc.
- Public node test tokens bypass Keychain; passive background work never unlocks uncached private credentials. Explicit Check unlocks a private connection for the session.
- Settings > Model downloads stores HF_TOKEN in the vault only through explicit actions; installation uses a one-use in-memory private relay handoff. Node-local HF credentials remain supported.
- Install on instance opens Dependencies; graph-only publication is separately named. Owned workflows expose Inputs/Outputs/Dependencies/Guide; examples stay read-only.
- Pending: live FLUX/cloud GPU generation, Finder Quick Look extension, native SSH transport and Telegram delivery.
- Original design exports remain ignored in drafts/.

## Implemented stack
- React 19, strict TypeScript, Vite and Tauri 2.
- Rust 2024 workspace, Tokio and reqwest.
- SQLite through rusqlite, WAL and package file lock.
- serde contracts, native macOS Keychain through keyring.
- Rem-based CSS, Fenki palette, lucide controls and original SVG app symbol.
- Custom modal pickers, editable forms and keyboard reorder controls.
- Shared domain DTOs live in studio-contracts; TS mirrors are manual.
- Radix/Tailwind/Zustand/Query/Zod requested stack is not fully adopted.
- Bounded background FFmpeg video posters implemented; other derivatives remain future work.

## Package and media
- Finder extension: .mymovie; macOS document association and package metadata.
- SQLite is authoritative; JSON projections are recoverable, revisioned exports.
- Stable UUID entity identity; imported originals and workflow graphs immutable.
- Default imports copy into media/originals/<SHA-256>.<extension>.
- Verified duplicates reuse their UUID before copying and preserve link policy; Collect alone consolidates existing links.
- Library/Renders share assets, Render provenance and recoverable Trash/Restore; originals and receipts remain intact.
- Explicit Keep original location records an absolute external sourcePath.
- Internal asset IDs and reserved relative paths remain stable for linked assets.
- Library shows linked paths and availability, with Check files and Relink.
- Collect for export copies all linked media into the current package.
- Collect verifies hash/size; changed or missing originals fail safely.
- Relink requires the exact original hash/size, preserving assignments.
- Collect is consolidation, not a separate ZIP/export-copy wizard.
- Close a collected movie before copying the package to another machine.
- Supported materials: allowlisted images, video, audio and safetensors LoRAs.
- Workflow packages import globally; Movies retain portable pins/references when used.

## Board and characters
- Ordered episode/scene/shot lanes, editable names and empty-episode screen.
- Prompts/comments/aspect ratios and frame/scene character assignments persist.
- Native drop routing targets Library, characters, frames, shots and scenes.
- Multi-image scene/shot imports create ordered frames; existing frame accepts one.
- Character reference picker imports multiple images and deduplicates them.
- Scene characters are inherited by every frame; frame cast adds to that set.
- Workflow characterReference1..4 slots resolve only assigned character images.
- References upload only when an explicit provider job is submitted.
- Job snapshots freeze scene, cast, references, bindings and graph.
- Frame sort uses pointer handling plus explicit keyboard-accessible move buttons.

## Connections and jobs
- One Connections route for ComfyUI, private relay and optional prompt/configuration APIs.
- Multiple connection/account records; custom secrets stay in Keychain. Settings → Node access and the notebook connection dialog share editable defaults.
- Public test pair: deploy/node-auth.defaults.json, intentionally embedded in notebooks/UI; custom pairs stay out of movie/settings files.
- Colab/Kaggle can host their own bundled relay and cloudflared tunnel on a custom port; temporary addresses use explicit REST polling mode. Live cloud acceptance remains open.
- Execution adapters: ComfyUI and private relay; retired destinations remain archived and disabled.
- Google, DeepSeek and OpenRouter optional prompt assistance implemented.
- fal/custom API generation adapters remain configuration-only.
- Prepared graphs expose registry-derived literal inputs; explicit aliases/media roles remain editable. No guessed graph IDs.
- Workflow editor separates Inputs, Outputs, Setup and Guide; metadata never rewrites original graphs.
- Provider rejections become failed; ambiguous submissions require history reconciliation.
- Durable jobs/receipts/results; unknown submission blocks blind retry.
- ComfyUI URL FIFO (one active); relay URL + node FIFO/capacity; distinct lanes run concurrently.
- Saved independent batches, exact typed inputs and frozen run/item provenance.
- Add to queue freezes idle work; explicit start required, including after reopening.
- Queued edits replace unstarted batches or selected tasks atomically; original receipts remain canceled.
- Bottom Clear finished hides completed/failed/canceled rows; monotonic settings merges prevent stale refreshes or saves restoring them. History/results remain intact.
- v1–v4→v5 requires explicit backup/upgrade; SQLite and manifest backups retained.
- Reopening unsent work pauses it; unknown submissions keep their lane occupied.
- Desktop polls providers; relay offers authenticated replayable SSE.
- Desktop SSE consumption and result-handoff chains remain open.
- Native Dock active-job badge and terminal system notifications implemented.
- Notifications and Logs histories have clear controls.

## Generate and setup
- Generate is the single Custom input editor for standalone/storyboard jobs; Jobs owns queue/history and opens edits/reuse in Generate.
- Workflows → Inputs saves exact literal bindings, labels/media roles and advanced/hidden choices once; prepared profiles override by node/input identity.
- Searchable thumbnail gallery assigns asset IDs; external job-slot imports return exact IDs atomically.
- Legacy/changed ComfyUI forms refresh before a new preview/freeze; historical snapshots and the final dispatch guard remain intact.
- Explicit media slots accept arbitrary image/video/audio roles and order; frame/cast contexts remain available.
- Saved batches reuse Jobs endpoint lanes; compatibility is declared, not inferred.
- Flags: unspecified, universal, Apple Silicon, CUDA, ROCm, CPU; providers validate live hardware where available. Separate OS/architecture/precision variants group into reusable families.
- Complete script modal covers Mac/Linux/SSH/Colab/Kaggle; reviewed dependency setup accepts pending editor sources before preparation.
- Guide supports safe Markdown/embedded raster illustrations; portable collections strip destination profiles and private vault references.
- Workflows always offers three Example cards: weight-free connection test, SD 1.5 T4 and tiny background removal. Movie copies keep stable IDs and remain editable.
- The workflow modal selects one instance for installation/preparation/setup. Guided setup reviews exact downloads once, then installs, restarts only managed idle workers, prepares/publishes original editor JSON and checks readiness. Selection stays locked during operations.
- Setup instructions: docs/WORKFLOW_EXAMPLES.md and docs/WORKFLOW_SETUP.md.
- Local real Rust pipeline acceptance: docs/GENERATION_ACCEPTANCE.md.

## Private runner and storage
- RunPod ComfyUI is the primary execution target; Colab first for live cloud acceptance.
- Authenticated node-scoped relay and outbound Linux/macOS x86_64/ARM64 agents are initial implementations.
- Tag-only CI publishes checksummed ELF agent archive and deploy/runpod/README.md; no public pod IP needed.
- Notebook DEVICE=auto uses available CUDA workers or one --cpu worker; cpu/cuda overrides supported. Skipped bootstrap helpers restore from bundled source. Independent Kaggle workers isolate GPU/port/node identity; live deployment pending.
- Agent exposes typed doctor/inventory/drain/bootstrap/provision operations.
- Generation receipts precede ComfyUI submission; stale leases become unknown.
- Storage transfer manifests support hash/size verification and resumed download.
- Storage manifest URL lives in Keychain, outside project settings.
- Runtime plans require pinned image and authorized artifact metadata.
- Managed workers install reviewed hash-pinned models/plugins/offline wheels; restart and current-session canary gate readiness.
- Relay/S3/GPU roundtrip and live RunPod acceptance remain pending.
- Do not present the private runner as production hardened.

## Hard constraints
- No credentials/private sessions/drafts in source, projects or diagnostics.
- Conversation credentials were not used; use secure Settings entry instead.
- Remote upload occurs only upon deliberate submission or sync.
- No public unauthenticated ComfyUI exposure. Private PTY/scripts require explicit agent opt-in.
- Reference repositories stay read-only.
- No fabricated ownership, node availability, model origins or prices.
- No paid resources used. Authorized safe local MPS FaceSwap and weight-free mask execution passed; cloud acceptance remains pending.
- Path traversal and package symlinks rejected; originals hash deduplicated.

## Validation and pending delivery
- Rust workspace tests and frontend typecheck/tests are the primary checks.
- Native linked-reference/collect screenshots: docs/screenshots/.
- Latest exact check evidence and gaps: docs/TASK_LOG.md.
- OrbStack engine must run for Docker; its GUI window may be closed.
- LTX/MINIMAX graphs were inspected, not GPU-executed.
- LTX prompt/image bindings and account deployment saved through native UI; live acceptance pending.
- LTX image input requires an assigned frame image; AI App schema and RunPod choices remain open.
- GitLab/GitHub CI configure native packages, Linux client and version-tag release artifacts.
- Active agents: Linux x86_64 and macOS Apple Silicon, both with relay. macOS Intel desktop/agent and Ubuntu ARM64 agent entries are commented out; GitHub Linux ARM64 desktop remains active (GitLab entry was already disabled).
- Published 0.1.6: macOS ARM/Intel, Windows x64, Linux x86_64/ARM64 desktops; four Mac/Linux agents and notebooks.
- All nine native builds and automatic publication passed in hosted run 38557508498.
- All 34 public assets anonymously downloaded and checksum/format/architecture verified; evidence: CI_RELEASES.md.
- Tags publish complete GitHub prereleases after checks/builds; published assets are protected against rerun overwrite.
- GitLab execution, signing/notarization and full access audit remain open.
- Browser profiles, remote training and Homer interoperability are later work.

## Agent workflow
- Read the six compact memory files before targeted source inspection.
- Navigate using ARCHITECTURE_INDEX; respect MODULE_OWNERSHIP.
- Keep verified implementation separate from proposed roadmap.
- Update contracts, decisions and task evidence with each tested increment.
- Make small commits; review staging for drafts, secrets and generated output.
- Push authorized tested work without force.

## Workflow catalogue milestone
- Approved scope: docs/WORKFLOW_CATALOGUE_PLAN.md.
- Immutable application catalogue; Movies reference portable versions. Global drafts remember targets/layouts.
- Original editor JSON retained; selected frontend exports API in an isolated compiler context.
- Compiler requires Python/Playwright/Chromium; instructions: docs/WORKFLOW_SETUP.md.
- Target profiles carry source/API/registry/frontend hashes; dispatch checks current registry.
- Two-image FaceSwap editor conversion and local weighted pipeline verified; cloud acceptance remains open.
