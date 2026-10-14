import { describe, expect, it } from "vitest";
import {
  dependencyError,
  destinationConflict,
} from "../components/WorkflowSetup";
import type { InstallArtifact } from "./types";
const artifact: InstallArtifact = {
  kind: "model",
  category: "loras",
  target: "example.safetensors",
  sha256: "a".repeat(64),
  size: 10,
  license: "MIT",
  architecture: "any",
  source: "https://example.org/model",
};
describe("portable dependency metadata", () => {
  it("rejects unsafe targets, secret URLs and mutable plugin versions", () => {
    expect(dependencyError(artifact)).toBe("");
    expect(dependencyError({ ...artifact, target: "../escape" })).not.toBe("");
    expect(
      dependencyError({
        ...artifact,
        source: "https://example.org/model?token=secret",
      }),
    ).not.toBe("");
    expect(
      dependencyError({ ...artifact, kind: "plugin", revision: "main" }),
    ).not.toBe("");
    expect(
      dependencyError({
        ...artifact,
        kind: "plugin",
        revision: "b".repeat(40),
      }),
    ).toBe("");
    expect(
      dependencyError({ ...artifact, source: "", sourceRef: "private-model" }),
    ).toBe("");
  });
  it("prevents duplicate destinations while allowing edits", () => {
    expect(destinationConflict(artifact, [artifact], -1)).toBe(true);
    expect(destinationConflict(artifact, [artifact], 0)).toBe(false);
  });
});
