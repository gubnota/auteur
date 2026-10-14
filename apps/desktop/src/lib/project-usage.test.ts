import { expect, it } from "vitest";
import { assetUsage, characterUsage } from "./project-usage";
import { project } from "../../../../e2e/fixtures/jobs";

it("deduplicates inherited cast and direct placement, and locates other episodes", () => {
  const p = structuredClone(project);
  p.characters = [
    {
      id: "actor",
      name: "Actor",
      description: "",
      revision: 0,
      assetIds: ["ref"],
    },
  ];
  const scene = p.episodes[0].scenes[0];
  scene.characterIds = ["actor"];
  scene.shots[0].frames[0].characterIds = ["actor"];
  scene.shots[0].frames[0].assetId = "ref";
  const next = structuredClone(p.episodes[0]);
  next.id = "second";
  next.name = "Storm";
  next.scenes[0].shots[0].frames[0].id = "second-frame";
  next.scenes[0].shots[0].frames[0].assetId = null;
  p.episodes.push(next);
  expect(characterUsage(p, "actor").map((f) => f.frameId)).toEqual([
    "frame",
    "second-frame",
  ]);
  expect(assetUsage(p, "ref").frames.map((f) => f.kind)).toEqual([
    "Frame image",
    "Character reference available",
  ]);
  expect(assetUsage(p, "ref").frames[1].episodeId).toBe("second");
  expect(assetUsage(p, "unused")).toEqual({
    frames: [],
    drafts: [],
    characters: [],
    jobs: [],
  });
});

it("labels draft media separately from scene usage", () => {
  const p = structuredClone(project);
  p.jobDrafts = [
    {
      id: "d",
      name: "Media edit",
      frameId: "",
      items: [
        {
          id: "i",
          workflowId: "workflow",
          connectionId: "c",
          values: {},
          assets: { one: "ref", two: "ref" },
        },
      ],
    },
  ];
  expect(assetUsage(p, "ref")).toEqual({
    frames: [],
    drafts: ["Media edit"],
    characters: [],
    jobs: [],
  });
});

it("distinguishes immutable job input and result provenance from ordinary imports", () => {
  const p = structuredClone(project);
  const jobs = [
    { id: "input", snapshot: { media: { ref: { id: "ref" } } }, results: [] },
    { id: "output", snapshot: {}, results: [{ id: "ref" }] },
    { id: "other", snapshot: null, results: [] },
  ] as unknown as import("./types").Job[];
  expect(assetUsage(p, "ref", jobs).jobs.map((j) => j.id)).toEqual([
    "input",
    "output",
  ]);
});
