# Implementation Plan: authenticated model setup and workflow authoring

Status: Approved and implemented, 2026-10-16. Extends the approved GLOBAL_STUDIO_PLAN.md.

## Goal

Configure HF_TOKEN in global Settings, install a selected workflow and its
dependencies on a selected agent node without creating another catalogue entry,
and make dependency and input/output authoring discoverable.

## Existing behavior

- Settings is implemented in features/Connections.tsx. Native credentials use
  the system vault; connections and non-secret preferences use app persistence.
- Agent provision.rs reads HF_TOKEN/HF_TOKEN_PATH/HF_HOME only on the node.
  storage-s3 restricts HF authorization to its permitted origin.
- WorkflowTarget's Install in ComfyUI calls install_workflow: this publishes the
  editor graph but does not perform reviewed dependency initialization.
- AgentWorkflowSetup separately handles reviewed, durable initialization.
- WorkflowEditor returns early for examples, hiding Inputs/Outputs/Setup.
  Editable workflows already have WorkflowForm and WorkflowSetup components.
- pin_workflow preserves an existing workflow identity. Installation itself
  must never invoke duplication; trace the reported extra entry through UI
  callbacks and receipt application before changing persistence.

## Proposed approach

- Add Settings > Model downloads: masked HF_TOKEN, Save/Replace/Remove and
  configured status. Do not read a saved token into the frontend on startup.
  No sample HF token. Unlock the vault only during explicit credential actions
  or an explicitly requested installation that needs HF authentication.
- Deliver credentials separately from durable command payloads, workflow
  packages, reports, search, logs and events. Use an authenticated node-scoped,
  short-lived, bounded in-memory relay handoff with one-time agent retrieval;
  expire/delete on consumption, cancellation or timeout. HTTPS required outside
  loopback. Unsupported older agents get explicit upgrade guidance.
- Retain node-local HF credentials as fallback. Apply the token only to HF
  requests, never to redirects to another origin or arbitrary plugin URLs.
  Return actionable missing-token/access-denied messages with the model page.
- One primary Install on instance action opens the existing dependency review
  and starts the durable agent initializer, then publishes/prepares the graph.
  Direct connections explain how to connect an agent. Keep graph-only publishing
  separately named. Repeated installation reuses workflow identity and verified
  files; progress/cancel/reconnect remain in Activity.
- Keep built-in examples immutable. Show their inputs/outputs/dependencies
  read-only, with a clear Create editable copy action. Explicit duplication is
  the only path that creates a new editable identity.
- Give owned workflows visible Inputs, Outputs, Dependencies and Guide tabs.
  Dependency editor exposes source URL, relative category/path, integrity and
  plugin revision; existing validation remains authoritative.
- Expose actual literal input fields with readable labels/types, used-state,
  optional/media controls and named collected output sinks. Editor graphs need
  target preparation before registry-backed controls can be discovered. Never
  promise arbitrary linked intermediate nodes are editable literal inputs.

## File changes

- apps/desktop/src/features/Connections.tsx: add the Model downloads settings tab.
- apps/desktop/src/components/ModelDownloadSettings.tsx: new masked credential UI.
- apps/desktop/src-tauri/src/service/model_credentials.rs: new vault commands,
  configured status and installation credential resolution.
- apps/desktop/src-tauri/src/service.rs and main.rs: register credential commands.
- apps/desktop/src-tauri/src/service/initialization.rs: request-scoped handoff
  before starting initialization; preserve installation/workflow identities.
- crates/provider-relay/src/lib.rs and apps/relay/src/main.rs: authenticated
  ephemeral credential transport, node isolation and compatibility response.
- apps/agent/src/main.rs and provision.rs: consume credentials without persistent
  jobs/log exposure; feed only permitted authenticated downloads.
- apps/desktop/src/components/WorkflowTarget.tsx and AgentWorkflowSetup.tsx:
  unify install/review entry point and distinguish graph-only publishing.
- apps/desktop/src/components/WorkflowEditor.tsx, WorkflowForm.tsx and
  WorkflowSetup.tsx: visible authoring/read-only states and dependency controls.
- apps/desktop/src/features/Library.tsx and service/catalogue.rs: trace and fix
  install/copy state handling if the reported duplicate originates there.
- docs/API_CONTRACTS.md, PROJECT_CONTEXT.md, TASK_LOG.md and README EN/RU/FR:
  document the credential lifecycle and corrected installation/editing flow.

## Implementation steps

1. Add vault status/save/remove commands and Settings UI; verify empty/masked,
   replacement/removal and no unsolicited vault reads.
2. Add ephemeral credential delivery with expiry, consumption, node isolation,
   authenticated transport and secret-free status/report assertions.
3. Pass token to HF downloads; test HF authorization, cross-origin redirects,
   missing permission and node-local fallback without downloading model weights.
4. Route install through review/agent initialization; verify double-click/rerun,
   same catalogue count/IDs, selected target and visible durable progress.
5. Expose editor tabs and explicit example-copy behavior; test dependency edits,
   input binding selection/used states and saved output selection across reopen.
6. Run targeted Rust/frontend/browser tests, typecheck and production build;
   update EN/RU/FR docs and version parity. Build/sign/replace the local macOS
   app and capture the updated UI without exposing secrets.

## Verification

- bun run typecheck; bun run build; bun run test.
- Targeted Rust tests for relay credential lifecycle, native commands, agent
  download handling and workflow installation identity.
- Browser acceptance for token settings, dependency editing, input/output
  persistence, immutable examples and repeated installation without duplicates.
- Local agent canary where available; no gated weights or paid generation.

## Risks / edge cases

- HF_TOKEN authenticates an account; gated models still require access granted
  to that account. An app cannot bypass a provider's access refusal.
- New credential transport requires compatible desktop, relay and agent builds.
  Relay restart deliberately discards outstanding secrets; retry handoff safely.
- Preserve existing unrelated App.tsx work and all user workflows/media.

## Out of scope

Requesting model access on the user's behalf, paid generation, cloud provisioning,
changing existing workflow graphs or weakening immutable-example safeguards.

## Completion evidence

Implemented in 0.1.21. All 80 Rust, 63 Python and 28 frontend tests passed; twenty targeted browser scenarios covered (catalogue selector rerun passed). Native ARM64 build installed and verified at /Applications/MyMovie Studio.app. EN/RU/FR guides and screenshots updated. No material plan deviation; direct ComfyUI still needs an agent for dependency mutations. Live gated model/cloud acceptance is pending account access and a matching updated remote client. See TASK_LOG.md for scope and verification limits.
