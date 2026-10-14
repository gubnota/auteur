import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  setupScript,
  type ScriptConfig,
} from "../../apps/desktop/src/lib/setup-script";
const config: ScriptConfig = {
  artifact: "/tmp/agent.tar.gz",
  sha256: "a".repeat(64),
  root: "/tmp/ComfyUI",
  python: "/tmp/python",
  comfyUrl: "http://localhost:8188",
  relay: "https://relay.example",
  nodeId: "test",
  action: "inventory",
  managed: false,
};
describe("copyable setup script", () => {
  it("keeps shell metacharacters as literal data and passes shell syntax checks", () => {
    const payload =
      "single'quote `echo private` $(echo private); newline\nvalue";
    const script = setupScript({ ...config, root: payload });
    execFileSync("sh", ["-n"], { input: script });
    const assignments = script.split("# Run in a dedicated")[0];
    const actual = execFileSync(
      "sh",
      ["-c", assignments + '\nprintf %s "$COMFY_ROOT"'],
      { encoding: "utf8" },
    );
    expect(actual).toBe(payload);
  });
  it("uses verified architecture-specific archives and separate initialization", () => {
    const script = setupScript({ ...config, action: "serve", managed: true });
    expect(script).toContain("Archive checksum mismatch");
    expect(script).toContain("Unsafe archive entry");
    expect(script).toContain("Unsupported agent architecture");
    expect(script).toContain("MYMOVIE_AGENT_TOKEN:?");
    expect(script).toContain("--managed-runtime");
    expect(script).not.toContain("--initialize");
    expect(setupScript({ ...config, action: "workflow-install" })).toContain(
      "--publish-to-comfyui",
    );
  });
});
