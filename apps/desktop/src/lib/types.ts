export interface Comment {
  id: string;
  text: string;
  createdAt: string;
}
export interface Frame {
  id: string;
  name: string;
  assetId: string | null;
  positivePrompt: string;
  negativePrompt: string;
  includeCommon: boolean;
  ratio: string | null;
  characterIds: string[];
  comments: Comment[];
}
export interface Shot {
  id: string;
  name: string;
  frames: Frame[];
}
export interface Scene {
  id: string;
  name: string;
  positivePrompt: string | null;
  negativePrompt: string | null;
  characterIds?: string[];
  shots: Shot[];
}
export interface Episode {
  id: string;
  name: string;
  scenes: Scene[];
}
export interface Character {
  id: string;
  name: string;
  description: string;
  assetIds: string[];
  revision: number;
}
export interface Asset {
  id: string;
  name: string;
  path: string;
  sha256: string;
  kind: string;
  size: number;
  sourcePath?: string;
}
export interface Binding {
  semantic: string;
  nodeId: string;
  input: string;
  valueType: string;
  media?: {
    kind: "image" | "video" | "audio";
    role: string;
    order: number;
  } | null;
}
export interface Workflow {
  id: string;
  name: string;
  version: string;
  graph: Record<
    string,
    {
      class_type: string;
      inputs: Record<string, unknown>;
      [key: string]: unknown;
    }
  >;
  bindings: Binding[];
  requirements?: { compatibility: string; artifacts: InstallArtifact[] };
  mediaKind?: "image" | "video" | "other";
  editorGraph?: Record<string, unknown>;
  editorHash?: string;
  deployments?: {
    connectionId: string;
    deploymentId: string;
    apiFamily: string;
  }[];
}
export interface Project {
  id: string;
  name: string;
  revision: number;
  ratio: string;
  positivePrompt: string;
  negativePrompt: string;
  episodes: Episode[];
  characters: Character[];
  assets: Asset[];
  workflows: Workflow[];
  jobDrafts?: JobDraft[];
}
export interface Connection {
  id: string;
  name: string;
  kind: string;
  url: string;
  credentialRef: string | null;
  deploymentId: string | null;
  apiFamily: string | null;
  concurrency: number;
  hosting?: "colab" | "kaggle" | null;
}
export interface Job {
  id: string;
  frameId: string;
  workflowId: string;
  workflowVersion: string;
  connectionId: string;
  state: string;
  remoteId: string | null;
  snapshot: unknown;
  results: Asset[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
  runId?: string;
  itemId?: string;
}
export interface Diagnostic {
  id: string;
  level: string;
  message: string;
  createdAt: string;
}
export interface AppSettings {
  connections: Connection[];
  theme: string;
  queueHeight: number;
  storage: Record<string, unknown>;
  notifications: Diagnostic[];
  logs: Diagnostic[];
}
export const uid = () => crypto.randomUUID();
export const ratios = [
  "9:16",
  "16:9",
  "1:1",
  "3:4",
  "4:3",
  "2:3",
  "3:2",
  "21:9",
];
export function makeFrame(n = 1): Frame {
  return {
    id: uid(),
    name: `Frame ${String(n).padStart(2, "0")}`,
    assetId: null,
    positivePrompt: "",
    negativePrompt: "",
    includeCommon: true,
    ratio: null,
    characterIds: [],
    comments: [],
  };
}
export function moveFrame(
  project: Project,
  frameId: string,
  shotId: string,
  index: number,
): Project {
  const p = structuredClone(project);
  let moved: Frame | undefined;
  for (const e of p.episodes)
    for (const s of e.scenes)
      for (const sh of s.shots) {
        const i = sh.frames.findIndex((f) => f.id === frameId);
        if (i >= 0) moved = sh.frames.splice(i, 1)[0];
      }
  if (!moved) throw new Error("Frame no longer exists");
  const target = p.episodes
    .flatMap((e) => e.scenes.flatMap((s) => s.shots))
    .find((s) => s.id === shotId);
  if (!target) throw new Error("Shot no longer exists");
  target.frames.splice(
    Math.max(0, Math.min(index, target.frames.length)),
    0,
    moved,
  );
  return p;
}

export interface JobItem {
  id: string;
  workflowId: string;
  connectionId: string;
  values: Record<string, unknown>;
  inputText?: Record<string, string>;
  inputErrors?: Record<string, string>;
  assets: Record<string, string>;
  bindings?: Binding[] | null;
  deploymentId?: string | null;
  apiFamily?: string | null;
}
export interface JobDraft {
  id: string;
  name: string;
  frameId: string;
  context?: {
    kind: "storyboard" | "standalone";
    mode: string;
    characterIds: string[];
  };
  items: JobItem[];
}
export interface JobRun {
  id: string;
  name: string;
  draftId: string;
  jobIds: string[];
  state: string;
  createdAt: string;
}

export interface InstallArtifact {
  kind: "model" | "plugin" | "wheel";
  category: string;
  target: string;
  sha256: string;
  size: number;
  license: string;
  architecture: string;
  source?: string;
  sourceRef?: string;
  revision?: string;
  stripPrefix?: string;
}
