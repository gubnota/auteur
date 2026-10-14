import { useEffect, useState } from "react";
import { Plus, Play, Pause, Pencil, Trash2 } from "lucide-react";
import type { Update } from "../App";
import type { AppSettings, Job, JobRun, Project } from "../lib/types";
import { draftFromRun } from "../lib/job-history";
import { newJobDraft } from "../lib/job-drafts";
import { call } from "../lib/bridge";
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
    [busy, setBusy] = useState(false);
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
  const editRun = (run: JobRun) => {
    try {
      const d = draftFromRun(run, jobs);
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
            Queue and history. Same node runs in order; different nodes run in
            parallel.
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
          {runs.some((r) => r.queued && r.state === "paused") && (
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  for (const run of runs
                    .filter((r) => r.queued && r.state === "paused")
                    .reverse()) {
                    onJobs(
                      await call<Job[]>("control_job_run", {
                        runId: run.id,
                        action: "resume",
                      }),
                    );
                  }
                  setRuns(await call("list_job_runs"));
                })
              }
            >
              Run all queued
            </button>
          )}
        </div>
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
                  {run.id.slice(0, 8)} ·{" "}
                  {done
                    ? "finished"
                    : run.queued
                      ? "queued · awaiting start"
                      : run.state}
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
              <button
                disabled={busy || !attempts.length}
                onClick={() => editRun(run)}
              >
                <Pencil size={16} />
                {run.queued && run.state === "paused"
                  ? "Edit queued batch"
                  : "Reuse as draft"}
              </button>
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
                    {run.state === "paused"
                      ? run.queued
                        ? "Run queued batch"
                        : "Resume"
                      : "Pause waiting"}
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
    </div>
  );
}
