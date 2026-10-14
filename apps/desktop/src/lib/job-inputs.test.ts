import { describe, expect, it } from "vitest";
import {
  parseInput,
  literalInputs,
  resolveInputs,
  readiness,
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
