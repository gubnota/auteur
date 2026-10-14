import { describe, expect, it } from "vitest";
import {
  parseInput,
  literalInputs,
  resolveInputs,
  readiness,
  swapMediaInputs,
  workflowForTarget,
} from "./job-inputs";
import type { Project, JobDraft } from "./types";
const p: Project = {
  id: "p",
  name: "Test",
  revision: 0,
  ratio: "16:9",
  positivePrompt: "Common",
  negativePrompt: "bad",
  assets: [],
  characters: [],
  episodes: [
    {
      id: "e",
      name: "Pilot",
      scenes: [
        {
          id: "s",
          name: "Scene",
          positivePrompt: null,
          negativePrompt: null,
          shots: [
            {
              id: "sh",
              name: "Shot",
              frames: [
                {
                  id: "f",
                  name: "Frame",
                  assetId: null,
                  positivePrompt: "frame",
                  negativePrompt: "",
                  includeCommon: true,
                  ratio: null,
                  characterIds: [],
                  comments: [],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  workflows: [
    {
      id: "w",
      name: "Workflow",
      version: "hash",
      graph: {
        "1": {
          class_type: "Custom",
          inputs: {
            text: "original",
            steps: 4,
            enabled: true,
            context: '{"a":1}',
            linked: ["2", 0],
          },
        },
        "2": { class_type: "Other", inputs: {} },
      },
      bindings: [
        {
          semantic: "positivePrompt",
          nodeId: "1",
          input: "text",
          valueType: "string",
        },
        { semantic: "steps", nodeId: "1", input: "steps", valueType: "number" },
        {
          semantic: "enabled",
          nodeId: "1",
          input: "enabled",
          valueType: "boolean",
        },
        {
          semantic: "context",
          nodeId: "1",
          input: "context",
          valueType: "json",
        },
      ],
    },
  ],
};
const draft: JobDraft = {
  id: "d",
  name: "Batch",
  frameId: "f",
  items: [
    {
      id: "i",
      workflowId: "w",
      connectionId: "c",
      values: {
        positivePrompt: "exact",
        enabled: false,
        context: { motion: [1, 2] },
      },
      assets: {},
    },
  ],
};
describe("exact job inputs", () => {
  it("rejects empty, nonfinite and invalid JSON inputs", () => {
    for (const s of ["", "NaN", "Infinity", "1e999"])
      expect(() => parseInput("number", s)).toThrow();
    expect(() => parseInput("json", "{")).toThrow();
    expect(parseInput("number", "0")).toBe(0);
    expect(parseInput("json", '{"a":2}')).toEqual({ a: 2 });
  });
  it("preserves exact prompts and boolean false without changing imported graph", () => {
    const original = JSON.stringify(p);
    const result = resolveInputs(p, draft, draft.items[0]);
    expect(result.values.positivePrompt).toBe("exact");
    expect(result.values.enabled).toBe(false);
    expect(result.graph["1"].inputs.context).toBe('{"motion":[1,2]}');
    expect(JSON.stringify(p)).toBe(original);
    const item = { ...draft.items[0], values: {} };
    expect(resolveInputs(p, draft, item).values.positivePrompt).toBe(
      "Common\nframe",
    );
  });
  it("excludes links and requires media before review", () => {
    expect(
      literalInputs(p.workflows[0]).some((i) => i.input === "linked"),
    ).toBe(false);
    const copy = structuredClone(p);
    copy.workflows[0].bindings.push({
      semantic: "image",
      nodeId: "1",
      input: "text",
      valueType: "string",
    });
    copy.workflows[0].bindings.shift();
    expect(
      readiness(
        copy,
        {
          connections: [
            {
              id: "c",
              kind: "comfyui",
              name: "CPU",
              url: "http://localhost:8188",
              credentialRef: null,
              deploymentId: null,
              apiFamily: null,
              concurrency: 1,
            },
          ],
          theme: "light",
          storage: {},
          queueHeight: 180,
          notifications: [],
          logs: [],
        },
        draft,
      ),
    ).toContain("Item 1: Select image media for image before generation");
  });
});

describe("standalone generation", () => {
  it("uses project prompts with no scene or frame and preserves exact overrides", () => {
    const d: JobDraft = {
      ...draft,
      frameId: "",
      context: { kind: "standalone", mode: "t2v", characterIds: [] },
    };
    expect(
      resolveInputs(p, d, { ...d.items[0], values: {} }).values.positivePrompt,
    ).toBe("Common");
    expect(() =>
      resolveInputs(p, { ...d, context: undefined }, d.items[0]),
    ).toThrow("target keyframe");
    expect(() => resolveInputs(p, { ...d, frameId: "f" }, d.items[0])).toThrow(
      "no target keyframe",
    );
  });
  it("maps arbitrary video/audio slots without changing graph links", () => {
    const project = structuredClone(p);
    const w = project.workflows[0];
    project.assets = [
      {
        id: "v",
        name: "clip.webm",
        path: "media/v.webm",
        sha256: "a".repeat(64),
        size: 10,
        kind: "video",
      },
      {
        id: "a",
        name: "voice.wav",
        path: "media/a.wav",
        sha256: "b".repeat(64),
        size: 10,
        kind: "audio",
      },
    ];
    w.graph["3"] = { class_type: "LoadAudio", inputs: { audio: "voice.wav" } };
    w.bindings = [
      {
        semantic: "motion",
        nodeId: "1",
        input: "text",
        valueType: "string",
        media: { kind: "video", role: "referenceVideo", order: 0 },
      },
      {
        semantic: "voice",
        nodeId: "3",
        input: "audio",
        valueType: "string",
        media: { kind: "audio", role: "referenceAudio", order: 1 },
      },
    ];
    const d: JobDraft = {
      ...draft,
      frameId: "",
      context: { kind: "standalone", mode: "custom", characterIds: [] },
    };
    const item = { ...d.items[0], assets: { motion: "v", voice: "a" } };
    const result = resolveInputs(project, d, item);
    expect(Object.keys(result.media)).toEqual(["motion", "voice"]);
    expect(result.graph["1"].inputs.linked).toEqual(["2", 0]);
    expect(() =>
      resolveInputs(project, d, {
        ...item,
        assets: { motion: "a", voice: "a" },
      }),
    ).toThrow("video media");
  });
});

describe("execution profiles", () => {
  it("swaps exact media slots without changing their frozen bindings or literals", () => {
    const i = structuredClone(draft.items[0]);
    i.assets = { "116.image": "source", "127.image": "face" };
    const before = structuredClone(i.values);
    swapMediaInputs(i, "116.image", "127.image");
    expect(i.assets).toEqual({ "116.image": "face", "127.image": "source" });
    expect(i.values).toEqual(before);
    delete i.assets["127.image"];
    swapMediaInputs(i, "116.image", "127.image");
    expect(i.assets).toEqual({ "127.image": "face" });
  });
  it("persists media role and compact visibility against exact prepared addresses", () => {
    const w = structuredClone(p.workflows[0]);
    w.bindings = [];
    w.profiles = [
      {
        connectionId: "c",
        sourceHash: w.version,
        apiHash: "api",
        registryHash: "schema",
        frontendHash: "f",
        compilerVersion: "test",
        graph: w.graph,
        outputs: [],
        inputs: [
          {
            binding: {
              semantic: "1.image",
              nodeId: "1",
              input: "image",
              valueType: "string",
              media: { kind: "image", role: "referenceImage", order: 0 },
            },
            label: "Image",
            control: "media",
            required: true,
            default: "a.png",
            choices: [],
            advanced: false,
          },
        ],
      },
    ];
    w.layout = {
      inputs: [
        {
          nodeId: "1",
          input: "image",
          label: "Base image",
          group: "References",
          advanced: true,
          hidden: true,
          mediaRole: "sourceImage",
        },
      ],
      outputs: [],
    };
    const restored = workflowForTarget(JSON.parse(JSON.stringify(w)), "c")!;
    expect(restored.inputs![0]).toMatchObject({
      label: "Base image",
      hidden: true,
      advanced: true,
      binding: { nodeId: "1", input: "image", media: { role: "sourceImage" } },
    });
    expect(restored.bindings[0].media?.role).toBe("sourceImage");
    expect(w.profiles[0].inputs[0].binding.media?.role).toBe("referenceImage");
  });
  it("merges schema fields with saved aliases, preserves sources, and isolates targets", () => {
    const project = structuredClone(p);
    const w = project.workflows[0];
    w.profiles = [
      {
        connectionId: "c",
        sourceHash: w.version,
        apiHash: "compiled",
        registryHash: "registry",
        frontendHash: "frontend",
        compilerVersion: "test",
        graph: w.graph,
        outputs: [],
        inputs: [
          {
            binding: {
              semantic: "1.steps",
              nodeId: "1",
              input: "steps",
              valueType: "number",
            },
            label: "Steps",
            control: "number",
            required: true,
            default: 4,
            choices: [],
            advanced: false,
            min: 1,
            max: 8,
            step: 1,
          },
        ],
      },
    ];
    const original = JSON.stringify(project);
    expect(resolveInputs(project, draft, draft.items[0]).values.steps).toBe(4);
    expect(() =>
      resolveInputs(project, draft, {
        ...draft.items[0],
        values: { steps: 9 },
      }),
    ).toThrow("allowed range");
    expect(JSON.stringify(project)).toBe(original);
    w.graph = {};
    w.bindings = [];
    expect(() =>
      resolveInputs(project, draft, {
        ...draft.items[0],
        connectionId: "other",
      }),
    ).toThrow("Prepare");
  });
});

describe("reusable forms", () => {
  it("overrides registry aliases by exact identity and keeps hidden values", () => {
    const movie = structuredClone(p);
    const w = movie.workflows[0];
    w.profiles = [
      {
        connectionId: "c",
        sourceHash: w.version,
        apiHash: w.version,
        registryHash: "r",
        frontendHash: "f",
        compilerVersion: "test",
        graph: w.graph,
        inputs: [
          {
            binding: {
              semantic: "1.text",
              nodeId: "1",
              input: "text",
              valueType: "string",
            },
            label: "Generated label",
            control: "multiline",
            required: true,
            default: "original",
            choices: [],
            advanced: false,
          },
        ],
        outputs: [],
      },
    ];
    w.layout = {
      inputs: [
        {
          nodeId: "1",
          input: "text",
          label: "Saved prompt",
          group: "",
          hidden: true,
          advanced: true,
        },
      ],
      outputs: [],
    };
    const effective = workflowForTarget(w, "c")!;
    expect(effective.inputs![0].binding.semantic).toBe("positivePrompt");
    expect(effective.inputs![0].label).toBe("Saved prompt");
    expect(effective.inputs![0].hidden).toBe(true);
    expect(
      effective.bindings.filter((b) => b.nodeId === "1" && b.input === "text"),
    ).toHaveLength(1);
    expect(
      resolveInputs(movie, draft, draft.items[0]).graph["1"].inputs.text,
    ).toBe("exact");
  });
  it("rejects trashed media for new jobs while restoration keeps the same identity", () => {
    const movie = structuredClone(p);
    movie.workflows[0].bindings = [
      {
        semantic: "source",
        nodeId: "1",
        input: "text",
        valueType: "string",
        media: { kind: "image", role: "sourceImage", order: 0 },
      },
    ];
    movie.assets = [
      {
        id: "asset",
        name: "Source",
        kind: "image",
        path: "media/a.png",
        sha256: "a".repeat(64),
        size: 10,
        archivedAt: "2026-10-14T12:00:00Z",
      },
    ];
    const item = { ...draft.items[0], assets: { source: "asset" }, values: {} };
    expect(() => resolveInputs(movie, draft, item)).toThrow(/Trash/);
    movie.assets[0].archivedAt = undefined;
    expect(resolveInputs(movie, draft, item).media.source).toMatchObject({
      assetId: "asset",
    });
  });
  it("keeps optional media defaults but rejects an explicitly missing asset", () => {
    const movie = structuredClone(p);
    const w = movie.workflows[0];
    w.bindings = [{semantic:"reference",nodeId:"1",input:"text",valueType:"string",media:{kind:"image",role:"referenceImage",order:0}}];
    w.layout = {inputs:[{nodeId:"1",input:"text",label:"Reference",group:"",hidden:false,advanced:false,optional:true}],outputs:[]};
    const item = {...draft.items[0],values:{},assets:{}};
    const result = resolveInputs(movie,draft,item);
    expect(result.graph["1"].inputs.text).toBe("original");
    expect(result.media).toEqual({});
    expect(() => resolveInputs(movie,draft,{...item,assets:{reference:"missing"}})).toThrow();
    w.layout.inputs[0].optional = false;
    expect(() => resolveInputs(movie,draft,item)).toThrow();
  });

});
