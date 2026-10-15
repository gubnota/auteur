import {
  uid,
  type Project,
  type AppSettings,
  type Workflow,
  type JobDraft,
} from "./types";
export function newJobDraft(
  p: Project,
  settings: AppSettings,
  frameId = "",
  workflowId = "",
): JobDraft {
  const workflow =
    p.workflows.find((w) => w.id === workflowId) ?? p.workflows[0];
  return {
    id: uid(),
    name: `Generation ${(p.jobDrafts ?? []).length + 1}`,
    frameId,
    context: {
      kind: frameId ? "storyboard" : "standalone",
      mode: "custom",
      characterIds: [],
    },
    items: [
      {
        id: uid(),
        workflowId: workflowId || p.workflows[0]?.id || "",
        connectionId:
          (settings.connections.some((c) => c.id === workflow?.lastTarget)
            ? workflow?.lastTarget
            : undefined) ??
          settings.connections.find((c) =>
            ["comfyui", "relay"].includes(c.kind),
          )?.id ??
          "",
        values: {},
        assets: sampleAssets(p, workflow),
      },
    ],
  };
}

export function sampleAssets(
  p: Project,
  workflow?: Workflow,
): Record<string, string> {
  const assets: Record<string, string> = {};
  for (const sample of workflow?.wrapper?.sampleMedia ?? []) {
    const binding = workflow?.bindings.find(
      (b) => b.nodeId === sample.nodeId && b.input === sample.input && b.media,
    );
    const asset = p.assets.find(
      (a) => a.sha256 === sample.sha256 && !a.archivedAt,
    );
    if (binding && asset) assets[binding.semantic] = asset.id;
  }
  return assets;
}
