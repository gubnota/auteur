# Example workflows and agent setup

A Movie is optional. Open **Workflows → Examples → Use** to inspect the permanent example definition. **Use** keeps its label and does not create a movie copy. Select **Platform variant**, then the execution instance in Setup. Editable copies are a separate action. Initialize each workflow on each new node/session; a workflow definition is independent of its installations.

Export a family as `.mymovie-workflow`. The compressed package includes every hardware variant, immutable original GUI graphs, wrapper controls, guide, previews and reference images. It contains no credentials, node addresses, installed profiles or model weights. Legacy JSON wrappers remain importable. Full variants are compressed together instead of storing fragile array-index diffs. Prebuilt FLUX family packages are in `examples/flux3/`.

## Which example to start with

| Example | Inputs / output | Dependencies | Intended node |
|---|---|---|---|
| Connection & collection test | No media; 64×64 solid image | Core nodes; no weights, plugins or Python additions | CPU, Apple Silicon or CUDA |
| SD 1.5 · T4 starter | Positive/negative text, seed; 512×512 image, batch 1, 12 steps | 4,265,146,304-byte checkpoint; core nodes | Linux CUDA, including Colab T4 |
| FLUX.3 Klein T2I | Text, dimensions, seed, steps, guidance, batch; image | Three pinned model files; recent FLUX.3-capable ComfyUI | T4 INT8 / RTX BF16 / Apple Silicon BF16 |
| FLUX.3 Klein I2I | Subject/identity image + style/palette image, text and numeric controls; image | Same models; two bundled illustrated references | T4 / RTX / Apple Silicon |
| Tiny background removal | One image; white-background image + foreground mask | 4,574,861-byte u2netp model, bundled original plugin, binary onnxruntime closure | CPU inference on a CPU/Mac/CUDA host |

Use the first example to test transport, compilation and collection before a large
download. SD 1.5 is a small *generation workload*, but its first checkpoint download
is about 4.27 GB / 3.97 GiB. No LoRA or custom plugin is needed for that example.
Background removal is the smaller model download, though its binary Python
requirements add their own downloads, all shown before installation.

## Connect a fresh Colab / Kaggle session

1. Open the bundled `deploy/colab/MyMovie_ComfyUI.ipynb` or Kaggle equivalent. Enable
   a GPU runtime (T4 for this SD example), then Run all. It installs the pinned base
   ComfyUI, agent/relay, compiler and tunnel. It does not download workflow models.
2. Keep the running notebook cell active. Copy its printed **Relay URL** and **Node ID**
   to **Studio → Connections → Connect notebook GPUs**. Use the base relay URL,
   without `/v1`. For `trycloudflare.com`, enable **Temporary Cloudflare tunnel · polling only**.
   The URL serves the authenticated relay API; it is not the ComfyUI browser canvas.
