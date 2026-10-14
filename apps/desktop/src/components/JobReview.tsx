import { useState } from "react";
import type { Job, JobDraft } from "../lib/types";
import { call, native } from "../lib/bridge";
import { Modal } from "./Controls";
export function JobReview({
  draft,
  issues,
  flush,
  onJobs,
  executeJob,
  notify,
  saved,
}: {
  draft: JobDraft;
  issues: string[];
  flush: () => Promise<void>;
  onJobs: (jobs: Job[]) => void;
  executeJob: <T>(command: string, args: Record<string, unknown>) => Promise<T>;
  notify: (message: string) => void;
  saved: () => void;
}) {
  const [preview, setPreview] = useState<unknown>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const action = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const submit = (now: boolean) =>
    void action(async () => {
      await flush();
      onJobs(
        await executeJob<Job[]>(
          draft.queuedRunId
            ? "replace_queued_job_run"
            : now
              ? "start_job_draft"
              : "enqueue_job_draft",
          {
            draftId: draft.id,
            ...(draft.queuedRunId ? { runId: draft.queuedRunId } : {}),
          },
        ),
      );

      saved();
      setPreview(null);
      notify(
        now
          ? "Batch recorded. Jobs will start when their nodes are available."
          : "Batch queued. Open Jobs to run when ready.",
      );
    });
  return (
    <div className="job-review">
      {issues.map((s, i) => (
        <p className="muted" key={i}>
          {s}
        </p>
      ))}
      {error && (
        <p role="alert">
          {error} · Draft retained. Retry preparation or choose another node.
        </p>
      )}
      <div className="jobs-toolbar">
        <button
          disabled={busy || !native || !!issues.length}
          onClick={() =>
            void action(async () => {
              await flush();
              setPreview(await executeJob("preview_job_draft", { draft }));
            })
          }
        >
          Review exact inputs
        </button>
        <button
          className="primary"
          disabled={busy || !native || !!issues.length}
          onClick={() => submit(false)}
        >
          {draft.queuedRunId || draft.queuedJobIds?.length ? "Save queue changes" : "Add to queue"}
        </button>
      </div>
      {preview != null && (
        <Modal title="Review generation batch" onClose={() => setPreview(null)}>
          <p>
            Destination, mapped inputs and retained media for{" "}
            {draft.items.length} jobs. Running a paid provider may charge its
            account.
          </p>
          <pre className="jobs-preview">{JSON.stringify(preview, null, 2)}</pre>
          <div className="jobs-toolbar">
            <button
              className="primary"
              disabled={busy}
              onClick={() => submit(false)}
            >
              {draft.queuedRunId || draft.queuedJobIds?.length ? "Save queue changes" : "Add to queue"}
            </button>
            <button
              disabled={busy || !!draft.queuedRunId || !!draft.queuedJobIds?.length}
              onClick={() => submit(true)}
            >
              Run now · {draft.items.length} jobs
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
