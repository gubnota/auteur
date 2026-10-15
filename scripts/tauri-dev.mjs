import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const env = { ...process.env };

// Prefer Apple's standalone Command Line Tools when Xcode is installed but
// its first-run license has not been accepted. Tauri needs only the SDK here.
const commandLineTools = "/Library/Developer/CommandLineTools";
if (
  process.platform === "darwin" &&
  !env.DEVELOPER_DIR &&
  existsSync(`${commandLineTools}/usr/bin/clang`) &&
  existsSync(`${commandLineTools}/SDKs/MacOSX.sdk`)
) {
  env.DEVELOPER_DIR = commandLineTools;
}

const bin = resolve(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tauri.cmd" : "tauri",
);
const child = spawn(bin, ["dev"], {
  cwd: resolve(root, "apps/desktop"),
  env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`Could not start Tauri dev: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
