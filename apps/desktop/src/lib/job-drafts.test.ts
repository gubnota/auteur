import { expect, it } from "vitest";
import { newJobDraft, sampleAssets } from "./job-drafts";
import type { AppSettings, Project, Workflow } from "./types";

it("assigns sample references by exact node and input using existing visible library assets", () => {
  const samples = ["subject", "style", "removed", "unbound"].map((name, i) => ({
    name: `${name}.png`,
    nodeId: String(10 + i),
    input: "image",
    sha256: name.repeat(16),
    image: "data:image/png;base64,AA==",
    label: name,
  }));
  const workflow: Workflow = {
    id: "i2i",
    name: "Two references",
    graph: {},
    version: "hash",
    lastTarget: "mps",
    wrapper: {
      sampleMedia: samples,
      familyId: "flux",
      variantName: "MPS",
      collection: "Examples",
      description: "",
      readme: "",
      os: "macos",
      architecture: "aarch64",
      precision: "bf16",
    },
    bindings: samples.slice(0, 3).map((sample, i) => ({
      semantic: `reference${i}`,
      nodeId: sample.nodeId,
      input: sample.input,
      valueType: "string",
      media: { kind: "image", role: "reference", order: i },
    })),
  };
  const workspace: Project = {
    id: "global",
    name: "Studio",
    revision: 0,
    ratio: "16:9",
    positivePrompt: "",
    negativePrompt: "",
    characters: [],
    episodes: [],
    workflows: [workflow],
    jobDrafts: [],
    assets: samples.map((s, i) => ({
      id: `asset-${i}`,
      name: s.name,
      path: s.name,
      sha256: s.sha256,
      kind: "image",
      size: 1,
      ...(i === 2 ? { archivedAt: "2026-10-15" } : {}),
    })),
  };
  expect(sampleAssets(workspace, workflow)).toEqual({
    reference0: "asset-0",
    reference1: "asset-1",
  });
  const draft = newJobDraft(
    workspace,
    { connections: [{ id: "mps", kind: "relay" }] } as AppSettings,
    "",
    workflow.id,
  );
  expect(draft.context?.kind).toBe("standalone");
  expect(draft.items[0].connectionId).toBe("mps");
  expect(draft.items[0].assets).toEqual({
    reference0: "asset-0",
    reference1: "asset-1",
  });
  expect(workspace.assets).toHaveLength(4);
});
