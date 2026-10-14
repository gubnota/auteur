import { useState } from "react";
import type { Workflow, Connection, WorkflowLayout } from "../lib/types";
import { call, exportDestination } from "../lib/bridge";
import { Field, Modal, Toggle, Picker } from "./Controls";
export function WorkflowTarget({
  workflow,
  connection,
  prepare,
  notify,
}: {
  workflow: Workflow;
  connection?: Connection;
  prepare: (w: string, c: string, layout?: WorkflowLayout) => Promise<void>;
  notify: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const [layout, setLayout] = useState<WorkflowLayout | null>(null);
  const profile = workflow.profiles?.find(
    (p) => p.connectionId === connection?.id,
  );
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setFailure("");
    try {
      await fn();
    } catch (e) {
      setFailure(String(e));
    } finally {
      setBusy(false);
    }
  };
  const download = (editor: boolean) =>
    act(async () => {
      const path = await exportDestination(
        `${workflow.name}${editor ? "_editor" : "_api"}.json`,
      );
      if (path) {
        await call("export_workflow", {
          workflowId: workflow.id,
          connectionId: connection?.id ?? "",
          editor,
          path,
        });
        notify("Workflow exported");
      }
    });
  return (
    <section className="workflow-target">
      <p>
        {connection?.kind === "runninghub"
          ? "RunningHub uses your saved hosted deployment and input mapping."
          : profile
            ? `Prepared · ${profile.inputs.length} inputs · ${profile.outputs.length} outputs`
            : "Prepare once to discover inputs from this instance."}
      </p>
      <div className="jobs-toolbar">
        {profile && (
          <button
            disabled={busy}
            onClick={() =>
              setLayout({
                inputs: profile.inputs.map((d) => ({
                  nodeId: d.binding.nodeId,
                  input: d.binding.input,
                  label: d.label,
                  group: "",
                  hidden: false,
                  advanced: d.advanced,
                  mediaRole: d.binding.media?.role,
                  ...workflow.layout?.inputs.find(
                    (l) =>
                      l.nodeId === d.binding.nodeId &&
                      l.input === d.binding.input,
                  ),
                })),
                outputs: profile.outputs.map((d) => ({
                  nodeId: d.nodeId,
                  label: d.label,
                  selected: true,
                  ...workflow.layout?.outputs.find(
                    (l) => l.nodeId === d.nodeId,
                  ),
                })),
              })
            }
          >
            Customize input form
          </button>
        )}
        {connection && ["comfyui", "relay"].includes(connection.kind) && (
          <button
            disabled={busy}
            onClick={() => void act(() => prepare(workflow.id, connection.id))}
          >
            {busy ? "Preparing…" : "Prepare / refresh inputs"}
          </button>
        )}
        <details className="workflow-tools">
          <summary>Workflow tools</summary>
          <div className="jobs-toolbar">
            {workflow.editorGraph &&
              connection &&
              ["comfyui", "relay"].includes(connection.kind) && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      const receipt = await call<{ libraryPath: string }>(
                        "install_workflow",
                        {
                          workflowId: workflow.id,
                          connectionId: connection.id,
                        },
                      );
                      notify(`Saved in ComfyUI: ${receipt.libraryPath}`);
                    })
                  }
                >
                  Install in ComfyUI
                </button>
              )}
            <button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await call("catalogue_workflow", { workflowId: workflow.id });
                  notify("Saved in workflow catalogue");
                })
              }
            >
              Save to catalogue
            </button>
            {workflow.editorGraph && (
              <button disabled={busy} onClick={() => void download(true)}>
                Export editor
              </button>
            )}
            {(profile || Object.keys(workflow.graph).length > 0) && (
              <button disabled={busy} onClick={() => void download(false)}>
                Export API
              </button>
            )}
          </div>
        </details>
      </div>
      {busy && (
        <p role="status">
          Working with the selected instance. No generation is submitted.
        </p>
      )}
      {failure && (
        <p className="error" role="alert">
          {failure}
        </p>
      )}
      {layout && (
        <Modal title="Reusable workflow form" onClose={() => setLayout(null)}>
          <p className="muted">
            Labels and grouping stay with this workflow. Hidden inputs remain
            available in Advanced and keep their values.
          </p>
          {layout.inputs.map((l, index) => (
            <article className="jobs-input" key={`${l.nodeId}.${l.input}`}>
              <small>
                {l.nodeId}.{l.input}
              </small>
              <Field
                label="Input label"
                value={l.label}
                onChange={(label) =>
                  setLayout({
                    ...layout,
                    inputs: layout.inputs.map((x, n) =>
                      n === index ? { ...x, label } : x,
                    ),
                  })
                }
              />
              <Field
                label="Group"
                value={l.group}
                onChange={(group) =>
                  setLayout({
                    ...layout,
                    inputs: layout.inputs.map((x, n) =>
                      n === index ? { ...x, group } : x,
                    ),
                  })
                }
              />
              {profile?.inputs.find(
                (d) =>
                  d.binding.nodeId === l.nodeId && d.binding.input === l.input,
              )?.binding.media && (
                <Picker
                  title="Media role"
                  value={l.mediaRole ?? "referenceImage"}
                  options={(profile?.inputs.find(
                    (d) =>
                      d.binding.nodeId === l.nodeId &&
                      d.binding.input === l.input,
                  )?.binding.media?.kind === "video"
                    ? ["referenceVideo"]
                    : profile?.inputs.find(
                          (d) =>
                            d.binding.nodeId === l.nodeId &&
                            d.binding.input === l.input,
                        )?.binding.media?.kind === "audio"
                      ? ["referenceAudio"]
                      : [
                          "sourceImage",
                          "referenceImage",
                          "startFrame",
                          "endFrame",
                          "mask",
                          "characterReference",
                        ]
                  ).map((id) => ({ id, label: id.replace(/([A-Z])/g, " $1") }))}
                  onChange={(mediaRole) =>
                    setLayout({
                      ...layout,
                      inputs: layout.inputs.map((x, n) =>
                        n === index ? { ...x, mediaRole } : x,
                      ),
                    })
                  }
                />
              )}
              <Toggle
                label="Show in Advanced"
                checked={l.advanced}
                onChange={(advanced) =>
                  setLayout({
                    ...layout,
                    inputs: layout.inputs.map((x, n) =>
                      n === index ? { ...x, advanced } : x,
                    ),
                  })
                }
              />
              <Toggle
                label="Hide in main form"
                checked={l.hidden}
                onChange={(hidden) =>
                  setLayout({
                    ...layout,
                    inputs: layout.inputs.map((x, n) =>
                      n === index ? { ...x, hidden } : x,
                    ),
                  })
                }
              />
            </article>
          ))}
          {!!layout.outputs.length && (
            <p>
              ComfyUI output nodes run normally; choose which results to
              collect. Providers without output-node metadata return all
              results.
            </p>
          )}
          {layout.outputs.map((l, index) => (
            <article className="jobs-input" key={l.nodeId}>
              <Field
                label={`Output ${l.nodeId} label`}
                value={l.label}
                onChange={(label) =>
                  setLayout({
                    ...layout,
                    outputs: layout.outputs.map((x, n) =>
                      n === index ? { ...x, label } : x,
                    ),
                  })
                }
              />
              <Toggle
                label={`Collect output ${l.nodeId}`}
                checked={l.selected}
                onChange={(selected) =>
                  setLayout({
                    ...layout,
                    outputs: layout.outputs.map((x, n) =>
                      n === index ? { ...x, selected } : x,
                    ),
                  })
                }
              />
            </article>
          ))}
          <button
            className="primary"
            disabled={
              busy ||
              layout.inputs.some((l) => !l.label.trim()) ||
              (layout.outputs.length > 0 &&
                !layout.outputs.some((l) => l.selected))
            }
            onClick={() =>
              void act(async () => {
                await prepare(workflow.id, connection?.id ?? "", layout);
                setLayout(null);
              })
            }
          >
            Save reusable form
          </button>
        </Modal>
      )}
    </section>
  );
}
