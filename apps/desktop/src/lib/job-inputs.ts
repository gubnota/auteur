import type {
  AppSettings,
  Binding,
  JobDraft,
  JobItem,
  Project,
  Workflow,
} from "./types";

export function parseInput(type: string, text: string): unknown {
  if (type === "number") {
    if (!text.trim() || !Number.isFinite(Number(text)))
      throw new Error("Enter a finite number");
    return Number(text);
  }
  if (type === "json") {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Enter valid JSON");
    }
  }
  if (type === "boolean") return text === "true";
  return text;
}
export function isLink(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "string" &&
    typeof value[1] === "number"
  );
}
export function literalInputs(w: Workflow) {
  return Object.entries(w.graph).flatMap(([nodeId, node]) =>
    Object.entries(node.inputs)
      .filter(([, value]) => !isLink(value))
      .map(([input, value]) => ({
        nodeId,
        input,
        value,
        classType: node.class_type,
      })),
  );
}
export function castImages(
  p: Project,
  frameId: string,
  characterIds: string[] = [],
) {
  const scene = p.episodes
    .flatMap((e) => e.scenes)
    .find((s) => s.shots.some((sh) => sh.frames.some((f) => f.id === frameId)));
  const frame = scene?.shots
    .flatMap((s) => s.frames)
    .find((f) => f.id === frameId);
  const cast = new Set([
    ...characterIds,
    ...(scene?.characterIds ?? []),
    ...(frame?.characterIds ?? []),
  ]);
  const ids = new Set(
    p.characters.filter((c) => cast.has(c.id)).flatMap((c) => c.assetIds),
  );
  return p.assets.filter((a) => ids.has(a.id) && a.kind === "image");
}
export const mediaBinding = (b: Binding) =>
  !!b.media ||
  ["image", "mask"].includes(b.semantic) ||
  b.semantic.startsWith("characterReference");
export function resolveInputs(p: Project, draft: JobDraft, item: JobItem) {
  if (Object.keys(item.inputErrors ?? {}).length)
    throw new Error(Object.values(item.inputErrors!).join("; "));
  const w = p.workflows.find((w) => w.id === item.workflowId);
  if (!w) throw new Error("Select a workflow");
  const scene = p.episodes
    .flatMap((e) => e.scenes)
    .find((s) =>
      s.shots.some((sh) => sh.frames.some((f) => f.id === draft.frameId)),
    );
  const frame = scene?.shots
    .flatMap((s) => s.frames)
    .find((f) => f.id === draft.frameId);
  const standalone = draft.context?.kind === "standalone";
  if (!frame && !standalone) throw new Error("Select a target keyframe");
  if (standalone && draft.frameId)
    throw new Error("Standalone drafts must have no target keyframe");
  if (
    draft.context?.characterIds.some(
      (id) => !p.characters.some((c) => c.id === id),
    )
  )
    throw new Error("Assigned character missing");
  const refs = castImages(p, draft.frameId, draft.context?.characterIds);
  const values: Record<string, unknown> = {};
  const media: Record<string, unknown> = {};
  const graph = structuredClone(w.graph);
  const bindings = item.bindings ?? w.bindings;
  const seen = new Set<string>(),
    fields = new Set<string>();
  for (const b of bindings) {
    const field = `${b.nodeId}.${b.input}`;
    if (seen.has(b.semantic) || fields.has(field))
      throw new Error("Bindings must have unique names and fields");
    seen.add(b.semantic);
    fields.add(field);
    const defaults = w.graph[b.nodeId]?.inputs;
    if (!defaults || !(b.input in defaults) || isLink(defaults[b.input]))
      throw new Error(`Binding ${field} is missing or connected`);
    let value = item.values[b.semantic] ?? defaults[b.input];
    // Empty string and false are valid overrides; null is valid JSON.
    if (Object.prototype.hasOwnProperty.call(item.values, b.semantic))
      value = item.values[b.semantic];
    else if (
      b.semantic === "positivePrompt" ||
      b.semantic === "negativePrompt"
    ) {
      const key = b.semantic;
      value = frame
        ? [frame.includeCommon ? (scene?.[key] ?? p[key]) : "", frame[key]]
            .filter((s) => s.trim())
            .join("\n")
        : p[key];
    } else if (b.valueType === "json" && typeof value === "string")
      value = parseInput("json", value);
    if (mediaBinding(b)) {
      const id =
        item.assets[b.semantic] ??
        (b.semantic === "image"
          ? frame?.assetId
          : refs[Number(b.semantic.replace("characterReference", "")) - 1]?.id);
      const asset = p.assets.find((a) => a.id === id);
      if (!asset || asset.kind !== (b.media?.kind ?? "image"))
        throw new Error(
          `Select ${b.media?.kind ?? "image"} media for ${b.semantic} before generation`,
        );
      if (
        (b.semantic.startsWith("characterReference") ||
          b.media?.role === "characterReference") &&
        !refs.some((a) => a.id === asset.id)
      )
        throw new Error("Select a reference from the assigned cast");
      media[b.semantic] = {
        assetId: asset.id,
        name: asset.name,
        sha256: asset.sha256,
        providerFilename: "pending staging",
      };
      value = `asset:${asset.id} (provider filename pending)`;
    }
    if (b.valueType !== "json" && typeof value !== b.valueType)
      throw new Error(`${b.semantic} needs a ${b.valueType} value`);
    if (typeof value === "number" && !Number.isFinite(value))
      throw new Error(`${b.semantic} needs a finite number`);
    values[b.semantic] = value;
    graph[b.nodeId].inputs[b.input] =
      b.valueType === "json" && typeof defaults[b.input] === "string"
        ? JSON.stringify(value)
        : value;
  }
  return { values, media, graph };
}
export function readiness(
  p: Project,
  s: AppSettings,
  draft: JobDraft,
): string[] {
  if (!draft.items.length) return ["Add a workflow item"];
  return draft.items.flatMap((item, index) => {
    const errors: string[] = [];
    const c = s.connections.find((c) => c.id === item.connectionId);
    const w = p.workflows.find((w) => w.id === item.workflowId);
    if (!c || !["comfyui", "runninghub", "relay"].includes(c.kind))
      errors.push("Select an execution connection");
    if (c?.kind === "runninghub") {
      const d = w?.deployments?.find((d) => d.connectionId === c.id);
      if (!c.credentialRef)
        errors.push("Add this account’s API key in Connections.");
      if (
        !/^\d+$/.test(
          item.deploymentId ?? d?.deploymentId ?? c.deploymentId ?? "",
        ) ||
        !["workflow", "ai-app"].includes(
          item.apiFamily ?? d?.apiFamily ?? c.apiFamily ?? "",
        )
      )
        errors.push(
          "Configure a hosted Workflow / AI App ID and API family. Importing JSON alone does not create a hosted deployment.",
        );
      if (
        (item.bindings ?? w?.bindings ?? []).some(
          (b) => b.media && b.media.kind !== "image",
        )
      )
        errors.push(
          "RunningHub video/audio uploads are not verified. Use a ComfyUI node for these inputs.",
        );
      if (!(item.bindings ?? w?.bindings ?? []).length)
        errors.push("Configure verified provider bindings first");
    }
    try {
      resolveInputs(p, draft, item);
    } catch (e) {
      errors.push((e as Error).message);
    }
    return errors.map((e) => `Item ${index + 1}: ${e}`);
  });
}
