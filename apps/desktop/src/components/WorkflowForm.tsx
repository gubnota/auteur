import { useState } from "react";
import type { Binding, Workflow, WorkflowLayout } from "../lib/types";
import { literalInputs, workflowForTarget } from "../lib/job-inputs";
import { Field, Picker, Toggle } from "./Controls";

/** Reusable public inputs belong to the workflow, independently of each job. */
export function WorkflowForm({
  workflow,
  connectionId,
  save,
}: {
  workflow: Workflow;
  connectionId: string;
  save: (bindings: Binding[], layout: WorkflowLayout) => Promise<void>;
}) {
  const w = workflowForTarget(workflow, connectionId)!;
  const [bindings, setBindings] = useState(w.bindings);
  const [layout, setLayout] = useState<WorkflowLayout>(
    workflow.layout ?? { inputs: [], outputs: [] },
  );
  const [field, setField] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const fields = literalInputs(w);
  const patch = (n: number, value: Partial<Binding>) =>
    setBindings((bs) => bs.map((b, i) => (i === n ? { ...b, ...value } : b)));
  return (
    <section className="workflow-form">
      <h3>Reusable inputs</h3>
      <p className="muted">
        Set these once. Every new job uses these slots. Node metadata is
        verified only after preparation on a compatible node.
      </p>
      <Picker
        title="Select literal input"
        value={field}
        options={fields.map((f) => {
          const used = bindings.find(
            (b) => b.nodeId === f.nodeId && b.input === f.input,
          );
          const consumers = Object.values(w.graph).some((n) =>
            Object.values(n.inputs).some(
              (v) => Array.isArray(v) && v[0] === f.nodeId,
            ),
          );
          return {
            id: JSON.stringify([f.nodeId, f.input]),
            label: `${f.nodeId}.${f.input} · ${f.classType}`,
            description: used
              ? `Used as ${used.semantic}`
              : `${!consumers && /LoadImage|LoadAudio|LoadVideo/.test(f.classType) ? "Unused loader · advanced setup · " : ""}${JSON.stringify(f.value).slice(0, 100)}`,
          };
        })}
        onChange={setField}
      />
      <button
        disabled={
          !field ||
          bindings.some((b) => JSON.stringify([b.nodeId, b.input]) === field)
        }
        onClick={() => {
          const [nodeId, input] = JSON.parse(field);
          const f = fields.find(
            (f) => f.nodeId === nodeId && f.input === input,
          )!;
          const descriptor = w.inputs?.find(
            (d) => d.binding.nodeId === nodeId && d.binding.input === input,
          );
          const kind =
            /LoadImage/.test(f.classType) && input === "image"
              ? "image"
              : /LoadAudio/.test(f.classType) && input === "audio"
                ? "audio"
                : /LoadVideo/.test(f.classType) && input === "video"
                  ? "video"
                  : undefined;
          setBindings((bs) => [
            ...bs,
            {
              semantic: `${nodeId}.${input}`,
              nodeId,
              input,
              valueType:
                descriptor?.binding.valueType ??
                (typeof f.value === "number"
                  ? "number"
                  : typeof f.value === "boolean"
                    ? "boolean"
                    : typeof f.value === "string"
                      ? "string"
                      : "json"),
              ...(kind
                ? {
                    media: {
                      kind,
                      role: `reference${kind[0].toUpperCase()}${kind.slice(1)}`,
                      order: bs.length,
                    },
                  }
                : {}),
            },
          ]);
        }}
      >
        Expose selected input
      </button>
      {bindings.map((b, n) => {
        const l = layout.inputs.find(
          (l) => l.nodeId === b.nodeId && l.input === b.input,
        );
        const changeLayout = (
          value: Partial<WorkflowLayout["inputs"][number]>,
        ) =>
          setLayout((old) => ({
            ...old,
            inputs: [
              ...old.inputs.filter(
                (l) => l.nodeId !== b.nodeId || l.input !== b.input,
              ),
              {
                nodeId: b.nodeId,
                input: b.input,
                label: l?.label ?? b.semantic,
                group: l?.group ?? "",
                hidden: l?.hidden ?? false,
                advanced: l?.advanced ?? false,
                ...value,
              },
            ],
          }));
        return (
          <details className="jobs-input" key={`${b.nodeId}.${b.input}`}>
            <summary>
              {l?.label ?? b.semantic} · {b.nodeId}.{b.input}
              {l?.hidden ? " · Hidden" : l?.advanced ? " · Advanced" : ""}
            </summary>
            <div className="row">
              <strong>
                {b.nodeId}.{b.input}
              </strong>
              <button
                onClick={() => {
                  changeLayout({ hidden: true });
                  setBindings((bs) => bs.filter((_, i) => i !== n));
                }}
              >
                Remove input
              </button>
            </div>
            <Field
              label="Stable input key"
              value={b.semantic}
              onChange={(semantic) => patch(n, { semantic })}
            />
            <Field
              label="Display label"
              value={l?.label ?? b.semantic}
              onChange={(label) => changeLayout({ label })}
            />
            <Picker
              title="Input type"
              value={b.media?.kind ?? b.valueType}
              options={[
                "image",
                "video",
                "audio",
                "string",
                "number",
                "boolean",
                "json",
              ].map((id) => ({ id, label: id }))}
              onChange={(type) => {
                changeLayout({ mediaRole: undefined });
                patch(
                  n,
                  ["image", "video", "audio"].includes(type)
                    ? {
                        valueType: "string",
                        media: {
                          kind: type as "image" | "video" | "audio",
                          role: `reference${type[0].toUpperCase()}${type.slice(1)}`,
                          order: n,
                        },
                      }
                    : { valueType: type, media: null },
                );
              }}
            />
            {b.media && (
              <Picker
                title="Media role"
                value={b.media.role}
                options={(b.media.kind === "image"
                  ? [
                      "sourceImage",
                      "referenceImage",
                      "startFrame",
                      "endFrame",
                      "mask",
                      "characterReference",
                    ]
                  : b.media.kind === "video"
                    ? ["sourceVideo", "referenceVideo"]
                    : ["sourceAudio", "referenceAudio"]
                ).map((id) => ({ id, label: id.replace(/([A-Z])/g, " $1") }))}
                onChange={(role) => {
                  patch(n, { media: { ...b.media!, role } });
                  changeLayout({ mediaRole: role });
                }}
              />
            )}
            <Toggle
              label="Advanced"
              checked={l?.advanced ?? false}
              onChange={(advanced) => changeLayout({ advanced })}
            />
            <Toggle
              label="Hidden (retains its value)"
              checked={l?.hidden ?? false}
              onChange={(hidden) => changeLayout({ hidden })}
            />
          </details>
        );
      })}
      {error && <p role="alert">{error}</p>}
      <button
        className="primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await save(bindings, layout);
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        Save reusable inputs
      </button>
    </section>
  );
}
