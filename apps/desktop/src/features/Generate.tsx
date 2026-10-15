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
import {
  uid,
  type AppSettings,
  type Job,
  type JobDraft,
  type JobItem,
  type Project,
} from "../lib/types";
import { newJobDraft } from "../lib/job-drafts";
import { JobReview } from "../components/JobReview";
import { WorkflowInputs } from "../components/WorkflowInputs";
import { Field, Picker, Toggle } from "../components/Controls";
import { WorkflowTarget } from "../components/WorkflowTarget";
import { readiness, workflowForTarget } from "../lib/job-inputs";
import { compatibilityLabel } from "../components/WorkflowSetup";
import { Media } from "./Library";
export function Generate({
  project: p,
  settings,
  root,
  update,
  selectedId,
  select,
  configure,
  flush,
  onJobs,
  executeJob,
  jobs,
  importMedia,
  importWorkflow,
  prepare,
  notify,
}: {
  flush: () => Promise<void>;
  executeJob: <T>(command: string, args: Record<string, unknown>) => Promise<T>;
  onJobs: (jobs: Job[]) => void;
  jobs: Job[];
  project: Project;
  settings: AppSettings;
  root: string;
  update: Update;
  selectedId: string;
  select: (id: string) => void;
  configure: () => void;
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
  const drafts = p.jobDrafts ?? [];
  const draft = drafts.find((d) => d.id === selectedId) ?? drafts[0];
  const [itemId, setItemId] = useState("");

  const item = draft?.items.find((i) => i.id === itemId) ?? draft?.items[0];
  const sourceWorkflow = p.workflows.find((w) => w.id === item?.workflowId);
  const workflow = workflowForTarget(sourceWorkflow, item?.connectionId ?? "");
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
    update((p) => {
      (p.jobDrafts ??= []).push(d);
    });
    select(d.id);
  };
  const issues = draft ? readiness(p, settings, draft) : [];
  const resultIds = new Set(jobs.flatMap((j) => j.results.map((a) => a.id)));
  const results = p.assets
    .filter((a) => resultIds.has(a.id) && !a.archivedAt)
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
              <button
                className="text-button danger"
                onClick={() => {
                  update((p) => {
                    p.jobDrafts = (p.jobDrafts ?? []).filter(
                      (d) => d.id !== draft.id,
                    );
                  });
                  select(drafts.find((d) => d.id !== draft.id)?.id ?? "");
                }}
              >
                Remove draft
              </button>
              <Field
                label="Generation name"
                value={draft.name}
                onChange={(name) =>
                  editDraft((d) => {
                    d.name = name || "Untitled generation";
                  })
                }
              />
              <details>
                <summary>
                  Target context ·{" "}
                  {draft.frameId ? "Storyboard frame" : "Custom media"}
                </summary>
                <Picker
                  title="Target keyframe"
                  value={draft.frameId}
                  options={[
                    { id: "", label: "Custom media · no frame" },
                    ...p.episodes.flatMap((e) =>
                      e.scenes.flatMap((s) =>
                        s.shots.flatMap((sh) =>
                          sh.frames.map((f) => ({
                            id: f.id,
                            label: `${e.name} / ${s.name} / ${f.name}`,
                          })),
                        ),
                      ),
                    ),
                  ]}
                  onChange={(frameId) =>
                    editDraft((d) => {
                      d.frameId = frameId;
                      d.context = {
                        ...d.context,
                        kind: frameId ? "storyboard" : "standalone",
                        mode: d.context?.mode ?? "custom",
                        characterIds: d.context?.characterIds ?? [],
                      };
                    })
                  }
                />
              </details>
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
                    onClick={() =>
                      editDraft((d) => {
                        const next = structuredClone(item);
                        next.id = uid();
                        d.items.push(next);
                        setItemId(next.id);
                      })
                    }
                  >
                    Duplicate item
                  </button>
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
                    options={p.workflows.filter(w => !w.wrapper?.archivedAt).map((w) => ({
                      id: w.id,
                      label: w.name,
                      description: `${compatibilityLabel(w)} · ${w.mediaKind ?? "other"} · ${w.version.slice(0, 12)}`,
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
                        ["comfyui", "relay"].includes(c.kind),
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
                          checked={(draft.context?.characterIds ?? []).includes(
                            c.id,
                          )}
                          onChange={(checked) =>
                            editDraft((d) => {
                              d.context ??= {
                                kind: d.frameId ? "storyboard" : "standalone",
                                mode: "custom",
                                characterIds: [],
                              };
                              d.context.characterIds = checked
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
                        <details>
                          <summary>Workflow preparation & exports</summary>
                          <WorkflowTarget
                            workflow={sourceWorkflow}
                            connection={settings.connections.find(
                              (c) => c.id === item.connectionId,
                            )}
                            prepare={prepare}
                            notify={notify}
                          />
                        </details>
                      )}
                      <WorkflowInputs
                        key={`${draft.id}:${item.id}:${workflow.id}`}
                        configure={configure}
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
              <h2>Recent results</h2>
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
            <JobReview
              key={draft.id}
              draft={draft}
              issues={issues}
              flush={flush}
              onJobs={onJobs}
              executeJob={executeJob}
              notify={notify}
              saved={() =>
                editDraft((d) => {
                  d.queuedRunId = null;
                  d.queuedJobIds = [];
                })
              }
            />
          </footer>
        </>
      )}
    </div>
  );
}
