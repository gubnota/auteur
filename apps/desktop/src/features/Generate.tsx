import { useState } from "react";
import {
  Plus,
  ListChecks,
  ImagePlus,
  Video,
  WandSparkles,
  FolderOpen,
  Trash2,
} from "lucide-react";
import type { Update } from "../App";
import type { AppSettings, JobDraft, JobItem, Project } from "../lib/types";
import { newJobDraft } from "./Jobs";
import { WorkflowInputs } from "../components/WorkflowInputs";
import { Field, Picker, Toggle } from "../components/Controls";
import { WorkflowTarget } from "../components/WorkflowTarget";
import { readiness, workflowForTarget } from "../lib/job-inputs";
import { compatibilityLabel } from "../components/WorkflowSetup";
import { Media } from "./Library";
const modes = [
  { id: "image-create", label: "Image create", kind: "image" },
  { id: "image-edit", label: "Image edit", kind: "image" },
  { id: "t2v", label: "Text to video", kind: "video" },
  { id: "i2v", label: "Image to video", kind: "video" },
  { id: "v2v", label: "Video to video", kind: "video" },
  { id: "a2v", label: "Audio to video", kind: "video" },
  { id: "multi-ref", label: "Multi-reference", kind: "other" },
  { id: "custom", label: "Custom", kind: "other" },
];
export function Generate({
  project: p,
  settings,
  root,
  update,
  selectedId,
  select,
  review,
  importMedia,
  importWorkflow,
  prepare,
  notify,
  enqueue,
}: {
  enqueue: (id: string) => Promise<void>;
  project: Project;
  settings: AppSettings;
  root: string;
  update: Update;
  selectedId: string;
  select: (id: string) => void;
  review: (id: string) => void;
  importMedia: (
    draftId: string,
    itemId: string,
    semantic: string,
  ) => Promise<void>;
  importWorkflow: () => void;
  prepare: (
    w: string,
    c: string,
    layout?: import("../lib/types").WorkflowLayout,
  ) => Promise<void>;
  notify: (message: string) => void;
}) {
  const drafts = (p.jobDrafts ?? []).filter(
    (d) => d.context?.kind === "standalone",
  );
  const draft = drafts.find((d) => d.id === selectedId) ?? drafts[0];
  const [itemId, setItemId] = useState("");
  const [queueing, setQueueing] = useState(false);
  const item = draft?.items.find((i) => i.id === itemId) ?? draft?.items[0];
  const sourceWorkflow = p.workflows.find((w) => w.id === item?.workflowId);
  const workflow = workflowForTarget(sourceWorkflow, item?.connectionId ?? "");
  const mode = modes.find((m) => m.id === draft?.context?.mode) ?? modes[0];
  const editDraft = (fn: (d: JobDraft) => void) => {
    if (draft)
      update((p) => {
        const d = p.jobDrafts?.find((d) => d.id === draft.id);
        if (d) fn(d);
      });
  };
  const editItem = (fn: (i: JobItem) => void) =>
    editDraft((d) => {
      const i = d.items.find((i) => i.id === item?.id);
      if (i) fn(i);
    });
  const add = () => {
    const d = newJobDraft(p, settings);
    d.context!.mode = mode.id;
    update((p) => {
      (p.jobDrafts ??= []).push(d);
    });
    select(d.id);
  };
  const issues = draft ? readiness(p, settings, draft) : [];
  const results = p.assets
    .filter((a) => ["image", "video"].includes(a.kind))
    .slice(-4)
    .reverse();
  return (
    <div className="generate-page">
      <header className="page-title">
        <div>
          <p className="eyebrow">YOUR GENERATION WORKSPACE</p>
          <h1>Generate</h1>
          <p className="muted">
            Create and edit media with your workflows. Queue one node or run
            across several.
          </p>
        </div>
        <button className="primary" onClick={add}>
          <Plus size={18} />
          New generation
        </button>
      </header>
      <div
        className="generate-modes"
        role="tablist"
        aria-label="Generation mode"
      >
        {modes.map((m) => (
          <button
            role="tab"
            aria-selected={mode.id === m.id}
            className={mode.id === m.id ? "selected" : ""}
            key={m.id}
            onClick={() => {
              if (!draft) {
                const d = newJobDraft(p, settings);
                d.context!.mode = m.id;
                update((p) => {
                  (p.jobDrafts ??= []).push(d);
                });
                select(d.id);
              } else
                editDraft((d) => {
                  d.context!.mode = m.id;
                });
            }}
          >
            {m.kind === "video" ? (
              <Video size={17} />
            ) : m.kind === "image" ? (
              <ImagePlus size={17} />
            ) : (
              <WandSparkles size={17} />
            )}{" "}
            {m.label}
          </button>
        ))}
      </div>
      {!draft ? (
        <section className="panel generate-welcome">
          <WandSparkles size={40} />
          <h2>Start with a workflow</h2>
          <p>
            Choose a saved workflow, bind its exact inputs and add your own
            media. Each batch can target different nodes.
          </p>
          <div className="row">
            <button onClick={importWorkflow}>
              <FolderOpen size={18} />
              Import workflow
            </button>
            <button className="primary" onClick={add}>
              Create a generation draft
            </button>
          </div>
        </section>
      ) : (
        <>
          <div className="generate-layout">
            <section className="panel generate-composer">
              <Picker
                title="Saved generation"
                value={draft.id}
                options={drafts.map((d) => ({
                  id: d.id,
                  label: d.name,
                  description: `${d.items.length} workflow items`,
                }))}
                onChange={select}
              />
              <Field
                label="Generation name"
                value={draft.name}
                onChange={(name) =>
                  editDraft((d) => {
                    d.name = name || "Untitled generation";
                  })
                }
              />
              <div className="jobs-item-strip">
                {draft.items.map((i, n) => (
                  <button
                    key={i.id}
                    className={i.id === item?.id ? "selected" : ""}
                    onClick={() => setItemId(i.id)}
                  >
                    {n + 1}.{" "}
                    {p.workflows.find((w) => w.id === i.workflowId)?.name ??
                      "Workflow"}
                  </button>
                ))}
                <button
                  onClick={() =>
                    editDraft((d) => {
                      const next = newJobDraft(p, settings).items[0];
                      d.items.push(next);
                      setItemId(next.id);
                    })
                  }
                >
                  <Plus size={16} />
                  Add to batch
                </button>
              </div>
              {item && (
                <div className="row">
                  <span className="muted">
                    Selected item {draft.items.indexOf(item) + 1} of{" "}
                    {draft.items.length}
                  </span>
                  <button
                    onClick={() => {
                      const index = draft.items.findIndex(
                        (i) => i.id === item.id,
                      );
                      const remaining = draft.items.filter(
                        (i) => i.id !== item.id,
                      );
                      editDraft((d) => {
                        d.items = d.items.filter((i) => i.id !== item.id);
                      });
                      setItemId(
                        remaining[Math.min(index, remaining.length - 1)]?.id ??
                          "",
                      );
                    }}
                  >
                    <Trash2 size={16} /> Remove selected item
                  </button>
                </div>
              )}
              {draft.items.length === 0 && (
                <p className="muted">
                  This batch is empty. Use Add to batch to choose a workflow.
                </p>
              )}
              {item && (
                <>
                  <Picker
                    title="Workflow"
                    value={item.workflowId}
                    options={p.workflows.map((w) => ({
                      id: w.id,
                      label: w.name,
                      description: `${compatibilityLabel(w)} · ${w.mediaKind ?? "other"}${w.mediaKind === mode.kind || mode.kind === "other" ? " · matches mode" : " · check compatibility"} · ${w.version.slice(0, 12)}`,
                    }))}
                    onChange={(workflowId) =>
                      editItem((i) => {
                        i.workflowId = workflowId;
                        i.values = {};
                        i.assets = {};
                        i.bindings = null;
                        i.inputText = {};
                        i.inputErrors = {};
                        i.deploymentId = null;
                        i.apiFamily = null;
                      })
                    }
                  />
                  <button className="text-button" onClick={importWorkflow}>
                    Browse workflow catalogue
                  </button>
                  <Picker
                    title="Execution node"
                    value={item.connectionId}
                    options={settings.connections
                      .filter((c) =>
                        ["comfyui", "relay", "runninghub"].includes(c.kind),
                      )
                      .map((c) => ({
                        id: c.id,
                        label: c.name,
                        description:
                          c.kind === "comfyui"
                            ? "Automatic FIFO queue"
                            : c.kind,
                      }))}
                    onChange={(connectionId) =>
                      editItem((i) => {
                        i.connectionId = connectionId;
                        i.bindings = undefined;
                        i.inputText = {};
                        i.inputErrors = {};
                        i.deploymentId = null;
                        i.apiFamily = null;
                      })
                    }
                  />
                  {!!p.characters.length && (
                    <details>
                      <summary>Character references</summary>
                      {p.characters.map((c) => (
                        <Toggle
                          key={c.id}
                          label={c.name}
                          checked={draft.context!.characterIds.includes(c.id)}
                          onChange={(checked) =>
                            editDraft((d) => {
                              d.context!.characterIds = checked
                                ? [...d.context!.characterIds, c.id]
                                : d.context!.characterIds.filter(
                                    (id) => id !== c.id,
                                  );
                            })
                          }
                        />
                      ))}
                    </details>
                  )}
                  {workflow && (
                    <>
                      {sourceWorkflow && (
                        <WorkflowTarget
                          workflow={sourceWorkflow}
                          connection={settings.connections.find(
                            (c) => c.id === item.connectionId,
                          )}
                          prepare={prepare}
                          notify={notify}
                        />
                      )}
                      <WorkflowInputs
                        key={`${draft.id}:${item.id}:${workflow.id}`}
                        p={p}
                        draft={draft}
                        item={item}
                        workflow={workflow}
                        root={root}
                        edit={editItem}
                        error={() => {}}
                        importMedia={async (semantic) => {
                          try {
                            await importMedia(draft.id, item.id, semantic);
                          } catch (e) {
                            notify(String(e));
                          }
                        }}
                      />
                    </>
                  )}
                </>
              )}
            </section>
            <aside className="generate-preview panel">
              <h2>Recent movie media</h2>
              <p className="muted">
                Select imported files in each mapped slot. New job results
                appear here and in Renders.
              </p>
              {results.length ? (
                <div className="generate-result-grid">
                  {results.map((a) => (
                    <figure key={a.id}>
                      <Media asset={a} root={root} />
                      <figcaption>{a.name}</figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                <div className="generate-empty">
                  <ImagePlus size={44} />
                  <p>Your first result starts here</p>
                  <small>
                    Start frames, reference images, video and audio are assigned
                    to real workflow inputs.
                  </small>
                </div>
              )}
              <div className="generate-ratio-summary">
                <strong>Movie ratio · {p.ratio}</strong>
                <small>
                  Dimensions follow bound workflow inputs. Change width/height
                  in Exact inputs when available.
                </small>
              </div>
            </aside>
          </div>
          <footer className="panel generate-batch">
            <div>
              <strong>{draft.items.length} items in this batch</strong>
              <p className="muted">
                Same node queues automatically. Different nodes run in parallel.
              </p>
              {!!issues.length && (
                <small>
                  {issues[0]}
                  {issues.length > 1 ? ` (+${issues.length - 1} more)` : ""}
                </small>
              )}
            </div>
            <div className="jobs-toolbar">
              <button
                className="primary"
                disabled={queueing || !!issues.length}
                onClick={() => {
                  setQueueing(true);
                  void enqueue(draft.id).finally(() => setQueueing(false));
                }}
              >
                Add to queue
              </button>
              <button onClick={() => review(draft.id)}>
                <ListChecks size={18} />
                Review / run in Jobs
              </button>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
