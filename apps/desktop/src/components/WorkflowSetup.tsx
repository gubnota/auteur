import { WorkflowBootstrap } from "./WorkflowBootstrap";
import { useState } from "react";
import { Field, Modal, Picker } from "./Controls";
import { native, call, exportDestination } from "../lib/bridge";
import type { Workflow, InstallArtifact } from "../lib/types";
import { SourceLink } from "./SourceLink";

export const compatibilityOptions = [
  {
    id: "unspecified",
    label: "Unspecified",
    description: "Inspect dependencies and hardware before running.",
  },
  {
    id: "universal",
    label: "Universal",
    description:
      "Reviewed for multiple backends; installed models and nodes are still required.",
  },
  {
    id: "apple-silicon",
    label: "Apple Silicon only",
    description: "Apple MPS on an ARM Mac.",
  },
  {
    id: "cuda",
    label: "NVIDIA CUDA",
    description: "RunPod, Colab, Kaggle or a CUDA workstation.",
  },
  {
    id: "rocm",
    label: "AMD ROCm",
    description: "A compatible HIP/ROCm runtime.",
  },
  {
    id: "cpu",
    label: "CPU",
    description: "A CPU runtime; GPU execution is not assumed.",
  },
];
export const compatibilityLabel = (w: Workflow) =>
  compatibilityOptions.find(
    (o) => o.id === (w.requirements?.compatibility ?? "unspecified"),
  )?.label ?? "Unspecified";
const blank = (): InstallArtifact => ({
  kind: "model",
  category: "checkpoints",
  target: "",
  sha256: "",
  size: 0,
  license: "",
  architecture: "any",
  source: "",
  sourceRef: "",
  revision: "",
  stripPrefix: "",
});
const relative = (s: string) =>
  !!s &&
  !s.startsWith("/") &&
  !/[\\:]/.test(s) &&
  s.split("/").every((p) => p && p !== "." && p !== "..");
export const dependencyDestination = (a: InstallArtifact) =>
  a.kind === "model"
    ? `$MODELS_DIR/${a.category}/${a.target}`
    : a.kind === "wheel"
      ? `$COMFYUI_DIR/.mymovie-wheels/${a.target}`
      : `$CUSTOM_NODES_DIR/${a.target}`;
export function dependencyError(a: InstallArtifact): string {
  if (
    !relative(a.target) ||
    !relative(a.category) ||
    a.category.includes("/") ||
    (a.stripPrefix && !relative(a.stripPrefix))
  )
    return "Use safe relative destinations inside the effective model/plugin folders.";
  if (
    !/^[a-f\d]{64}$/i.test(a.sha256) ||
    !Number.isSafeInteger(a.size) ||
    a.size <= 0 ||
    a.size > 32 * 1024 ** 3 ||
    !a.license.trim()
  )
    return "Enter the verified SHA256, byte size and authorized license.";
  if (
    a.kind === "plugin" &&
    !/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(a.revision ?? "")
  )
    return "Pin plugins to their full immutable commit.";
  if (a.kind === "wheel" && !a.target.endsWith(".whl"))
    return "Use the exact wheel filename; list its dependencies separately.";
  if (a.sourceRef)
    return a.source || /\s/.test(a.sourceRef)
      ? "Choose a public URL or a private transfer reference."
      : "";
  try {
    const u = new URL(a.source ?? "");
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.search ||
      u.hash
    )
      return "Public sources require HTTPS; private signed URLs belong in secret transfer storage.";
  } catch {
    return "Enter a public HTTPS source or private source reference.";
  }
  return "";
}

export function destinationConflict(
  a: InstallArtifact,
  artifacts: InstallArtifact[],
  editing: number,
): boolean {
  return artifacts.some(
    (other, index) =>
      index !== editing &&
      other.kind === a.kind &&
      other.category === a.category &&
      other.target === a.target,
  );
}

