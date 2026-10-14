import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { Project, AppSettings, Job } from "./types";
export const native = isTauri();
let previewProject: Project | null = null;
let settings: AppSettings = {
  connections: [],
  theme: "light",
  queueHeight: 180,
  storage: {},
  notifications: [],
  logs: [],
};
export async function call<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (native) return invoke<T>(command, args);
  if (command === "get_settings") return settings as T;
  if (command === "save_settings") {
    settings = args.settings as AppSettings;
    return settings as T;
  }
  if (command === "save_project") {
    previewProject = {
      ...(args.project as Project),
      revision: (args.expectedRevision as number) + 1,
    };
    return previewProject as T;
  }
  if (
    command === "list_jobs" ||
    command === "refresh_jobs" ||
    command === "list_job_runs"
  )
    return [] as T;
  if (command === "clear_diagnostics") {
    settings = { ...settings, [args.kind as string]: [] };
    return settings as T;
  }
  throw new Error(
    "This action requires the native macOS app. Browser preview does not connect to services.",
  );
}
export async function pickFile(
  kind: "media" | "workflow" | "project",
): Promise<string | null> {
  if (!native) throw new Error("Open the native app to use Finder dialogs");
  const path = await open({
    directory: kind === "project",
    multiple: false,
    filters:
      kind === "workflow"
        ? [{ name: "API workflow", extensions: ["json"] }]
        : undefined,
  });
  return typeof path === "string" ? path : null;
}
export async function pickReferenceImages(): Promise<string[]> {
  if (!native)
    throw new Error("Open the native app to import reference images");
  const paths = await open({
    multiple: true,
    filters: [
      {
        name: "Reference images",
        extensions: ["png", "jpg", "jpeg", "webp", "gif"],
      },
    ],
  });
  return Array.isArray(paths)
    ? paths
    : typeof paths === "string"
      ? [paths]
      : [];
}
export async function pickDestination(name: string): Promise<string | null> {
  if (!native) throw new Error("Open the native app to create a document");
  return save({
    defaultPath: `${name}.mymovie`,
    filters: [{ name: "MyMovie document", extensions: ["mymovie"] }],
  });
}
export const mediaUrl = (_root: string, a: { id: string; path: string }) =>
  native ? `mymovie://localhost/${a.id}` : "";
export const posterUrl = (a: { id: string }) =>
  native ? `mymovie://localhost/${a.id}/thumbnail` : "";
export const jobs = () => call<Job[]>("list_jobs");

export async function exportDestination(name: string): Promise<string | null> {
  if (!native) throw new Error("Open the native app to export setup files");
  return save({
    defaultPath: name,
    filters: [{ name: "Workflow setup", extensions: ["json"] }],
  });
}
