import { describe, expect, it } from "vitest";
import { fileDropPoint } from "./file-drop";

describe("native file-drop coordinates", () => {
  it("keeps Cocoa points at the Library or frame position on Retina Macs", () => {
    expect(fileDropPoint({ x: 480, y: 300 }, "MacIntel", 2)).toEqual({
      x: 480,
      y: 300,
    });
    expect(fileDropPoint({ x: 480, y: 300 }, "MacIntel", 1)).toEqual({
      x: 480,
      y: 300,
    });
  });
  it("converts physical positions on other desktop backends", () => {
    expect(fileDropPoint({ x: 960, y: 600 }, "Win32", 2)).toEqual({
      x: 480,
      y: 300,
    });
    expect(fileDropPoint({ x: 480, y: 300 }, "Linux x86_64", 1)).toEqual({
      x: 480,
      y: 300,
    });
  });
});
