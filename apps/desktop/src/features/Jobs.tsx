import { useEffect, useState } from "react";
import { Plus, Play, Pause, Pencil, Trash2 } from "lucide-react";
import type { Update } from "../App";
import type { AppSettings, Job, JobRun, Project } from "../lib/types";
import { draftFromRun } from "../lib/job-history";
import { newJobDraft } from "../lib/job-drafts";
import { call } from "../lib/bridge";
import { Toggle } from "../components/Controls";
export function Jobs({
  project: p,
  settings,
  jobs,
  update,
  select,
  onJobs,
  notify,
}: {
  project: Project;
  settings: AppSettings;
  jobs: Job[];
  update: Update;
  select: (id: string) => void;
  onJobs: (jobs: Job[]) => void;
  notify: (message: string) => void;
}) {
  const [runs, setRuns] = useState<JobRun[]>([]),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const queued = jobs.filter(
    (j) =>
      j.state === "paused" &&
      !j.remoteId &&
      runs.some((r) => r.queued && r.jobIds.includes(j.id)),
  );
  const chosen = queued.filter((j) => selected.includes(j.id));
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
    setSelected((ids) =>
      ids.filter((id) =>
        jobs.some((j) => j.id === id && j.state === "paused" && !j.remoteId),
      ),
    );
  }, [p.id, jobs]);
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
  const controlSelected = (action: string) =>
    void act(async () => {
      onJobs(
        await call<Job[]>("control_job_tasks", {
          jobIds: chosen.map((j) => j.id),
          action,
        }),
      );
      setSelected([]);
      setRuns(await call("list_job_runs"));
    });
  const edit = (run: JobRun, ids?: string[]) => {
    try {
      const d = draftFromRun(run, jobs, ids);
      update((p) => {
        (p.jobDrafts ??= []).push(d);
      });
      select(d.id);
    } catch (e) {
      notify(String(e));
    }
  };
  return (
    <div className="jobs-workspace">
      <header className="section-heading">
        <div>
          <h1>Jobs</h1>
          <p className="muted">
            Select tasks to start. One node runs in order; different nodes run
            in parallel.
          </p>
        </div>
        <button
          className="primary"
          onClick={() => {
            const d = newJobDraft(p, settings);
            update((p) => {
              (p.jobDrafts ??= []).push(d);
            });
            select(d.id);
          }}
        >
          <Plus size={18} />
          New job
        </button>
      </header>
      <details className="panel">
        <summary>Saved drafts · {(p.jobDrafts ?? []).length}</summary>
        <div className="jobs-toolbar">
          {(p.jobDrafts ?? []).map((d) => (
            <button key={d.id} onClick={() => select(d.id)}>
              Edit {d.name}
            </button>
          ))}
        </div>
      </details>
      <section className="panel jobs-history">
        <div className="jobs-toolbar">
          <h2>Queue & run history</h2>
          <span>{chosen.length} selected</span>
          <button
            disabled={busy || !queued.length}
            onClick={() => setSelected(queued.map((j) => j.id))}
          >
            Select queued
          </button>
          <button disabled={!selected.length} onClick={() => setSelected([])}>
            Clear selection
          </button>
          <button
            className="primary"
            disabled={busy || !chosen.length}
            onClick={() => controlSelected("resume")}
          >
            <Play size={16} />
            Run selected
          </button>
          <button
            disabled={busy || !chosen.length}
            onClick={() => controlSelected("cancel")}
          >
            <Trash2 size={16} />
            Remove selected from queue
          </button>
        </div>
        {!runs.length && (
          <p className="muted">
            Add a batch from Generate. Queueing keeps every task paused until
            you start it here.
          </p>
        )}
        {runs.map((run) => {
          const attempts = run.jobIds
            .map((id) => jobs.find((j) => j.id === id))
            .filter((j): j is Job => !!j);
          const done = attempts.every((j) =>
            ["completed", "failed", "canceled"].includes(j.state),
          );
          const idle = attempts.filter((j) =>
            queued.some((q) => q.id === j.id),
          );
          const selectedInRun = idle.filter((j) => selected.includes(j.id));
          return (
            <details
              className="jobs-run"
              key={run.id}
              open={expanded[run.id] ?? (run.queued && !done)}
              onToggle={(e) => {
                const open = e.currentTarget.open;
                setExpanded((state) =>
                  state[run.id] === open ? state : { ...state, [run.id]: open },
                );
              }}
            >
              <summary>
                <strong>{run.name}</strong>
                <small>
                  {done
                    ? "finished"
                    : run.queued
                      ? "queued · awaiting start"
                      : run.state}{" "}
                  · {attempts.length} tasks
                </small>
              </summary>
              <div className="jobs-toolbar">
                <button
                  disabled={busy || !attempts.length}
                  onClick={() => edit(run)}
                >
                  <Pencil size={16} />
                  {run.queued && run.state === "paused"
                    ? "Edit queued batch"
                    : "Reuse as draft"}
                </button>
                {!!selectedInRun.length && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      edit(
                        run,
                        selectedInRun.map((j) => j.id),
                      )
                    }
                  >
                    Edit selected tasks / destination
                  </button>
                )}
                {!done && !run.queued && (
                  <>
                    <button
                      disabled={busy}
                      onClick={() =>
                        control(
                          run,
                          run.state === "paused" ? "resume" : "pause",
                        )
                      }
                    >
                      <Pause size={16} />
                      {run.state === "paused" ? "Resume" : "Pause waiting"}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => control(run, "cancel")}
                    >
                      Cancel run
                    </button>
                  </>
                )}
              </div>
              <div className="jobs-task-grid">
                {attempts.map((j) => (
                  <article
                    className="jobs-task"
                    data-selected={selected.includes(j.id)}
                    key={j.id}
                  >
                    <div className="jobs-toolbar">
                      {idle.some((q) => q.id === j.id) && (
                        <Toggle
                          label={`Select task ${j.id.slice(0, 8)}`}
                          checked={selected.includes(j.id)}
                          onChange={(v) =>
                            setSelected((ids) =>
                              v
                                ? [...ids, j.id]
                                : ids.filter((id) => id !== j.id),
                            )
                          }
                        />
                      )}
                      <span className={`job-state state-${j.state}`}>
                        {j.state}
                      </span>
                    </div>
                    <strong>
                      {p.workflows.find((w) => w.id === j.workflowId)?.name ??
                        "Workflow"}
                    </strong>
                    <small>
                      {settings.connections.find((c) => c.id === j.connectionId)
                        ?.name ?? "Connection"}
                    </small>
                    {j.error && <small className="error">{j.error}</small>}
                    <button disabled={busy} onClick={() => edit(run, [j.id])}>
                      {idle.some((q) => q.id === j.id)
                        ? "Edit task / destination"
                        : "Reuse task"}
                    </button>
                  </article>
                ))}
              </div>
            </details>
          );
        })}
      </section>
    </div>
  );
}
