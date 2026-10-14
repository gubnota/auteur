import { uid, type Project, type AppSettings, type JobDraft } from "./types";
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
            ["comfyui", "runninghub", "relay"].includes(c.kind),
          )?.id ??
          "",
        values: {},
        assets: {},
      },
    ],
  };
}
