# Reference prototype UI audit — 2026-10-14

Source: [Foamy Scene Craft Studio](https://foamy-scene-craft-studio.base44.app).
Method: interactive Playwright MCP inspection of all twelve sidebar destinations,
including modal pickers, text entry, selection, keyboard focus, drag/drop,
storyboard reordering and three window sizes.

This records the hosted design reference. It is **not** a new acceptance test or
bug list for the native app. Compare each proposed change with existing native
implementation before changing code.

## Evidence and limits

- 59 recorded tool-result batches; 301 state/inventory records, including 220
  completed actions that compared visible text/form state. Counts include repeated
  navigation and do not mean 220 unique controls.
- Raw records: [interaction-states.json](../artifacts/ui-audit-2026-10-14/interaction-states.json).
- Root inventories: [root-inventory.json](../artifacts/ui-audit-2026-10-14/root-inventory.json).
- Fourteen screenshots and browser snapshots:
  [browser-output](../artifacts/ui-audit-2026-10-14/browser-output).
- Viewports: 1440×1000, 1280×720 and 1024×600. Welcome's inner content scroll was
  verified at the smallest size.
- Successful transitions, no visible response, unverified external effect,
  blocked actions and selector failures are different outcomes. Raw
  `changed:false` measures text/forms only; resize/reorder also need geometry/DOM.
- Fifteen recorded locator/action errors include ambiguous selectors, a stale
  episode name and clicks blocked by a modal/hosting badge. These errors alone
  are not application defects; corrected interactions are described below.
- Console capture reported no errors or warnings. Network URL/status capture
  showed hosting analytics/settings/page logging, not an accepted generation or
  provisioning run. No request headers or credential bodies were collected.
- Automatic approval review initially blocked Run selected (potential paid
  compute) and Remove draft (potential saved-data deletion). The user subsequently
  authorized creating/deleting temporary test items, with **no generation**.
- A temporary keyframe/comment was created, edited and deleted successfully.
  Cleanup verified ten original frames and no temporary comment text. New
  generation did not create a temporary draft, so the existing sample draft was
  not deleted.
- Existing movie/media/history deletion, notification/log clearing, connection
  saves, dependency installation, bulk initialization and S3 transfer remain
  unexecuted. Clipboard/download success was not verified independently.
- Prototype baseline was restored by reload. Browser left on Workflows.
  Evidence is ignored local output; this report is the durable repository memory.

## Tab coverage and observed states

| ID / tab | Tested behavior | Observed gap / boundary |
| --- | --- | --- |
| K / Keyframes | All ten original cards select their inspector. Six ratio buttons change selection. Prompt edits update card text. Cast modal toggles/Done works. Search/episode chooser and Scene form open. Keyboard drag reorders cards. Temporary comment add/edit/save/cancel/delete and temporary frame deletion work. | File drop on an existing frame is rejected. Empty Storm episode retains Pilot inspector. Empty-episode New keyframe/Import frames have no visible response. New episode creates Untitled Episode immediately. No clear inspector-selection/movie rename action identified. |
| C / Characters | All three cards and New character clicked; character card file drop tested. | Cards open the frame-cast assignment modal instead of a character editor. New character has no visible response; drop is rejected. Reference import, revision editing and usage navigation not reachable. |
| L / Library | Import asset, all eight media tiles and a safe PNG drop tested. | No file chooser/import response; drop rejected. Tiles have no visible detail/action response. Media are gradient placeholders, with no image/video/audio elements. Search, removal, usage and copy/link policy UI not reachable. |
| W / Workflows | All four cards inspected; runner/scope/search pickers, hardware compatibility and Apple/CUDA variant choices tested. Setup instructions, dependency action, Use workflow and copy/export controls inspected. | No usable graph importer, wrapper input/output editor or illustrated collection editor found. Variant selection updates labels but leaves some metadata/requirements unchanged. Use workflow/catalogue/dependency action has no visible response on unobstructed retry. Copy/export effects unverified. |
| G / Generate | Saved workflow picker search/no-match/select, runner selection and name editing work. New generation, Duplicate, Add to batch, configuration/preparation/context and Add to queue clicked. | These action buttons have no visible response. Changing workflow title leaves the same single image input. No working media slot selector or second face image. Movie ratio is readonly text. No temporary new draft available to test Remove draft safely. Run selected unexecuted. |
| J / Jobs | Four row checkboxes select/deselect and update count. New job, Saved drafts and all four Reuse as draft controls clicked. | Draft/reuse actions have no visible response. No usable queued-job editing, collapse, reroute or select-all found. Failed receipts are labelled finished. Actual dispatch/FIFO/parallel behavior untested; explanatory text is not evidence of execution. |
| R / Renders | All three Save to Library controls and representative cards clicked. | No visible save/detail/compare response. No reachable removal/output routing/shared-library synchronization. File results and receipts not validated. |
| N / Connections | All connection filters; both local and CPU Check/Edit; type/category selectors tested. | Check/Add connection/Colab-Kaggle have no visible response on corrected attempts. ComfyUI editors show the wrong provider type/category initially. Selecting ComfyUI does not update the type form; category selection does update. No SSH/script/tunnel connection setup reachable. Save/Remove existing connections unexecuted. |
| S / Settings | App Runner, S3 Storage, RunPod and Comfy Nodes tabs; Verify clicked. | Most configuration is static text. Verify has no visible response. No complete initialization script/session marker UI. Initialize/sync/bulk operations unexecuted. CPU URL differs between Connections (8188) and Settings (8189). |
| T / Notifications | Navigation and notification/icon inventory inspected. | Dismiss icons lack accessible names. Clear/dismiss of existing items unexecuted; no temporary notification creation path found. Empty growl region does not validate transient-notification behavior. |
| O / Logs | Navigation and six-event list inspected; row click tested. | No visible row details, filter/search/export. Existing-history clearing unexecuted. |
| H / Welcome | Open .mymovie, New movie and both recent rows clicked; responsive scroll tested. | Open/create/recent controls have no visible response. Clear-recent not present. Header Back has no visible response; sidebar Welcome navigation works. Recent content **is scrollable** in the inner pane at 1024×600. |

## Reproduction details that matter for implementation

### Workflow selection must rebuild the form

G1: Generate starts with one saved cartoon-workflow draft and a single
`input_image / LoadImage / 12.image / string` row.
Selecting Redux or Apple Klein changes the workflow label, but this row remains.
Runner selection changes its label while the adjacent hardware summary continues
to show the same M3 Max/MPS memory and fingerprint.

Expected: selecting a saved wrapper/variant builds slots from that version's
bindings. Compatible values may carry forward; incompatible values must be
cleared or shown as unresolved. Hardware and preparation status belong to the
selected node/session. Face swap needs two independently labelled image slots;
the designer controls their semantic names and exact node bindings.

### Workflow modal / setup

W1: four wrappers: LTX (46 nodes / 3 bindings), Klein (29 / 0),
Redux (49 / 2), cartoon (31 / 1). Each detail opens.
Apple versus CUDA selection changes OS/backend/variant status labels;
precision remains a dash in the tested Klein state. Requirements/description
do not visibly become a complete alternate installation plan.

W2: compatibility picker changes its label. All/Compatible-only picker can be
selected, but the same four cards remain; meaningful filtering is unverified.

W3: portable instruction modal supplies a short command outline, rather than
a complete bootstrap for downloads, plugin pins, workflow registration,
HTTPS access and a successful-session marker.

Expected: preserve original editor JSON, declare target variants separately,
discover inputs against the node registry, expose optional image/video/audio/
text slots, bind outputs, and show dependency sources/destinations. Never treat
an arbitrary editor graph as automatically executable API JSON.

### Connection editor

N1: local and CPU Edit correctly populate their respective name/URL fields,
but open with an unrelated provider/AI-app type. Selecting the ComfyUI option
does not change the editor's form. The API-category selector does change.

Expected: connection identity, backend type and hardware inventory must agree.
Show Local, SSH, public HTTPS and outbound-agent connection methods where
implemented. An unimplemented option needs a clear disabled explanation.

### Storyboard editing and media

K1: Space → ArrowRight → Space on the first drag handle moves its card after
the second, with live announcements. Reload restored the baseline ordering.
Do not infer broken reordering from the absence of HTML `draggable=true`.

K2: all six ratio options (9:16, 16:9, 1:1, 3:4, 4:3, 21:9) work on a
selected frame. Generate's movie ratio remains readonly.

K3: comment Edit exposes a textarea and unnamed Cancel/Save icon buttons.
Those buttons work. Escape does not cancel the inline editor.

K4: add/delete a temporary frame works; deletion clears the inspector.
Storm's empty state, however, leaves a previously selected Pilot frame visible.

L1/C1/K5: safe PNG drops on Library, a character card and an existing frame
were rejected (no accepting drag-over handler). The new-frame drop attempt had
a selector failure and remains unverified.

Expected: one asset picker/import implementation, asset-ID reuse, accepted
drop targets with hover feedback, and optional copy/link import policy.
Selecting an empty episode clears the old frame inspector.

### Modal, queue and small-window behavior

M1: generic modal containers have no dialog role/aria-modal. Tab can move to
background controls. Closing a modal leaves focus on BODY rather than its opener.
Escape in a nested picker can close the entire parent; reopening can retain
stale child state. Copy into movie does open a separate modal (an early
main-only snapshot missed it); destinations were inspected without copying.

M2: the workflow modal's lower actions initially sit below a 720px viewport;
keyboard movement scrolls them into view. They are not proven unreachable.
Use a bounded scrolling body and persistent action footer.

Q1: bottom queue collapse/expand works once the hosting badge is dismissed.
The hosting edit badge can intercept the toggle; this is a prototype-hosting
issue, not evidence of the native app's queue behavior.

Q2: moving the divider up approximately 80px reduced expanded queue height
from approximately 190px to 107px, opposite the expected expansion direction.
Dragging while collapsed can leave the later expanded queue cramped.
Refresh has no visible response. Existing queue cleanup was not executed.

H1: Welcome's inner pane scrolls at 1024×600; measuring only main would give
the wrong conclusion. Sidebar footer overflow at this size needs follow-up.

## Prioritized improvement memory

| Priority | Goal | Acceptance state |
| --- | --- | --- |
| P0 | One reusable workflow definition | Import editor JSON, choose platform variant, discover registry inputs, map typed optional slots and output nodes once; save/export/import wrapper with README/dependency manifest. Unsupported conversions explain the blocking node. |
| P0 | Honest preparation / initialization | Connection-specific inventory; complete reviewed script with source URLs/S3 paths, hashes, plugin revisions and exact model folders. Mark ready only after validation/canary success. |
| P0 | Usable media inputs | Gallery/search/import/drop fills each semantic slot. Library assets reused by ID. Two face-swap inputs remain distinct and previewed. Unbound required input blocks queueing with a useful message. |
| P0 | Separate draft, queue and run | Generate builds a compact draft and adds to queue without execution. Jobs edits/reuses/reroutes idle jobs and runs only checked entries. Backend enforces same-node capacity and cross-node concurrency. |
| P1 | Trustworthy state | Failed/finished status agrees with receipts. Registry/preparation changes preserve draft values while explaining unresolved bindings. Reopening a project retains validated configuration. |
| P1 | Unified media/results | Successful outputs become render-tagged Library assets. Output configuration names selected sinks, destination and preview behavior. Trash/restore and usage navigation preserve references. |
| P1 | Modal and responsive controls | Shared accessible modal primitives; focus trap/return; nested Escape closes only the child; sticky footer; named icon controls, larger hit areas and rem spacing/fonts. |
| P1 | Project/storyboard coherence | Working open/new/return/clear-recents, rename movie/episode, clear selection, empty-episode intro, frame image import and character reference/usage filters. |
| P1 | Node setup that can be repeated safely | SSH/script notebook panel with copyable full commands and where HTTPS address comes from. Run once after requirements change or on a new session; explicit Repair/Recheck. |
| P2 | Supporting polish | Illustrated workflow collections, genuine media thumbnails, ellipsis plus full-name tooltip, clearable notifications/logs, corrected queue divider and informative empty states. |

Proposed responsibility flow:
`Workflows: define once → Generate: fill slots → Jobs: edit/select/run → Library: results`.
Connections owns node identity/setup; Settings owns shared defaults.
This is a design recommendation, not a new approved implementation plan.

## Initialization marker design requirement

Do not use a single eternal “installed” file. Store a successful marker keyed by
node/session identity, variant ID, graph/dependency manifest digest and relevant
runtime registry version. Recheck model/plugin availability before trusting it.
Write the marker atomically only after installs and a lightweight canary pass.
A new session, changed requirements or missing file returns to Needs setup.
Show last verification and provide explicit Recheck/Repair actions.

Preserve the user's latest scope: ComfyUI local/remote is the execution target;
deprecated hosted-provider controls/copy must be omitted from future designs.
Raw browser evidence retains observed labels as evidence only.
