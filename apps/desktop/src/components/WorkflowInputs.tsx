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
  swapMediaInputs,
} from "../lib/job-inputs";
import { ratios } from "../lib/types";
import { Field, Modal, Picker, Toggle } from "./Controls";
import { Media } from "./Media";
import { MediaPicker } from "./MediaPicker";
export function WorkflowInputs({
  p,
  draft,
  item,
  workflow: w,
  edit,
  error,
  root = "",
  importMedia,
  configure,
}: {
  configure: () => void;
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
  const [advanced, setAdvanced] = useState(false);
  const [hidden, setHidden] = useState(false);
  const images = bindings.filter(
    (b) => b.media?.kind === "image" && b.media.role !== "mask",
  );
  const [dimensionNode, setDimensionNode] = useState("");
  const axis = (b: Binding) => b.input.split(".").at(-1);
  const dimensionKey = (b: Binding) =>
    `${b.nodeId}:${b.input.split(".").slice(0, -1).join(".")}`;
  const dimensionNodes = [
    ...new Set(
      bindings
        .filter(
          (b) =>
            axis(b) === "width" &&
            b.valueType === "number" &&
            bindings.some(
              (h) =>
                dimensionKey(h) === dimensionKey(b) &&
                axis(h) === "height" &&
                h.valueType === "number",
            ),
        )
        .map(dimensionKey),
    ),
  ];
  const selectedDimensions = dimensionNodes.includes(dimensionNode)
    ? dimensionNode
    : dimensionNodes[0];
  const dimensions = bindings.filter(
    (b) =>
      dimensionKey(b) === selectedDimensions &&
      ["width", "height"].includes(axis(b) ?? "") &&
      b.valueType === "number",
  );
  const [ratio, setRatio] = useState(() => {
    const value = (axisName: string) => {
      const b = dimensions.find((b) => axis(b) === axisName);
      return b
        ? Number(item.values[b.semantic] ?? w.graph[b.nodeId]?.inputs[b.input])
        : NaN;
    };
    const savedRatio = value("width") / value("height");
    return (
      ratios.find((choice) => {
        const [width, height] = choice.split(":").map(Number);
        return Math.abs(savedRatio / (width / height) - 1) < 0.015;
      }) ?? p.ratio
    );
  });
  const refs = castImages(p, draft.frameId, draft.context?.characterIds);
  const defaultValue = (b: Binding) => w.graph[b.nodeId]?.inputs[b.input];
  return (
    <section className="jobs-inputs">
      <div className="jobs-toolbar">
        <h2>Exact inputs</h2>
        <button onClick={configure}>Configure workflow inputs</button>
      </div>
      {images.length === 2 && (
        <button
          className="swap-inputs"
          onClick={() =>
            edit((i) => {
              const [a, b] = images.map((b) => b.semantic);
              swapMediaInputs(i, a, b);
            })
          }
        >
          Swap the two image inputs
        </button>
      )}
      {!bindings.length && (
        <p className="muted">
          This graph uses its imported defaults. Configure reusable inputs in
          Workflows.
        </p>
      )}
      {!!dimensions.length && (
        <section className="workflow-ratio">
          {dimensionNodes.length > 1 && (
            <Picker
              title="Dimension node"
              value={selectedDimensions}
              options={dimensionNodes.map((id) => ({
                id,
                label: `${id} · ${w.graph[id.split(":")[0]].class_type}`,
              }))}
              onChange={setDimensionNode}
            />
          )}
          <Picker
            title="Output ratio"
            value={ratio}
            options={ratios.map((id) => ({ id, label: id }))}
            onChange={setRatio}
          />
          <button
            disabled={
              !dimensions.some((b) => axis(b) === "width") ||
              !dimensions.some((b) => axis(b) === "height")
            }
            onClick={() =>
              edit((i) => {
                const [x, y] = ratio.split(":").map(Number);
                const base = Number(
                  i.values[
                    dimensions.find((b) => axis(b) === "width")!.semantic
                  ] ??
                    defaultValue(dimensions.find((b) => axis(b) === "width")!),
                );
                for (const b of dimensions) {
                  const d = w.inputs?.find(
                    (d) =>
                      d.binding.nodeId === b.nodeId &&
                      d.binding.input === b.input,
                  );
                  const step = d?.step ?? 1;
                  const raw = axis(b) === "width" ? base : (base * y) / x;
                  i.values[b.semantic] = Math.max(
                    d?.min ?? step,
                    Math.min(d?.max ?? Infinity, Math.round(raw / step) * step),
                  );
                  delete i.inputText?.[`${b.semantic}:${b.nodeId}.${b.input}`];
                  delete i.inputErrors?.[
                    `${b.semantic}:${b.nodeId}.${b.input}`
                  ];
                }
              })
            }
          >
            Apply ratio to bound dimensions
          </button>
          <p className="generate-ratio-summary">
            {ratio} · Updates width / height fields below. Image-edit workflows
            without dimension controls keep their source framing.
          </p>
        </section>
      )}
      {!!w.inputs?.some((d) => d.advanced || d.hidden) && (
        <Toggle
          label="Show advanced inputs"
          checked={advanced}
          onChange={setAdvanced}
        />
      )}
      {w.inputs?.some((d) => d.hidden) && (
        <Toggle
          label="Show hidden inputs"
          checked={hidden}
          onChange={setHidden}
        />
      )}
      {w.inputs
        ?.filter((d) => d.control === "unsupported" && (advanced || !d.hidden))
        .map((d) => (
          <p key={d.binding.semantic} className="muted">
            {d.label}: custom type requires an explicit mapping.
          </p>
        ))}
      {bindings.map((b) => {
        const descriptor = w.inputs?.find(
          (d) => d.binding.nodeId === b.nodeId && d.binding.input === b.input,
        );
        if (descriptor?.hidden ? !hidden : descriptor?.advanced && !advanced)
          return null;
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
                {descriptor?.group && <small>{descriptor.group}</small>}
                <strong>{descriptor?.label ?? b.semantic}</strong>
                <small>
                  {w.graph[b.nodeId]?.class_type} · {b.nodeId}.{b.input} ·{" "}
                  {b.valueType}
                </small>
              </div>
              {item.bindings && (
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
              )}
            </div>
            {!mediaBinding(b) && advanced && (
              <small className="muted">
                Imported default:{" "}
                {String(JSON.stringify(defaultValue(b))).slice(0, 180)}
                {String(JSON.stringify(defaultValue(b))).length > 180
                  ? "…"
                  : ""}
              </small>
            )}
            {mediaBinding(b) ? (
              <div
                className="generate-media-slot"
                onDragOver={(e) => {
                  if (
                    e.dataTransfer.types.includes("application/x-mymovie-asset")
                  )
                    e.preventDefault();
                }}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData(
                    "application/x-mymovie-asset",
                  );
                  if (!id) return;
                  e.preventDefault();
                  const a = p.assets.find(
                    (a) =>
                      a.id === id &&
                      !a.archivedAt &&
                      a.kind === (b.media?.kind ?? "image"),
                  );
                  if (a)
                    edit((i) => {
                      i.assets[b.semantic] = id;
                    });
                }}
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
                <MediaPicker
                  title={`Media source for ${descriptor?.label ?? b.semantic}`}
                  root={root}
                  usedIds={Object.entries(item.assets)
                    .filter(([key]) => key !== b.semantic)
                    .map(([, id]) => id)}
                  value={item.assets[b.semantic] ?? ""}
                  assets={
                    b.semantic.startsWith("characterReference") ||
                    b.media?.role === "characterReference"
                      ? refs
                      : p.assets.filter(
                          (a) => a.kind === (b.media?.kind ?? "image"),
                        )
                  }
                  onChange={(ids) =>
                    edit((i) => {
                      if (ids[0]) i.assets[b.semantic] = ids[0];
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
                  (descriptor?.control === "choice" ? (
                    <Picker
                      title={descriptor.label}
                      value={JSON.stringify(value)}
                      options={descriptor.choices.map((v) => ({
                        id: JSON.stringify(v),
                        label: String(v),
                      }))}
                      onChange={(text) =>
                        edit((i) => {
                          i.values[b.semantic] = JSON.parse(text);
                        })
                      }
                    />
                  ) : b.valueType === "boolean" ? (
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
                      label={
                        descriptor?.label ??
                        `${b.semantic} · ${b.nodeId}.${b.input}`
                      }
                      value={
                        item.inputText?.[key] ??
                        (typeof value === "string" && b.valueType !== "json"
                          ? value
                          : (JSON.stringify(value) ?? ""))
                      }
                      multiline={
                        prompt ||
                        descriptor?.control === "multiline" ||
                        b.valueType === "json"
                      }
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
    </section>
  );
}
function XIcon() {
  return <Trash2 size={16} />;
}
