# Background setup, recipes and remote console (0.1.18)

## Start and follow initialization

1. Use an agent **and relay built from 0.1.18**, plus the current Colab/Kaggle
   notebook supervisor. Updating the desktop does not update a running notebook.
   The last published archive is v0.1.15; publish/install a matching verified
   artifact before testing these new controls on a remote GPU.
2. Connections → connect the notebook's relay URL and worker ID. Temporary
   Cloudflare addresses require polling mode. The relay root is not a ComfyUI page.
3. Workflows → open a movie copy → choose **Run and install on** → Setup →
   **Initialize on [instance]**. This checks and resolves dependencies without installing.
4. Review the exact sources, destinations, sizes, hashes and licenses. Select
   **Install & prepare on [instance]** once. The relay persists an initialization
   operation; the agent owns installation, recipes, managed restart, preparation,
   publication and readiness verification. This does not run your generation graph.
5. **Activity** is available across the app, including Welcome. Close the workflow
   window or switch tabs freely. Activity shows stage, recent output, elapsed time,
   last contact, file bytes/total and observed transfer speed where available.
6. Once ready, create a job, choose media, Add to queue, then Run selected in Jobs.
   Outputs are collected into the movie's Library.

An identical active request on one node reconnects to its existing operation.
A different initialization on that node is refused until the active one finishes
or is canceled. **Reconnect** refreshes status; it never starts the scripts again.
Completed preparations apply only to the same open movie, source, connection and
unchanged wrapper. Changed forms are never overwritten by a late remote result.

## Cancel, disconnect and restart

**Cancel initialization** requests cancellation through the relay. The agent
stops the running operation and its helper process groups when it receives that
request. Cancellation cannot take effect while the node is unreachable. Already
verified files and successful recipe receipts remain; installed changes are not
rolled back. Interrupted downloads may leave partial files and may redownload;
completed verified files are reused.

The relay retains operation status after desktop navigation/relaunch. A broken
lease is shown as unknown rather than replayed. A surviving agent reconnects with
its existing lease. If the agent itself restarts, its local receipt reports the
interrupted operation as failed; review and initialize again explicitly. If its
local disk was lost, the missing outcome requires reconciliation. A notebook reset
also needs a new node/tunnel connection. Reconnecting cannot revive an ended GPU runtime.

## Two GPUs and multiple instances

Independent nodes can initialize concurrently. Kaggle workers sharing one ComfyUI
checkout/cache serialize dependency changes, script steps, compilation and restart.
A waiting worker inventories the files again and reuses verified downloads. If
its runtime changed while waiting, it may rebind only the same reviewed immutable
dependency set; changed pins require a new review. A shared restart waits for all
managed workers to be idle. Each worker still needs its own prepared profile and
current-session canary. This is safe parallel scheduling, not simultaneous writes
to the same dependency folders.

## Edit an initialization recipe

Workflows → Setup → **Initialization recipe** → Add script step. Give each step a
name, working folder relative to the ComfyUI root, shell script and timeout
(1–3600 seconds). Reorder, edit or remove steps. The complete sequence is:

1. Install reviewed typed model/LoRA/plugin/wheel dependencies.
2. Run your custom script steps in order.
3. Restart the managed runtime if changes require it.
4. Compile/publish the original workflow and verify files, nodes and a canary.

**Once per recipe and runtime** stores a successful receipt bound to the complete
ordered recipe, source workflow version, canonical runtime folder, ComfyUI revision,
Python/platform identity and step index. Changing a recipe or base runtime invalidates
it. A script's own Python package installation does not invalidate its receipt.
**Once per runtime session** additionally binds the receipt to the agent session;
restarting only the managed ComfyUI worker does not replay these steps. Failed or
interrupted steps are not marked complete. Write scripts to tolerate partial work.
A successful custom receipt is not a substitute for readiness verification.

Scripts use `/bin/sh` and run in a confined working-folder selection, with a bounded
execution time. They have the agent user's normal OS permissions, not an OS sandbox.
Use the notebook environment's interpreter explicitly if your script installs Python
packages. Export/import of `.mymovie-workflow.json` carries the recipe and dependency
pins, but no node secrets, local prepared profiles or success receipts.

## Enable custom scripts and a terminal

Normal reviewed initialization retains the predefined test keys and requires no
console opt-in. Arbitrary scripts and the interactive terminal require a private
pair instead of the shared public test defaults:

1. Stop the notebook runner. Set your own matching `MYMOVIE_AGENT_TOKEN` and
   `MYMOVIE_DESKTOP_TOKEN` in notebook Configure and Studio → Settings → Node access.
   Update the saved connection's desktop credential too; old entries are not rotated.
2. Set `ALLOW_REMOTE_CONSOLE = True` in the current notebook and start the runner.
   For a manually launched agent, add `--allow-console` (or
   `MYMOVIE_ALLOW_CONSOLE=true`). Both the agent and relay must use the private pair.
3. Connections → **Remote console**, or use the terminal button in Activity.
   A PTY shell opens in this node's ComfyUI folder. Output is plain text; command
   input, Ctrl-C and terminal-size controls are supported. The console fills the app window, with a flexible output area and accessible controls on smaller screens.
4. Closing the window detaches. Reopen to reconnect to the same live session;
   **End session** terminates it. Sessions last at most 30 minutes and retain up to
   256 KiB of output. An agent restart closes the old session without replaying commands.

The console uses authenticated outbound agent polling through the existing relay,
not a new SSH port. Opening a shell invalidates readiness; initialize again after
manual changes. Custom commands do not enter the generation queue. Child processes
receive a reduced environment without relay authentication tokens.

## Remove workflows

Workflows → **Move to Trash** removes a movie copy from active workflow lists,
variants and new-job choices. **Trash → Restore** restores the same identity,
input form, guide and recipe. Source graphs, assets and previous job receipts remain.
**Trash → Clear trash** removes all trashed movie catalogue entries. It preserves immutable source files and revision/job history; cleared entries no longer offer Restore.
An existing initialization keeps running until explicitly canceled in Activity.
Built-in example templates remain available to create or restore a movie copy.

## Verification limits

Browser screenshots and queue/status tests use fixtures. Local Rust/Python tests
exercise durable relay state, lease recovery, duplicate prevention, recipe identity,
process cleanup and PTY transport. Live Colab/Kaggle installation, cancellation and
GPU output collection with 0.1.18 still require a matching hosted artifact and runtime.
