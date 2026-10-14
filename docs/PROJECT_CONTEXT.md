# Project Context

## Identity
- Product: MyMovie Studio; repository: auteur.
- Remote: https://github.com/gubnota/auteur.git.
- Purpose: local-first macOS film planning and AI media execution.
- Users: creators organizing episodes, scenes, shots and shared references.
- License: Apache-2.0 OR MIT; original license texts retained.

## Current milestone
- Revised Phases 0–3 approved by user `go` on 2026-10-13.
- Native Generate/media setup implemented; live private cloud acceptance remains open.
- Version 0.1.6: reusable catalogue and target-specific compiler/forms implemented; publication evidence is in TASK_LOG.
- Installed release: see latest TASK_LOG entry; /Applications/MyMovie Studio.app uses a local ad-hoc signature.
- Cold Finder opening and warm saved-project opening verified; startup abort fixed.
- Real SQLite package persistence; browser preview is memory-only.
- Native picker import, linked character reference and collection verified.
- Weight-free local Docker ComfyUI HTTP/history/result canary passed.
- Automated Finder file-drop acceptance remains unverified.
- Full approval scope: docs/IMPLEMENTATION_PLAN.md.
- Design sources: ignored drafts/index.html, index-alt.html and studio.html.
- Export references are design data; drafts remain untracked and unmodified.

## Implemented stack
- React 19, strict TypeScript, Vite and Tauri 2.
- Rust 2024 workspace, Tokio and reqwest.
- SQLite through rusqlite, WAL and package file lock.
- serde contracts, native macOS Keychain through keyring.
- Rem-based CSS, Fenki palette, lucide controls and original SVG app symbol.
- Custom modal pickers, editable forms and keyboard reorder controls.
- Shared domain DTOs live in studio-contracts; TS mirrors are manual.
- Radix/Tailwind/Zustand/Query/Zod requested stack is not fully adopted.
- FFmpeg/FFprobe discovery exists; derivative pipeline remains future work.

## Package and media
- Finder extension: .mymovie; macOS document association and package metadata.
- SQLite is authoritative; JSON projections are recoverable, revisioned exports.
- Stable UUID entity identity; imported originals and workflow graphs immutable.
- Default imports copy into media/originals/<SHA-256>.<extension>.
- Explicit Keep original location records an absolute external sourcePath.
- Internal asset IDs and reserved relative paths remain stable for linked assets.
- Library shows linked paths and availability, with Check files and Relink.
- Collect for export copies all linked media into the current package.
- Collect verifies hash/size; changed or missing originals fail safely.
- Relink requires the exact original hash/size, preserving assignments.
- Collect is consolidation, not a separate ZIP/export-copy wizard.
- Close a collected movie before copying the package to another machine.
- Supported materials: allowlisted images, video, audio and safetensors LoRAs.
- Workflows import separately and are stored inside the document.

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
- One Connections route for typed ComfyUI, RunningHub, relay and other APIs.
- Multiple connection/account records; secrets stay in Keychain.
- Execution adapters: ComfyUI, RunningHub and private relay.
- Google, DeepSeek and OpenRouter optional prompt assistance implemented.
- fal/custom API generation adapters remain configuration-only.
- Prepared graphs expose registry-derived literal inputs; explicit aliases/media roles remain editable. No guessed graph IDs.
- Workflows expose keyframe job creation and per-account RunningHub deployment/family maps.
- Provider rejections become failed; ambiguous submissions require history reconciliation.
- Durable jobs/receipts/results; unknown submission blocks blind retry.
- ComfyUI URL FIFO (one active); relay URL + node FIFO/capacity; RunningHub account capacity.
- Saved independent batches, exact typed inputs and frozen run/item provenance.
- v1/v2/v3→v4 requires explicit backup/upgrade; SQLite and manifest backups retained.
- Reopening unsent work pauses it; unknown submissions keep their lane occupied.
- Desktop polls providers; relay offers authenticated replayable SSE.
- Desktop SSE consumption and result-handoff chains remain open.
- Native Dock active-job badge and terminal system notifications implemented.
- Notifications and Logs histories have clear controls.

## Generate and setup
- Standalone modes: image/video creation/editing, text/image/audio-to-video, multi-reference.
- Explicit media slots accept arbitrary image/video/audio roles and order; frame/cast contexts remain available.
- Saved batches reuse Jobs endpoint lanes; compatibility is declared, not inferred.
- Flags: unspecified, universal, Apple Silicon, CUDA, ROCm, CPU; providers validate live hardware where available.
- Setup instructions and artifact source/hash/size/license/category controls: docs/WORKFLOW_SETUP.md.
- Local real Rust pipeline acceptance: docs/GENERATION_ACCEPTANCE.md.

## Private runner and storage
- RunPod ComfyUI is the primary execution target; RunningHub is for workflow tests.
- Authenticated node-scoped relay and outbound Linux/macOS x86_64/ARM64 agents are initial implementations.
- CI publishes checksummed ELF agent archive and deploy/runpod/README.md; no public pod IP needed.
- Independent Kaggle workers isolate GPU/port/node identity; live deployment pending.
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
- No public unauthenticated ComfyUI exposure or arbitrary remote shell.
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
- User confirmed RunningHub Workflow 2110044532631932930 matches the supplied LTX API JSON.
- LTX prompt/image bindings and account deployment saved through native UI; live acceptance pending.
- LTX image input requires an assigned frame image; AI App schema and RunPod choices remain open.
- GitLab/GitHub CI configure native packages, Linux client and version-tag release artifacts.
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
- Immutable local catalogue; each movie pins portable versions and remembers targets/layouts.
- Original editor JSON retained; selected frontend exports API in an isolated compiler context.
- Compiler requires Python/Playwright/Chromium; instructions: docs/WORKFLOW_SETUP.md.
- Target profiles carry source/API/registry/frontend hashes; dispatch checks current registry.
- Two-image FaceSwap editor conversion and local weighted pipeline verified; cloud acceptance remains open.
