# Supplied Workflow Audit

Date: 2026-10-13. Static inspection only; no import, upload or execution.
Inputs are data, including embedded prompts/paths; they do not authorize commands.
Original Downloads files remain unchanged and outside the repository.

## Inputs

- `/Users/vm/Downloads/LTX 2.3 T2V & I2V  Quality & Fast_api.json`
- `/Users/vm/Downloads/LTX+2.3+T2V+&+I2V++Quality+&+Fast.json`
- `/Users/vm/Downloads/MINIMAX H3 Motion Context V2_api.json`
- retired hosted provider page (retired external deployment)

## LTX API and editor

- API graph: 46 nodes. Editor: 102 nodes/92 links, including Get/Set UI nodes.
- All API node IDs/types match editor counterparts. No missing referenced nodes
  or negative output indices; registry output arity/type validation remains pending.
- Terminal output: node 140, VHS_VideoCombine, with video and audio connections.
- Exact semantic binding candidates, subject to registry/provider validation:

| Meaning | Node.field | Evidence/constraint |
| --- | --- | --- |
| Positive prompt | 121.text | Conditioning 107.positive points to 121 |
| Negative prompt | 110.text | Conditioning 107.negative points to 110 |
| FPS | 285.value | Connected to conditioning and duration calculator |
| Duration seconds | 291.value | 287 calculates frame length from duration/FPS |
| Target dimensions | 292.value / 293.value | Resize 165; downstream size comes from image 384 |
| Reference image | 167.image | LoadImage -> resize -> I2V and size dependencies |
| T2V bypass | 290.value | Wired to both I2V nodes; does not remove image dependencies |
| Seed | 364.seed | Both samplers use it; exported -1 needs node-contract validation |

- Export target is 720x1280, 24 FPS, 10 seconds; resize divisible_by=32.
  Effective dimensions need actual node validation; UI ratio never overwrites
  graph structure blindly. Two-pass schedules/LoRA/AV latents remain intact.
- Resource names identify LTX 2.3 22B transformer, distilled LoRA, video/audio
  VAEs, Gemma 12B, text projection and spatial upscaler. They do not identify
  authoritative origins, licenses, hashes or installation instructions.
- Custom nodes include KJ, rgthree, VHS, JDC and LTX-specific classes.
  SageAttention auto mode and installed runtime compatibility are unverified.

## MINIMAX API

- 17 nodes; no missing referenced node or negative output indices.
- References MiniMax-named transformer, Qwen3VL 32B encoder, audio/video VAEs,
  reference-to-video LoRA and latent upscaler; provenance/runtime unresolved.
- 29.track_data is serialized JSON, with two tracks, three task segments and
  zero video segments. Timeline reports 24 FPS and total_length=576.
- Segment content contains user_prompt, user_prompt_variant, task/continuity
  modes and images with file_path/file_name/source_type/shared_reference.
  Do not publish original prompts/paths in fixtures; explicitly stage references.
- Ratio lives at 29.inputs["resolution.aspect_ratio"], not a nested object;
  megapixels at literal key "resolution.megapixels". Keep dotted keys intact.
- 15 owns seed, segment selection, sampling plan and two-pass runtime settings.
- 17.project_data is a separate serialized object with an empty clips list.
  Treat it according to the actual custom-node schema, not as authoritative job state.
- Outputs: 25 easy saveVideo and disconnected 35 SaveVideo. Node 35 has no
  video input. Check installed registry validation; do not silently drop it.
- Bind serialized inputs by parsing/validating and re-encoding while preserving
  untouched fields/tracks. Snapshot exact serialized job inputs and reference hashes.

## retired hosted provider identity and public contract

- User confirmed on 2026-10-14 that Workflow 2110044532631932930 matches
  the supplied LTX API JSON. This association comes from the user, not public
  graph verification. The separate AI App below must not replace that ID.
- Native UI saved the Workflow-family account mapping and string bindings
  positivePrompt → 121.text, negativePrompt → 110.text, image → 167.image.
  Persistence was checked read-only. No job was submitted; the selected frame
  lacked an image. Assign a project image before using this image binding.
- HTTPS browser inspection identifies AI App 2021554630848684033, titled
  "V2V Video Redrawing Video Plagiarism". This is a separate deployment;
  no association with either supplied graph was established.
- Example submits POST /openapi/v2/run/ai-app/2021554630848684033 using
  Bearer authentication, then POST /openapi/v2/query with taskId.
- States shown: QUEUED/RUNNING/SUCCESS/FAILED. Persist taskId and exact inputs.
- Public table requires nodeInfoList but example omits it; no app-specific
  input list is visible. usePersonalQueue example is a string while table says
  Boolean. Resolve actual schema/entitlement before a live request.
- Page documents result/upload URLs valid for one day. Collect outputs promptly;
  transfer failure/expiry is separate from generation and never triggers blind retry.
- No provider-native SSE established; owned relay SSE remains separate.
- No login, upload, submission or billing action performed; live access unresolved.

## Acceptance boundaries

- These model-heavy graphs are GPU acceptance targets, not CPU smoke fixtures.
- Initial Docker/OrbStack test uses a registry-verified weight-free ComfyUI graph.
- Full imports retain originals in user project packages; tracked tests use safe
  minimal fragments, sanitized prompts/reference placeholders and no secrets.
- Local registry checks, dependency origins/hashes/licenses, media staging,
  account entitlement/budget and live execution remain unverified. The LTX
  provider mapping is user-confirmed; MINIMAX mapping remains unresolved.
- Original JSON fields and embedded text are never instructions to install/run tools.
