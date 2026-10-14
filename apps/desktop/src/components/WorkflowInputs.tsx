import { useState } from "react";
import { Plus, Trash2, Upload, ArrowUp, ArrowDown } from "lucide-react";
import type {
  Binding,
  JobDraft,
  JobItem,
  Project,
  Workflow,
} from "../lib/types";
import {
  castImages,
  literalInputs,
  mediaBinding,
  parseInput,
  resolveInputs,
} from "../lib/job-inputs";
import { Field, Modal, Picker, Toggle } from "./Controls";
import { Media } from "../features/Library";
export function WorkflowInputs({
  p,
  draft,
  item,
  workflow: w,
  edit,
  error,
  root = "",
  importMedia,
}: {
  p: Project;
  draft: JobDraft;
  item: JobItem;
  workflow: Workflow;
  edit: (fn: (i: JobItem) => void) => void;
  error: (key: string, message: string) => void;
  root?: string;
  importMedia?: (semantic: string) => Promise<void>;
}) {
  const bindings = item.bindings ?? w.bindings;
  const [adding, setAdding] = useState(false);
  const [field, setField] = useState("");
  const [semantic, setSemantic] = useState("");
  const [type, setType] = useState("string");
  const available = literalInputs(w).filter(
    (x) => !bindings.some((b) => b.nodeId === x.nodeId && b.input === x.input),
  );
  const refs = castImages(p, draft.frameId, draft.context?.characterIds);
  const [mediaKind, setMediaKind] = useState("");
  const [role, setRole] = useState("referenceImage");
  const defaultValue = (b: Binding) => w.graph[b.nodeId]?.inputs[b.input];
  return (
    <section className="jobs-inputs">
      <div className="jobs-toolbar">
        <h2>Exact inputs</h2>
        <button onClick={() => setAdding(true)}>
          <Plus size={16} />
          Bind literal input
        </button>
      </div>
      {!bindings.length && (
        <p className="muted">
          This graph uses its imported defaults. Add explicit bindings to
          configure inputs.
        </p>
      )}
      {bindings.map((b) => {
        let resolved: unknown = defaultValue(b);
        try {
          resolved = resolveInputs(p, draft, { ...item, bindings: [b] }).values[
            b.semantic
          ];
        } catch {
          /* missing sources are explained in readiness */
        }
        const prompt = ["positivePrompt", "negativePrompt"].includes(
          b.semantic,
        );
        const composed =
          prompt &&
          !Object.prototype.hasOwnProperty.call(item.values, b.semantic);
        const value = item.values[b.semantic] ?? resolved;
        const key = `${b.semantic}:${b.nodeId}.${b.input}`;
        return (
          <article className="jobs-input" key={key}>
            <div className="jobs-toolbar">
              <div>
                <strong>{b.semantic}</strong>
                <small>
                  {w.graph[b.nodeId]?.class_type} · {b.nodeId}.{b.input} ·{" "}
                  {b.valueType}
                </small>
              </div>
              <button
                aria-label={`Remove binding ${b.semantic}`}
                onClick={() => {
                  error(key, "");
                  edit((i) => {
                    i.bindings = bindings.filter((x) => x !== b);
                    delete i.values[b.semantic];
                    delete i.inputText?.[key];
                    delete i.inputErrors?.[key];
                    delete i.assets[b.semantic];
                  });
                }}
              >
                <XIcon />
              </button>
            </div>
            <small className="muted">
              Imported default: {JSON.stringify(defaultValue(b))}
            </small>
            {mediaBinding(b) ? (
              <div
                className="generate-media-slot"
                data-file-drop="generate"
                data-draft-id={draft.id}
                data-item-id={item.id}
                data-semantic={b.semantic}
                data-media-kind={b.media?.kind ?? "image"}
              >
                {p.assets.find((a) => a.id === item.assets[b.semantic]) && (
                  <Media
                    asset={p.assets.find(
                      (a) => a.id === item.assets[b.semantic],
                    )!}
                    root={root}
                  />
                )}
                <small>
                  {b.media?.role ?? b.semantic} · Drop{" "}
                  {b.media?.kind ?? "image"} here
                </small>
                <Picker
                  title={`Media source for ${b.semantic}`}
                  value={item.assets[b.semantic] ?? ""}
                  options={[
                    {
                      id: "",
                      label:
                        b.semantic === "image"
                          ? "Use keyframe image"
                          : b.semantic.startsWith("characterReference")
                            ? "Use assigned cast reference"
                            : "Choose image",
                    },
                    ...(b.semantic.startsWith("characterReference") ||
                    b.media?.role === "characterReference"
                      ? refs
                      : p.assets.filter(
                          (a) => a.kind === (b.media?.kind ?? "image"),
                        )
                    ).map((a) => ({
                      id: a.id,
                      label: a.name,
                      description: a.sha256.slice(0, 12),
                    })),
                  ]}
                  onChange={(id) =>
                    edit((i) => {
                      if (id) i.assets[b.semantic] = id;
                      else delete i.assets[b.semantic];
                    })
                  }
                />
                <div className="jobs-toolbar">
                  {importMedia && (
                    <button onClick={() => void importMedia(b.semantic)}>
                      <Upload size={16} />
                      Import / replace
                    </button>
                  )}
                  <button
                    disabled={!item.assets[b.semantic]}
                    onClick={() =>
                      edit((i) => {
                        delete i.assets[b.semantic];
                      })
                    }
                  >
                    Clear media
                  </button>
                  {b.media && (
                    <>
                      <button
                        aria-label={`Move ${b.semantic} earlier`}
                        onClick={() =>
                          edit((i) => {
                            const list = [...bindings];
                            const n = list.indexOf(b);
                            if (n > 0)
                              [list[n - 1], list[n]] = [list[n], list[n - 1]];
                            i.bindings = list.map((x, order) =>
                              x.media
                                ? { ...x, media: { ...x.media, order } }
                                : x,
                            );
                          })
                        }
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        aria-label={`Move ${b.semantic} later`}
                        onClick={() =>
                          edit((i) => {
                            const list = [...bindings];
                            const n = list.indexOf(b);
                            if (n < list.length - 1)
                              [list[n + 1], list[n]] = [list[n], list[n + 1]];
                            i.bindings = list.map((x, order) =>
                              x.media
                                ? { ...x, media: { ...x.media, order } }
                                : x,
                            );
                          })
                        }
                      >
                        <ArrowDown size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <>
                {prompt && (
                  <Toggle
                    label="Use composed project / scene / keyframe prompt"
                    checked={composed}
                    onChange={(checked) => {
                      error(key, "");
                      edit((i) => {
                        if (checked) delete i.values[b.semantic];
                        else i.values[b.semantic] = resolved;
                        delete i.inputText?.[key];
                        delete i.inputErrors?.[key];
                      });
                    }}
                  />
                )}
                {!composed &&
                  (b.valueType === "boolean" ? (
                    <Toggle
                      label={b.semantic}
                      checked={value === true}
                      onChange={(v) =>
                        edit((i) => {
                          i.values[b.semantic] = v;
                        })
                      }
                    />
                  ) : (
                    <Field
                      label={`${b.semantic} · ${b.nodeId}.${b.input}`}
                      value={
                        item.inputText?.[key] ??
                        (typeof value === "string" && b.valueType !== "json"
                          ? value
                          : (JSON.stringify(value) ?? ""))
                      }
                      multiline={prompt || b.valueType === "json"}
                      onChange={(text) => {
                        try {
                          const v = parseInput(b.valueType, text);
                          error(key, "");
                          edit((i) => {
                            i.values[b.semantic] = v;
                            (i.inputText ??= {})[key] = text;
                            delete i.inputErrors?.[key];
                          });
                        } catch (e) {
                          const message = `${b.semantic}: ${(e as Error).message}`;
                          error(key, message);
                          edit((i) => {
                            (i.inputText ??= {})[key] = text;
                            (i.inputErrors ??= {})[key] = message;
                          });
                        }
                      }}
                    />
                  ))}
                {composed && (
                  <p className="jobs-composed">{String(resolved)}</p>
                )}
                {!prompt &&
                  Object.prototype.hasOwnProperty.call(
                    item.values,
                    b.semantic,
                  ) && (
                    <button
                      className="text-button"
                      onClick={() => {
                        error(key, "");
                        edit((i) => {
                          delete i.values[b.semantic];
                          delete i.inputText?.[key];
                          delete i.inputErrors?.[key];
                        });
                      }}
                    >
                      Use imported default
                    </button>
                  )}
              </>
            )}
          </article>
        );
      })}
      {adding && (
        <Modal
          title="Bind a literal workflow input"
          onClose={() => setAdding(false)}
        >
          <p>
            Connected inputs stay linked. Bindings apply to this job item; the
            imported graph remains unchanged.
          </p>
          <Picker
            title="Node input"
            value={field}
            options={available.map((x) => ({
              id: JSON.stringify([x.nodeId, x.input]),
              label: `${x.nodeId}.${x.input}`,
              description: `${x.classType} · ${JSON.stringify(x.value)}`,
            }))}
            onChange={(v) => {
              setField(v);
              const [n, i] = JSON.parse(v);
              const val = w.graph[n].inputs[i];
              setType(
                typeof val === "number"
                  ? "number"
                  : typeof val === "boolean"
                    ? "boolean"
                    : typeof val === "string"
                      ? "string"
                      : "json",
              );
            }}
          />
          <Field
            label="Semantic input name"
            value={semantic}
            onChange={setSemantic}
            placeholder="seed, width, fps, image, mask, characterReference1…"
          />
          <Picker
            title="Input type"
            value={type}
            options={["string", "number", "boolean", "json"].map((t) => ({
              id: t,
              label: t,
            }))}
            onChange={setType}
          />
          <Picker
            title="Media slot"
            value={mediaKind}
            options={[
              { id: "", label: "Literal value" },
              ...["image", "video", "audio"].map((id) => ({
                id,
                label: `${id} file`,
              })),
            ]}
            onChange={(kind) => {
              setMediaKind(kind);
              if (kind) setType("string");
              setRole(
                kind === "audio"
                  ? "referenceAudio"
                  : kind === "video"
                    ? "referenceVideo"
                    : "referenceImage",
              );
            }}
          />
          {mediaKind && (
            <Picker
              title="Media role"
              value={role}
              options={(mediaKind === "image"
                ? [
                    "startFrame",
                    "endFrame",
                    "referenceImage",
                    "mask",
                    "characterReference",
                  ]
                : mediaKind === "video"
                  ? ["referenceVideo"]
                  : ["referenceAudio"]
              ).map((id) => ({ id, label: id.replace(/([A-Z])/g, " $1") }))}
              onChange={setRole}
            />
          )}
          <button
            className="primary"
            disabled={
              !field ||
              !semantic.trim() ||
              bindings.some((b) => b.semantic === semantic.trim())
            }
            onClick={() => {
              const [nodeId, input] = JSON.parse(field);
              edit((i) => {
                i.bindings = [
                  ...bindings,
                  {
                    semantic: semantic.trim(),
                    nodeId,
                    input,
                    valueType: mediaKind ? "string" : type,
                    ...(mediaKind
                      ? {
                          media: {
                            kind: mediaKind as "image" | "video" | "audio",
                            role,
                            order: bindings.length,
                          },
                        }
                      : {}),
                  },
                ];
              });
              setAdding(false);
              setField("");
              setSemantic("");
            }}
          >
            Add binding
          </button>
        </Modal>
      )}
    </section>
  );
}
function XIcon() {
  return <Trash2 size={16} />;
}
