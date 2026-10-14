import {
  uid,
  type Asset,
  type Binding,
  type Job,
  type JobDraft,
  type JobItem,
  type JobRun,
} from "./types";

// Restore frozen inputs, never a source draft that may have changed after queuing.
export function draftFromRun(run: JobRun, jobs: Job[], selectedIds?: string[]): JobDraft {
  const attempts = run.jobIds.filter((id) => !selectedIds || selectedIds.includes(id)).map((id) => {
    const job = jobs.find((j) => j.id === id);
    if (!job)
      throw new Error("Job receipt missing; cannot restore this batch.");
    return job;
  });
  if (!attempts.length) throw new Error("This batch has no workflow items.");
  const items = attempts.map((job) => {
    const snapshot = job.snapshot as {
      semantic?: Record<string, unknown>;
      media?: Record<string, Asset>;
      bindings?: Binding[];
      context?: JobDraft["context"];
      draftItem?: JobItem;
      connection?: { deploymentId?: string; apiFamily?: string };
    } | null;
    if (!snapshot?.semantic || !snapshot.media || !snapshot.bindings)
      throw new Error(
        "This older receipt has no restorable inputs. Select its saved draft instead.",
      );
    const values = structuredClone(snapshot.semantic);
    const assets: Record<string, string> = {};
    for (const [semantic, asset] of Object.entries(snapshot.media)) {
      delete values[semantic];
      assets[semantic] = asset.id;
    }
    return {
      id: uid(),
      workflowId: job.workflowId,
      connectionId: job.connectionId,
      values,
      assets,
      bindings: structuredClone(snapshot.bindings),
      deploymentId: snapshot.connection?.deploymentId,
      apiFamily: snapshot.connection?.apiFamily,
    };
  });
  const context = (attempts[0].snapshot as { context?: JobDraft["context"] })
    .context;
  return {
    queuedRunId: !selectedIds && run.queued && run.state === "paused" ? run.id : null,
    queuedJobIds: selectedIds && attempts.every((j) => j.state === "paused" && !j.remoteId) ? attempts.map((j) => j.id) : [],
    id: uid(),
    name: `${run.name} edit`,
    frameId: attempts[0].frameId,
    context: structuredClone(context),
    items,
  };
}
