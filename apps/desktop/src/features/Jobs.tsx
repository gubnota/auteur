import { useEffect, useState } from "react";
import {
  Plus,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  Play,
  Pause,
  ListChecks,
} from "lucide-react";
import type { Update } from "../App";
import {
  uid,
  type AppSettings,
  type Binding,
  type Job,
  type JobDraft,
  type JobItem,
  type JobRun,
  type Project,
  type Workflow,
} from "../lib/types";
import { call, native } from "../lib/bridge";
import {
  castImages,
  literalInputs,
  mediaBinding,
  parseInput,
  readiness,
  resolveInputs,
} from "../lib/job-inputs";
import { Empty, Field, Modal, Picker, Toggle } from "../components/Controls";

export function newJobDraft(
  p: Project,
  settings: AppSettings,
  frameId = "",
  workflowId = "",
): JobDraft {
  return {
    id: uid(),
    name: `Generation ${(p.jobDrafts ?? []).length + 1}`,
    frameId,
    items: [
      {
        id: uid(),
        workflowId: workflowId || p.workflows[0]?.id || "",
        connectionId:
          settings.connections.find((c) =>
            ["comfyui", "runninghub", "relay"].includes(c.kind),
          )?.id ?? "",
        values: {},
        assets: {},
      },
    ],
  };
}
export function Jobs({
  project: p,
  settings,
  jobs,
  update,
  selectedId,
  select,
  flush,
  onJobs,
  notify,
}: {
  project: Project;
  settings: AppSettings;
  jobs: Job[];
  update: Update;
  selectedId: string;
  select: (id: string) => void;
  flush: () => Promise<void>;
  onJobs: (jobs: Job[]) => void;
  notify: (message: string) => void;
}) {
  const drafts = p.jobDrafts ?? [];
  const draft = drafts.find((d) => d.id === selectedId) ?? drafts[0];
  const [itemId, setItemId] = useState("");
  const item = draft?.items.find((i) => i.id === itemId) ?? draft?.items[0];
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [review, setReview] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    void call<JobRun[]>("list_job_runs")
      .then((r) => {
        if (alive) setRuns(r);
      })
      .catch((e) => notify(String(e)));
    return () => {
      alive = false;
    };
  }, [p.id, jobs]);
  useEffect(() => {
    setErrors({});
    setReview(null);
  }, [draft?.id, item?.id]);
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
  const issue = draft
    ? [...readiness(p, settings, draft), ...Object.values(errors)]
    : [];
  const w = p.workflows.find((w) => w.id === item?.workflowId);
  const c = settings.connections.find((c) => c.id === item?.connectionId);
  const d = w?.deployments?.find((d) => d.connectionId === c?.id);
  const frames = p.episodes.flatMap((e) =>
    e.scenes.flatMap((s) =>
      s.shots.flatMap((sh) =>
        sh.frames.map((f) => ({
          id: f.id,
          label: `${e.name} / ${s.name} / ${f.name}`,
        })),
      ),
    ),
  );
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify(String(e));
    } finally {
      setBusy(false);
    }
  };
  const control = (run: JobRun, action: string) =>
    void act(async () => {
      onJobs(await call<Job[]>("control_job_run", { runId: run.id, action }));
      setRuns(await call("list_job_runs"));
    });
  return (
    <div className="jobs-workspace">
      <header className="section-heading">
        <div>
          <h1>Jobs</h1>
          <p className="muted">
            Exact inputs. Automatic queues per instance. Parallel instances.
          </p>
        </div>
        <button className="primary" onClick={add}>
          <Plus size={18} />
          New job draft
        </button>
      </header>
      <div className="jobs-layout">
        <aside className="panel jobs-drafts">
          <h2>Saved drafts</h2>
          {drafts.map((d) => (
            <button
              className={`choice ${draft?.id === d.id ? "selected" : ""}`}
              key={d.id}
              onClick={() => select(d.id)}
            >
              <span>
                <strong>{d.name}</strong>
                <small>{d.items.length} workflow items</small>
              </span>
            </button>
          ))}
          {!drafts.length && (
            <p className="muted">
              Create a draft, choose a frame and add workflows.
            </p>
          )}
        </aside>
        {!draft ? (
          <Empty title="Compose a generation batch">
            Save a repeatable set of workflows and their exact inputs.
          </Empty>
        ) : (
          <section className="jobs-editor panel">
            <div className="jobs-toolbar">
              <Field
                label="Job draft name"
                value={draft.name}
                onChange={(name) =>
                  editDraft((d) => {
                    d.name = name || "Untitled generation";
                  })
                }
              />
              <button
                aria-label="Duplicate draft"
                onClick={() => {
                  const copy = structuredClone(draft);
                  copy.id = uid();
                  copy.name += " copy";
                  copy.items.forEach((i) => {
                    i.id = uid();
                  });
                  update((p) => {
                    (p.jobDrafts ??= []).push(copy);
                  });
                  select(copy.id);
                }}
              >
                <Copy size={18} />
              </button>
              <button
                aria-label="Delete draft"
                onClick={() =>
                  update((p) => {
                    p.jobDrafts = p.jobDrafts?.filter((d) => d.id !== draft.id);
                  })
                }
              >
                <Trash2 size={18} />
              </button>
            </div>
            <Picker
              title="Target keyframe"
              value={draft.frameId}
              options={frames}
              onChange={(frameId) =>
                editDraft((d) => {
                  d.frameId = frameId;
                })
              }
            />
            <div className="jobs-item-strip">
              {draft.items.map((i, n) => (
                <button
                  className={item?.id === i.id ? "selected" : ""}
                  key={i.id}
                  onClick={() => setItemId(i.id)}
                >
                  {n + 1}.{" "}
                  {p.workflows.find((w) => w.id === i.workflowId)?.name ??
                    "Choose workflow"}
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
                Add workflow
              </button>
            </div>
            {item && (
              <>
                <div className="jobs-toolbar">
                  <h2>Workflow item {draft.items.indexOf(item) + 1}</h2>
                  <button
                    aria-label="Move item up"
                    disabled={draft.items.indexOf(item) === 0}
                    onClick={() =>
                      editDraft((d) => {
                        const n = d.items.findIndex((i) => i.id === item.id);
                        [d.items[n - 1], d.items[n]] = [
                          d.items[n],
                          d.items[n - 1],
                        ];
                      })
                    }
                  >
                    <ArrowUp size={17} />
                  </button>
                  <button
                    aria-label="Move item down"
                    disabled={
                      draft.items.indexOf(item) === draft.items.length - 1
                    }
                    onClick={() =>
                      editDraft((d) => {
                        const n = d.items.findIndex((i) => i.id === item.id);
                        [d.items[n + 1], d.items[n]] = [
                          d.items[n],
                          d.items[n + 1],
                        ];
                      })
                    }
                  >
                    <ArrowDown size={17} />
                  </button>
                  <button
                    aria-label="Duplicate item"
                    onClick={() =>
                      editDraft((d) => {
                        const copy = structuredClone(item);
                        copy.id = uid();
                        d.items.push(copy);
                        setItemId(copy.id);
                      })
                    }
                  >
                    <Copy size={17} />
                  </button>
                  <button
                    aria-label="Remove item"
                    onClick={() =>
                      editDraft((d) => {
                        d.items = d.items.filter((i) => i.id !== item.id);
                      })
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
                <div className="jobs-two-columns">
                  <Picker
                    title="Workflow"
                    value={item.workflowId}
                    options={p.workflows.map((w) => ({
                      id: w.id,
                      label: w.name,
                      description: `${w.mediaKind ?? "other"} · ${w.version.slice(0, 12)}`,
                    }))}
                    onChange={(id) =>
                      editItem((i) => {
                        i.workflowId = id;
                        i.bindings = null;
                        i.values = {};
                        i.inputText = {};
                        i.inputErrors = {};
                        i.assets = {};
                        i.deploymentId = null;
                        i.apiFamily = null;
                      })
                    }
                  />
                  <Picker
                    title="Connection"
                    value={item.connectionId}
                    options={settings.connections
                      .filter((c) =>
                        ["comfyui", "runninghub", "relay"].includes(c.kind),
                      )
                      .map((c) => ({
                        id: c.id,
                        label: c.name,
                        description: c.kind,
                      }))}
                    onChange={(id) =>
                      editItem((i) => {
                        i.connectionId = id;
                        i.deploymentId = null;
                        i.apiFamily = null;
                      })
                    }
                  />
                </div>
                {c && (
                  <p className="muted">
                    {c.name} · {c.url} ·{" "}
                    {c.kind === "comfyui"
                      ? "One active job; additional items wait automatically"
                      : `${c.concurrency || 1} configured slots`}
                  </p>
                )}
                {c?.kind === "runninghub" && (
                  <section className="jobs-deployment">
                    <Field
                      label="Hosted deployment ID"
                      value={
                        item.deploymentId ??
                        d?.deploymentId ??
                        c.deploymentId ??
                        ""
                      }
                      onChange={(v) =>
                        editItem((i) => {
                          i.deploymentId = v;
                          i.apiFamily ??=
                            d?.apiFamily ?? c.apiFamily ?? "workflow";
                        })
                      }
                    />
                    <Picker
                      title="API family"
                      value={
                        item.apiFamily ??
                        d?.apiFamily ??
                        c.apiFamily ??
                        "workflow"
                      }
                      options={[
                        { id: "workflow", label: "Hosted workflow" },
                        { id: "ai-app", label: "Published AI App (v2)" },
                      ]}
                      onChange={(v) =>
                        editItem((i) => {
                          i.apiFamily = v;
                          i.deploymentId ??=
                            d?.deploymentId ?? c.deploymentId ?? "";
                        })
                      }
                    />
                    <p className="muted">
                      {(item.apiFamily ?? d?.apiFamily ?? c.apiFamily) ===
                      "ai-app"
                        ? "AI App"
                        : "Hosted workflow"}{" "}
                      {item.deploymentId ??
                        d?.deploymentId ??
                        c.deploymentId ??
                        "unconfigured"}{" "}
                      · {c.name}
                    </p>
                  </section>
                )}
                {w && (
                  <InputEditor
                    key={`${draft.id}:${item.id}:${w.id}`}
                    p={p}
                    draft={draft}
                    item={item}
                    workflow={w}
                    edit={editItem}
                    error={(key, message) =>
                      setErrors((e) => {
                        const next = { ...e };
                        if (message) next[key] = message;
                        else delete next[key];
                        return next;
                      })
                    }
                  />
                )}
              </>
            )}
            {!!issue.length && (
              <div className="jobs-issues" role="alert">
                {issue.map((e, n) => (
                  <p key={n}>{e}</p>
                ))}
              </div>
            )}
            <button
              className="primary"
              disabled={busy || !!issue.length || !draft.items.length}
              onClick={() =>
                void act(async () => {
                  await flush();
                  const result = native
                    ? await call("preview_job_draft", { draft })
                    : {
                        items: draft.items.map((i) =>
                          resolveInputs(p, draft, i),
                        ),
                      };
                  setReview(result);
                })
              }
            >
              <ListChecks size={18} />
              Review exact inputs
            </button>
            <p className="muted">
              Review performs no uploads. Starting the batch sends each listed
              item to its selected provider; paid providers may charge.
            </p>
          </section>
        )}
      </div>
      <section className="panel jobs-history">
        <h2>Run history</h2>
        {!runs.length && (
          <p className="muted">
            Started batches and their durable attempts appear here.
          </p>
        )}
        {runs.map((run) => {
          const attempts = run.jobIds
            .map((id) => jobs.find((j) => j.id === id))
            .filter((j): j is Job => !!j);
          const done = attempts.every((j) =>
            ["completed", "failed", "canceled"].includes(j.state),
          );
          return (
            <article key={run.id} className="jobs-run">
              <div>
                <strong>{run.name}</strong>
                <small>
                  {run.id.slice(0, 8)} · {done ? "finished" : run.state}
                </small>
              </div>
              <div className="jobs-run-items">
                {attempts.map((j) => (
                  <span
                    key={j.id}
                    className={`job-state state-${j.state}`}
                    title={j.error ?? j.id}
                  >
                    {p.workflows.find((w) => w.id === j.workflowId)?.name ??
                      "Workflow"}{" "}
                    ·{" "}
                    {settings.connections.find((c) => c.id === j.connectionId)
                      ?.name ?? "Connection"}
                    : {j.state}
                    {j.error && <small>{j.error}</small>}
                  </span>
                ))}
              </div>
              {!done && (
                <div className="jobs-toolbar">
                  <button
                    disabled={busy || run.state === "canceled"}
                    onClick={() =>
                      control(run, run.state === "paused" ? "resume" : "pause")
                    }
                  >
                    {run.state === "paused" ? (
                      <Play size={16} />
                    ) : (
                      <Pause size={16} />
                    )}{" "}
                    {run.state === "paused" ? "Resume" : "Pause waiting"}
                  </button>
                  <button
                    disabled={busy || run.state === "canceled"}
                    onClick={() => control(run, "cancel")}
                  >
                    Cancel run
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </section>
      {!!review && draft && (
        <Modal title="Review generation batch" onClose={() => setReview(null)}>
          <p>
            {draft.items.length} independent items. Same ComfyUI instance queues
            in order; separate instances dispatch in parallel.
          </p>
          <p className="muted">
            Media identifiers and hashes are shown now. Actual provider
            filenames and the final payload are recorded after staging.
          </p>
          <pre className="jobs-preview">{JSON.stringify(review, null, 2)}</pre>
          <button
            className="primary"
            disabled={busy || !native || !!issue.length}
            onClick={() =>
              void act(async () => {
                await flush();
                onJobs(
                  await call<Job[]>("start_job_draft", { draftId: draft.id }),
                );
                setReview(null);
                notify(
                  "Batch recorded. Jobs will start as their instances become available.",
                );
              })
            }
          >
            Validate & start {draft.items.length}{" "}
            {draft.items.length === 1 ? "job" : "jobs"}
          </button>
        </Modal>
      )}
    </div>
  );
}
function InputEditor({
  p,
  draft,
  item,
  workflow: w,
  edit,
  error,
}: {
  p: Project;
  draft: JobDraft;
  item: JobItem;
  workflow: Workflow;
  edit: (fn: (i: JobItem) => void) => void;
  error: (key: string, message: string) => void;
}) {
  const bindings = item.bindings ?? w.bindings;
  const [adding, setAdding] = useState(false);
  const [field, setField] = useState("");
  const [semantic, setSemantic] = useState("");
  const [type, setType] = useState("string");
  const available = literalInputs(w).filter(
    (x) => !bindings.some((b) => b.nodeId === x.nodeId && b.input === x.input),
  );
  const refs = castImages(p, draft.frameId);
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
              <Picker
                title={`Image source for ${b.semantic}`}
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
                  ...(b.semantic.startsWith("characterReference")
                    ? refs
                    : p.assets.filter((a) => a.kind === "image")
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
                  { semantic: semantic.trim(), nodeId, input, valueType: type },
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
