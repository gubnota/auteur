import { describe, expect, it } from "vitest";
import { draftFromRun } from "./job-history";
import type { Job, JobRun } from "./types";

const run: JobRun = {
  id: "run",
  name: "Batch",
  draftId: "draft",
  jobIds: ["job"],
  state: "paused",
  queued: true,
  createdAt: "now",
};
const job = {
  id: "job",
  frameId: "frame",
  workflowId: "workflow",
  connectionId: "node",
  snapshot: {
    semantic: { prompt: "", seed: 0, enabled: false, image: "uploaded.png" },
    media: { image: { id: "asset" } },
    bindings: [],
    context: { kind: "storyboard", mode: "custom", characterIds: ["cast"] },
    connection: { deploymentId: "123", apiFamily: "workflow" },
  },
} as unknown as Job;

describe("frozen batch editing", () => {
  it("restores exact scalars and local asset IDs without mutating receipts", () => {
    const before = structuredClone(job);
    const draft = draftFromRun(run, [job]);
    expect(draft.queuedRunId).toBe(run.id);
    expect(draft.items[0].values).toEqual({
      prompt: "",
      seed: 0,
      enabled: false,
    });
    expect(draft.items[0].assets).toEqual({ image: "asset" });
    expect(draft.items[0].deploymentId).toBe("123");
    draft.items[0].values.seed = 99;
    draft.context!.characterIds.push("other");
    expect(job).toEqual(before);
  });
  it("reuses a started run without linking a queue replacement", () => {
    expect(
      draftFromRun({ ...run, queued: false }, [job]).queuedRunId,
    ).toBeNull();
  });
  it("rejects missing or incomplete receipts rather than guessing inputs", () => {
    expect(() => draftFromRun(run, [])).toThrow("receipt missing");
    expect(() => draftFromRun(run, [{ ...job, snapshot: {} }])).toThrow(
      "no restorable inputs",
    );
  });
  it("edits only selected idle tasks and never links a started receipt", () => {
    const idle = {...job,state:"paused",remoteId:null};
    const active = {...job,id:"started",state:"submitted",remoteId:"remote"};
    const mixed = {...run,state:"active",jobIds:[idle.id,active.id]};
    const draft = draftFromRun(mixed,[idle,active],[idle.id]);
    expect(draft.queuedJobIds).toEqual([idle.id]);
    expect(draft.queuedRunId).toBeNull();
    expect(draft.items).toHaveLength(1);
    expect(draftFromRun(mixed,[idle,active],[active.id]).queuedJobIds).toEqual([]);
  });

});