3. The app and notebook share the predefined test token pair. Custom values must
   match on both sides. Settings → Node access edits these without putting them in
   movie files. See [desktop connection test](WORKFLOW_SETUP.md#test-the-notebook-connection-from-your-desktop)
   if you need to separate transport/authentication errors from workflow readiness.
4. Workflows → Examples → **Use**. Select **Platform variant**, choose the connected
   worker with **Run and install on**, check its address/node ID, then select **Setup**.
   You can also start from Instances → Initialize workflow. A Movie is optional.

**Build requirement:** guided setup and in-app restart require the matching agent
from source version **0.1.20** and its current notebook supervisor. An older published
agent cannot gain these features from a desktop update alone. Install the matching
verified CI artifact, or publish the matching version and start a new notebook using
that release. The base notebook still starts with older compatible agents and prints
an upgrade message when managed restart is unavailable. Local builds do not publish
a GitHub release automatically.

## Initialize entirely from Studio

1. **Initialize on [instance]** inspects this worker and resolves exact model/plugin
   downloads and a compatible binary Python wheel closure. Nothing is installed yet.
2. Review destinations, sizes, licenses and checksums. **Install & prepare on [instance]**
   performs the sequence through the agent: install verified dependencies, restart its
   managed idle ComfyUI if needed, compile the original workflow, save it in that
   instance’s ComfyUI library, and verify current-session readiness with a weight-free
   64×64 canary and collected bytes. Progress and failures stay in global **Activity**,
   even after this window closes. Use Cancel or Reconnect there.
3. Verified files are reused. Conflicting files, incompatible hardware, unresolved
   dependencies or an unavailable managed restart stop the sequence with a reason.
   Unmanaged external ComfyUI remains read-only for dependency installation. On Kaggle,
   both workers must be idle for a shared-runtime restart; agent/relay/tunnel stay online.
4. **Create a job** opens Generate. Set prompt/media, **Add to queue**, then select
   the intended tasks in Jobs and **Run selected**. Actual results are pulled into
   Library as render-tagged media. Initialization does not run your generation workflow.

The submitted operation retains its exact instance. Changing the editor target clears
its setup review and uses that instance’s own prepared inputs/outputs. For direct
ComfyUI, **Install in ComfyUI** publishes the original editor graph only; it does not
install models/plugins. A local address belongs to the machine making the request.

A review belongs to a node session, runtime fingerprint and exact workflow set. A
changed selection, workflow, dependency pin, runtime or restart requires a fresh
review. New notebook sessions do not inherit readiness from a previous instance.
Kaggle uses independent per-GPU queues sharing storage; it does not pool GPU memory.

## Exact files and custom dependencies

SD checkpoint metadata: `examples/catalogue/sd15-model.json`, immutable Hugging Face
revision `451f4fe16113bff5a5d2269ed5ad43b0592e9a14`, SHA256
`6ce0161689b3853acaa03779ec93eafe75a02f4ced659bee03f50797806fa2fa`.
The ComfyUI `checkpoints` category resolves its actual path during review; managed
notebooks normally use their shared models directory. License: CreativeML OpenRAIL-M.

Background-removal metadata: `examples/provision/rembg-u2netp.model.json`, SHA256
`309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`, destination
`models/background_removal/u2netp.onnx`. The original plugin uses the canonical
`builtin-mymovie-rembg-v1` transfer identity, code-content revision and verified archive
embedded in the agent; it is not fetched from an unpinned third-party branch.
Python starts with `onnxruntime==1.23.2`. Review resolves and verifies all transitive
binary wheels using public PyPI metadata, including hashes, byte sizes and licenses.

For custom LoRAs/models/plugins, add artifacts in Setup: exact HTTPS source (or private
transfer reference), SHA256, byte size, category/target, architecture and license.
Plugin archives require an immutable revision and safe extraction paths. Declare
additional Python packages as exact pins, one per line. Missing compatible wheels,
conflicting pins, hardware mismatches or missing unlisted nodes block readiness with
an actionable report. Private transfer credentials do not belong in exported wrappers.

Source graphs: `examples/workflows/{cpu-canary,sd15-t4,rembg-u2netp}_editor.json`.
API fixtures exist alongside them for automated checks; the shipped examples begin
with the original editor source and are prepared for each selected node.

Background operations, editable recipes, parallel workers, Trash and the private
agent terminal require matching 0.1.20 binaries: [full guide](NODE_ACTIVITY.md).

## FLUX.3 Klein families

The six supplied ordinary ComfyUI workflow JSON files form two families, not six unrelated entries. T4 uses INT8 convrot weights and a 768×768 starting size; RTX and Apple Silicon use BF16 and 1024×1024. Changing a platform badge alone cannot convert a graph. The two I2I slots are labelled **Subject / identity** and **Style / palette**, matching original nodes 10 and 14. Reference images are imported once by content hash and reused across variants and jobs. They are input illustrations, not generated result previews.

1. Connect a managed agent using the current Colab/Kaggle notebook or [local supervisor](LOCAL_COMFYUI_TEST.md). The old published notebook’s pinned ComfyUI may predate FLUX.3 support: use a compatible managed checkout containing upstream merge `20b46065ef7f34fa21e8abebe8d0cca90a904d6d` or later. The recipe checks support; it does not silently replace ComfyUI or PyTorch.
2. Choose T4, RTX or Apple Silicon in the workflow. Review approximately 11.02 GB for the T4 model set or 20.31 GB for BF16. Available disk and inference memory are separate requirements. T4 INT8 remains experimental pending a real run; no universal VRAM fit is promised.
3. Accept the model’s terms on [the official model page](https://huggingface.co/black-forest-labs/flux-3-image-klein-comfy). Open the node’s private agent terminal and run `hf auth login` if authentication is required. Credentials remain on the node. Shared demonstration keys do not enable arbitrary scripts or PTY; configure a matching private pair and enable the console for those features.
4. **Setup → Review initialization → Initialize workflow** downloads pinned diffusion/text-encoder/VAE files to `models/diffusion_models`, `models/text_encoders`, `models/vae`. Existing verified files are reused. The expandable Check/Install/Verify recipe exposes predefined folder variables. No third-party ComfyUI plugin or LoRA is required by these six original graphs.
5. The utility compiles the original GUI graph against that instance, publishes it in ComfyUI and checks transport with a weight-free canary. This proves setup/readiness, not FLUX image quality or inference fit. Select the configured workflow in Generate, add jobs to Scheduled, select the desired cards and Run selected. Results appear in both global Library and Renders.

Model revision, exact SHA256 values, byte sizes, variant guides and scripts are recorded in `examples/flux3/catalogue.json`. Download redirects are bounded; Hugging Face credentials are sent only to the original Hugging Face origin. Access refusals explain license/login requirements. Agent scripts are repeatable and checks run again even when receipts exist.

Primary references: [ComfyUI FLUX.3 support](https://github.com/Comfy-Org/ComfyUI/pull/17064), [official model repository](https://huggingface.co/black-forest-labs/flux-3-image-klein-comfy). No GPU generation or gated model download is claimed by the demo packaging tests.
