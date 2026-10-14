# Designer workflow wrappers — 0.1.12

A wrapper presents an imported ComfyUI graph as a reusable form with an illustrated guide. It changes presentation, bindings and result collection; the source JSON and its immutable hash remain intact.

## One reusable pipeline

1. Import the ordinary editor JSON or existing API graph once into Workflows. Editor JSON requires preparation against the selected node's real registry; an API graph still requires compatibility and dependency checks.
2. Select the destination. If plugins are missing, use Setup to review/install pinned dependencies first, restart ComfyUI when required, then Prepare inputs. Stale registry preparations must be refreshed.
3. In Inputs, expose exact literal fields. Give each a clear label and media role; choose optional, advanced or hidden presentation. Images, video, audio, text, numbers and booleans retain their original types. Connected internal graph links cannot become literal inputs.
4. In Outputs, name each detected output and choose Collect. This filters returned media collection; it does not remove or disable the ComfyUI graph's output nodes. Custom output nodes must actually return files through ComfyUI history for collection.
5. In Guide, add collection name, short description, Markdown README and a PNG/JPEG/WebP illustration. In Setup, choose hardware compatibility and explicit model/plugin requirements.
6. In Generate, choose the saved workflow and node, assign existing Library assets or import/drop new media, and edit exposed values. Optional unassigned media keeps the original workflow default. A default file must already exist on the target; optional does not make an absent server file valid.
7. Add to queue saves idle tasks. Jobs selects specific tasks to start, remove or edit before submission. One ComfyUI instance uses its FIFO lane; distinct destinations can run concurrently. Submitted tasks retain immutable snapshots and receipts.

## Hardware variants

Use separate imported graphs for Apple Silicon, CUDA or CPU implementations. Associate them with the same family; name each variant and specify OS, architecture and precision. Each variant has its own requirements and prepared target profiles. A compatibility badge does not convert loaders, custom nodes, model formats or weights between platforms.

## Moving a wrapper to another movie

Export the family or collection as `.mymovie-workflow.json`, then import it into another movie. The file contains immutable graphs, public bindings, guide/illustration and dependency requirements. It excludes machine preparations, selected destinations, deployment mappings and private vault identities. Reconfigure private artifact sources and prepare against the destination node after import. Existing immutable identities are reused; media assets remain separate from the workflow collection.

## Node setup

The complete script window provides Mac/Linux commands and notebook code for Colab/Kaggle. Supply a matching agent archive and trusted SHA-256 from the same CI build. Run it on the ComfyUI machine using that installation's Python interpreter. The script verifies archive structure and binary architecture before running the client.

Connections initializes reviewed profiles through the managed agent. Models use explicit category paths, plugins use pinned repositories and dependencies use verified wheels. The runner stores a receipt scoped to session, runtime fingerprint and dependency profile. Unchanged files are reused; a new session, changed runtime or changed profile requires verification again. A plain marker file never declares a node ready.

For private nodes, deploy an authenticated HTTPS relay first and use its address in Studio and the worker. The ComfyUI URL stays local to the worker. The archive does not include a hosted relay or model weights. See [setup](WORKFLOW_SETUP.md) and [RunPod guide](../deploy/runpod/README.md).

## Verification and limits

Unit/integration checks cover immutable graph validation, optional defaults, selected-task transactions and pending-editor readiness. Mocked browser checks cover tabs, guide editing, input/output configuration, queue selection and saved-form reuse. Screenshot: [wrapper guide](screenshots/workflow-wrapper-guide.png).

These checks do not establish a live Colab/RunPod GPU roundtrip. Unknown custom node semantics are exposed as exact fields for explicit binding rather than guessed. Installing plugins may require a ComfyUI restart before registry preparation. Local/remote compilation needs the packaged compiler requirements and Playwright Chromium in the chosen Python environment.
