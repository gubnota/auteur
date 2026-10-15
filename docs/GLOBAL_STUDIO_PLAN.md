# Global Studio implementation plan

Status: Approved by the user on 2026-10-15 ("then go"). Supersedes the project-centric execution model; preserves agent/terminal/setup/monitoring/portable-wrapper requirements.

## Architectural acceptance rule

Opening or creating a Movie is never required for global functionality. Workflows, Generate, Jobs, Library, Renders, Instances, Search and Settings operate against app-owned persistence, without a Movie ID or directory. The complete shell is visible at startup; restore the last global route (default Workflows). No compulsory welcome/create modal.

Scenes, Characters, Locations, Storyboard/Timeline and Movie settings remain visible but inactive without a Movie, with an explanation and Create/Open actions. Closing/switching a Movie cannot stop global execution, initialization, polling, connections or terminal sessions.

## Ownership and contracts

- Application: immutable workflow graph versions plus editable designer wrappers; connections; node sessions; installations; drafts/jobs/history; content-addressed media and search index.
- Installation: workflow/version + logical connection + current node/session/runtime fingerprint; prepared API and readiness. Node restarts invalidate readiness, not workflow identity or history.
- Movie: scenes/cast/locations/storyboard and portable references/snapshots of global workflows, jobs and assets. Collect materializes linked originals for transport. Global resources survive Movie create/open/close/rename/delete.
- Migration: copy existing movie workflows/media/history idempotently into app persistence, journal identity/provenance, preserve original package and receipts. Do not submit historical or ambiguous jobs again.
- Library/Renders share one asset identity and recoverable deletion state. Attach existing results to multiple movies without unnecessary byte copies. Clearing queue/history does not delete results.

## Workflow package

- Permanent Use button for built-in immutable examples. Use opens the configured form; editable copies are explicit and independent from node installation.
- Named/grouped typed inputs bound to actual node fields, optional media where valid, image/video/audio slots, selected named outputs, help/illustration and architecture variants.
- Editable expandable/fullscreen initialization: Check/Install/Verify, timeout, relative working directory, recipe/session policy, predefined COMFYUI_DIR/COMFYUI_PYTHON/MODELS_DIR/CUSTOM_NODES_DIR/WORKFLOW_DIR/CACHE_DIR.
- Scripts are rechecked and idempotent; successful receipts include source/recipe/runtime identities. Preserve private-token and explicit script/PTY capability gates.
- ZIP .mymovie-workflow includes manifest, original graph, wrapper/variants, guide/previews; no credentials, node URLs, results or weight files. Keep legacy JSON import. Bounded extraction/hash validation. Finder thumbnail extension and installation verification.
- Different hardware may require distinct graphs, not only scripts or tags. One family can hold CPU/MPS/CUDA variants with explicit selection/compatibility reasons.

## UX and execution

- Jobs owns global Draft, Scheduled, Running, Done, Cancelled/Failed tabs; common list with node badges, filters, selection/select-all and bulk actions. Top node picker sets new-draft target; bulk reassignment only before submission.
- Explicit scheduling/start. One lane FIFO per actual endpoint; different nodes parallel. Pause dispatch before node-abort; cancel unsent deterministically and active owned tasks safely. Unknown submissions reconcile, never blind retry.
- Remove bottom Render Queue. Generate remains a compact workflow form shared with Create job, not another queue.
- Instances: Local Mac/Linux/OrbStack/RunPod/Colab/Kaggle/SSH presets, Initialize workflow action, capability-aware buttons/tooltips, node overview with terminal/logs/jobs/metrics/pings.
- PTY terminal emulator (history/tab/ANSI/paste/Ctrl+C/resize/fullscreen), global lifetime and reconnect. Agent outbound to relay; no agent listener. Local relay 127.0.0.1:8789 and ComfyUI 8191; reachable relay/tunnel/private network for NAT.
- Timestamped CPU/RAM/GPU samples, Apple unified memory labels, stale/offline indicators. Progress includes current stage and last three available log lines. Durable deduplicated completion notifications, future Telegram result-reference event contract.
- Global full-text modal search with filters/thumbnails/deep links; no secret indexing. Known projects only, no unsolicited filesystem scanning.
- Activity snaps to four draggable corners, persisted. SVG controls replace decorative Unicode. App chrome unselectable; editors remain editable and logs/help have Copy. Movie name editable without renaming package directory implicitly.

## Implementation sequence

1. Global store/contracts/migration and shell; separate Movie context from global workspace.
2. Independent workflow catalogue/installations, reusable forms and package authoring/export.
3. Agent local install/supervisor, checks, telemetry and terminal; node onboarding.
4. Global durable drafts/queue/results and safe cancellation; shared assets and movie attachment.
5. Search, overview, notifications, activity/layout, Finder previews.
6. Regression/acceptance tests, EN/RU/FR docs, version parity, build and replace local app on main.

## Required acceptance

- Fresh app with zero movies: all global routes/actions work, movie routes are inactive and explanatory.
- Launch → Workflows → Use → Select node → Configure → Generate → Jobs → Library without ever creating a Movie.
- Initialize workflows and browse queue/media with no movie; survive app restart and keep connections/history/results.
- Open/close/switch movies during generation, initialization and terminal activity without interrupting any global session.
- Create a Movie, attach existing global results; attach same asset to another Movie without duplicate storage; Collect preserves portability.
- Repeated migration/setup/package import, node session changes, queue status/bulk/cancel, output deletion and search/navigation are tested.
- Local agent end-to-end weight-free canary on MPS 8191, script checks/install/rechecks, terminal interactivity, live status/results; CPU/Linux tests where available.
- Targeted Rust/Python/frontend/browser tests, typecheck, production build, screenshot evidence. No paid cloud provisioning/generation or Telegram delivery.

## Material risks

Backups and provenance protect existing packages; app migration must be idempotent. Global resource ownership is authoritative, movie pins never mutate it. Cancellation is confirmed, not optimistic success. Managed restart requires a managed process; native SSH keys do not bypass NAT. Old agent versions need clear capability/upgrade guidance. Scripts may leave partial work on cancellation; rerun checks recover it. Signing/extension registration and unavailable live cloud sessions are reported accurately.

## Delivery status — 0.1.20

- Implemented: global store and migration journal, startup/navigation without a Movie, independent workflows/connections/drafts/jobs/media, compressed full architecture variants, FLUX family examples and shared sample assets.
- Implemented: local managed supervisor/agent installation guide, private interactive PTY, timestamped metrics, durable initialization/scripts/progress/cancel/reconnect, global queue/search/activity and notifications.
- Implemented: dependency source opening/editing and relative destination previews; direct preparation visibly distinguished from agent installation. Public defaults and passive polling do not prompt Keychain.
- Verified locally on an isolated MPS instance at 8193 (leaving user instances untouched): authenticated relay, telemetry, PTY resize/input/output, script initialization twice, readiness, weight-free generation and hash-verified PNG retrieval.
- Automated browser acceptance uses fixtures for global navigation, Movie switching, queues/media, examples/bundles and dependency editing. This does not establish live Colab/Kaggle/FLUX execution.
- Pending: Finder thumbnail/Quick Look extension, native SSH transport, Telegram delivery, real FLUX model and cloud GPU/S3 acceptance. Existing SSH preset documents agent/forwarding; it is not an SSH client implementation.