export function WorkflowSetup({
  workflow: w,
  connectionId,
  change,
}: {
  workflow: Workflow;
  connectionId?: string;
  change: (requirements: NonNullable<Workflow["requirements"]>) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null),
    [draft, setDraft] = useState(blank),
    [commands, setCommands] = useState(false),
    [notice, setNotice] = useState("");
  const requirements = w.requirements ?? {
    compatibility: "unspecified",
    artifacts: [],
  };
  const modelNames = [
    ...new Set(
      Object.values(w.graph).flatMap((n) =>
        Object.values(n.inputs).filter(
          (v): v is string =>
            typeof v === "string" &&
            /\.(safetensors|ckpt|pt|pth|onnx|bin|gguf)$/i.test(v),
        ),
      ),
    ),
  ];
  const missing = modelNames.filter(
    (name) =>
      !requirements.artifacts.some(
        (a) => a.kind === "model" && a.target === name,
      ),
  );
  return (
    <section className="workflow-setup">
      <h3>Compatibility & initialization</h3>
      <Picker
        title="Workflow compatibility"
        value={requirements.compatibility}
        options={compatibilityOptions}
        onChange={(compatibility) => change({ ...requirements, compatibility })}
      />
      <p className="muted">
        Restrictions are checked against the node before upload. Universal still
        requires a verified model/plugin inventory.
      </p>
      {missing.length > 0 && (
        <p className="setup-warning">
          Weights to resolve: {missing.join(", ")}. Add their exact source and
          effective ComfyUI category.
        </p>
      )}
      {requirements.artifacts.map((a, i) => (
        <div
          className="setup-dependency"
          key={`${a.kind}:${a.category}:${a.target}`}
        >
          <div>
            <strong>{a.target}</strong>
            <small>
              {a.kind} · {a.category} · {a.architecture}
            </small>
            <small>
              {a.sourceRef ? `Private transfer: ${a.sourceRef}` : a.source}
            </small>
            <small>Destination: {dependencyDestination(a)}</small>
          </div>
          <SourceLink source={a.source} />
          <button
            onClick={() => {
              setDraft({ ...a });
              setEditing(i);
            }}
          >
            Edit
          </button>
          <button
            onClick={() =>
              change({
                ...requirements,
                artifacts: requirements.artifacts.filter(
                  (_, index) => index !== i,
                ),
              })
            }
          >
            Remove
          </button>
        </div>
      ))}
      <div className="row">
        <button
          onClick={() => {
            setDraft(blank());
            setEditing(-1);
          }}
        >
          Add model / plugin / wheel
        </button>
        <button onClick={() => setCommands(true)}>
          Portable setup instructions
        </button>
      </div>
      {editing !== null && (
        <Modal title="Pinned dependency" onClose={() => setEditing(null)}>
          <Picker
            title="Dependency type"
            value={draft.kind}
            options={[
              { id: "model", label: "Model / LoRA / weights" },
              { id: "plugin", label: "Custom node plugin · tar archive" },
              { id: "wheel", label: "Offline Python wheel" },
            ]}
            onChange={(kind) =>
              setDraft({
                ...draft,
                kind: kind as InstallArtifact["kind"],
                category:
                  kind === "plugin"
                    ? "custom_nodes"
                    : kind === "wheel"
                      ? "wheels"
                      : "checkpoints",
              })
            }
          />
          <Field
            label="ComfyUI category"
            value={draft.category}
            onChange={(category) => setDraft({ ...draft, category })}
            placeholder="diffusion_models, text_encoders, vae, loras, checkpoints…"
          />
          <Field
            label="Relative destination / filename"
            value={draft.target}
            onChange={(target) => setDraft({ ...draft, target })}
          />
          <p className="muted">
            Install to <code>{dependencyDestination(draft)}</code>. The agent
            resolves these paths inside the selected instance; no absolute Mac
            paths are exported.
          </p>
          <Field
            label="Public HTTPS download URL · no secrets"
            value={draft.source ?? ""}
            onChange={(source) => setDraft({ ...draft, source, sourceRef: "" })}
          />
          <SourceLink source={draft.source} />
          <Field
            label="Or private S3 transfer object reference"
            value={draft.sourceRef ?? ""}
            onChange={(sourceRef) =>
              setDraft({ ...draft, sourceRef, source: "" })
            }
          />
          <Field
            label="SHA256"
            value={draft.sha256}
            onChange={(sha256) => setDraft({ ...draft, sha256: sha256.trim() })}
          />
          <Field
            label="Size in bytes"
            type="number"
            value={String(draft.size)}
            onChange={(size) => setDraft({ ...draft, size: Number(size) })}
          />
          <Field
            label="License / permission"
            value={draft.license}
            onChange={(license) => setDraft({ ...draft, license })}
          />
          <Picker
            title="Artifact architecture"
            value={draft.architecture}
            options={[
              { id: "any", label: "Any · model / Python source" },
              { id: "x86_64", label: "Linux x86_64" },
              { id: "aarch64", label: "Linux ARM64" },
              { id: "arm64", label: "Apple ARM64" },
            ]}
            onChange={(architecture) => setDraft({ ...draft, architecture })}
          />
          {draft.kind === "plugin" && (
            <>
              <Field
                label="Plugin full commit hash"
                value={draft.revision ?? ""}
                onChange={(revision) => setDraft({ ...draft, revision })}
              />
              <Field
                label="Archive directory prefix to remove (optional)"
                value={draft.stripPrefix ?? ""}
                onChange={(stripPrefix) => setDraft({ ...draft, stripPrefix })}
              />
              <p className="muted">
                Use an immutable source archive. Include every required Python
                dependency as a hashed wheel, including transitive dependencies.
                Install is offline with no automatic dependency resolution.
              </p>
            </>
          )}
          <p className="setup-warning">
            {dependencyError(draft) ||
              (destinationConflict(draft, requirements.artifacts, editing)
                ? "This destination is already configured."
                : "")}
          </p>
          <button
            className="primary"
            disabled={
              !!dependencyError(draft) ||
              destinationConflict(draft, requirements.artifacts, editing)
            }
            onClick={() => {
              const artifacts = [...requirements.artifacts];
              if (editing < 0) artifacts.push(draft);
              else artifacts[editing] = draft;
              change({ ...requirements, artifacts });
              setEditing(null);
            }}
          >
            Save dependency
          </button>
        </Modal>
      )}
      {commands && (
        <WorkflowBootstrap
          workflow={w}
          requirements={requirements}
          connectionId={connectionId ?? ""}
          onClose={() => setCommands(false)}
        />
      )}
    </section>
  );
}
