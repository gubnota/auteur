# Base44 Design Handoff

Status: Supplied; design prerequisite fulfilled, implementation approval pending.
Product: MyMovie Studio, native macOS film-production workspace.
Visual reference: /Users/vm/Documents/petProjects/auteur/drafts/index.html.
Keep drafts untracked and unmodified. No additional Base44 exports required.

## Supplied export

- Bundled React/Tailwind single-file board, about 1 MB; not reusable source architecture.
- Sample movie Lighthouse Keeper, episodes Pilot/The Storm, character badges,
  scenes/shot lanes, right inspector and bottom queue.
- Source includes modal project/episode/search/scene and character pickers,
  some rename/edit/delete callbacks, empty-episode UI and six aspect presets.
- Browser security rejected the local-file preview. Audit was static; appearance
  and interactions have not been verified in a running browser or native app.
- Export's save timer and in-memory state must be replaced with durable commands.
- Tabs currently share the board; create/open/import have inert callbacks; a new
  episode lacks initial lanes; cross-lane move leaves shot reference stale.
- Queue drag delta is reversed; tiny hover-only controls need visible accessible
  actions. See docs/IMPLEMENTATION_PLAN.md for the full eleven-item mapping.

## Screen mapping

| View | Required content |
| --- | --- |
| Welcome | Open/create/recent .mymovie; native destination picker; portable sample. |
| Keyframes | Scene/shot lanes, modal search/scene/episode choices, editable names, first-frame intro, visible add/delete, editable prompts/comments/characters/ratio. |
| Characters | Shared character records, immutable revisions, references and retirement. |
| Library | Images/videos, import/filter/drag, metadata, missing links/consolidation. |
| Workflows | Real graph importer/bindings, versioning, deployment target, common prompt preview and validation. |
| Renders | Images/videos, frame association, provenance and variant review. |
| Servers/Nodes | Multiple ComfyUI connections/private agents, real health/capabilities, client help, initialization, Doctor, inventory, bulk profile plans and readiness. |
| Settings | Multiple RunningHub accounts, private S3/LoRA sync/transfers, FFmpeg, appearance and notifications. |
| Notifications | Dismissable toast history, read/dismiss/clear; native opt-in notifications. |
| Logs | Redacted diagnostics/filter/export/clear; durable job history remains intact. |

Bottom render queue is resizable/collapsible/expandable with correct pointer and
keyboard behavior. Each view uses one consistent shell and functional routing.
Sample project content is explicitly labelled; never fabricate connected health,
remote tasks, available models or costs.

## Fenki palette

| Token | Value | Role |
| --- | --- | --- |
| Ink | #171715 | Primary text |
| Paper | #f6f3eb | Main background |
| Elevated paper | #fffdf8 | Cards/inspector |
| Moss | #d7ff72 | Primary action/selected emphasis |
| Pale moss | #efffcf | Selected surface |
| Rust | #ffb38e | Warm accent |
| Blush | #b9adff | Character/tag accent |
| Sky | #9bdcff | Informational accent |
| Yellow | #ffe56d | Attention accent |

Verified from astrofenki/apps/web/app/globals.css. Deliberate readable dark tokens
and status text/icons accompany colors. Original film/node app icon uses coherent
brand colors and remains legible at small macOS sizes.

## Type, spacing and controls

- Locally bundled licensed Manrope and IBM Plex Mono; rem typography/spacing.
- Shared spacing: .25rem, .5rem, .75rem, 1rem, 1.5rem, 2rem.
- Consistent pane/card/form padding; readable secondary text and large targets.
- PickerDialog has large searchable rows for all selections; no browser select.
- Styled semantic input/textarea/checkbox/toggle controls retain accessibility.
- Focus trapping, Escape, visible focus/error/disabled states and reduced motion.
- Native macOS file-location/open dialogs satisfy document workflow requirements.
- Drag handles plus keyboard moves; actions remain reachable without hovering.
- Persistent saving/error feedback, transactional rollback and recoverable conflict.
- Project default and per-frame inherit/override ratios: 9:16,16:9,1:1,3:4,4:3,
  2:3,3:2,21:9 and validated custom ratio; no unvalidated pixel-dimension changes.

## Visual acceptance

Verify the implemented native app on a 14-inch MacBook layout and narrower window:
all routes, modal focus, empty/new episodes, queue resize, inspector editing, light
and dark contrast, high-DPI media and keyboard access. Capture safe actual native
screenshots for equivalent EN/RU/FR READMEs; prototype source inspection is not a
screenshot or runtime acceptance result.
