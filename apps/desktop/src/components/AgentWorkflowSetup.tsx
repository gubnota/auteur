import { useEffect, useRef, useState } from "react";
import type { Connection, InstallArtifact, Workflow } from "../lib/types";
import { call } from "../lib/bridge";

type SetupReport = {
  state?: string;
  ready?: boolean;
  reviewId?: string;
  note?: string;
  managedRuntime?: boolean;
  restartSupported?: boolean;
  restartRequired?: boolean;
  profile?: { artifacts: InstallArtifact[] };
  inventory?: { files?: { target: string; state: string; path?: string }[] };
  plan?: {
    ready?: boolean;
    missingNodes?: string[];
    unresolved?: string[];
    incompatible?: string[];
  };
};
export function AgentWorkflowSetup({
  workflow,
  connection,
  prepare,
}: {
  workflow: Workflow;
  connection?: Connection;
  prepare: (w: string, c: string) => Promise<void>;
}) {
  const [report, setReport] = useState<SetupReport | null>(null),
    [review, setReview] = useState<SetupReport | null>(null),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const identity = JSON.stringify([
    connection,
    workflow.version,
    workflow.requirements,
    workflow.wrapper?.pythonPackages,
    workflow.profiles,
  ]);
  const current = useRef(identity);
  current.current = identity;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setReport(null);
    setReview(null);
    setError("");
  }, [identity]);
  const act = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      if (mounted.current) setBusy("");
    }
  };
  const operation = async (command: string, args: Record<string, unknown>) => {
    const stamp = identity;
    const receipt = await call<{ id: string }>(command, args);
    for (let i = 0; i < 1800; i++) {
      if (!mounted.current || current.current !== stamp)
        throw new Error(
          "Selection changed. Check the operation in Connections before retrying.",
        );
      const status = await call<{
        state: string;
        report: SetupReport;
        error?: string;
      }>("runner_operation", {
        connectionId: connection!.id,
        operationId: receipt.id,
      });
      if (!mounted.current || current.current !== stamp)
        throw new Error(
          "Selection changed. Review setup again for the current selection.",
        );
      if (status.state === "completed") return status.report;
      if (["failed", "lost", "unknown", "canceled"].includes(status.state))
        throw new Error(
          status.error ||
            "Agent operation needs attention. Inspect Connections before retrying.",
        );
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw new Error(
      "Still running. Check Connections before starting another initialization.",
    );
  };
  const inspect = () =>
    act("Checking node and resolving dependencies…", async () => {
      setReview(null);
      const result = await operation("plan_deployment", {
        connectionId: connection!.id,
        workflowIds: [workflow.id],
        guided: true,
        apply: false,
      });
      if (!result.reviewId)
        throw new Error(
          "Update the node agent: this version does not support guided setup.",
        );
      setReport(result);
      setReview(result);
    });
  if (connection?.kind !== "relay")
    return (
      <aside className="setup-guide-note">
        <strong>Initialize remotely with the agent</strong>
        <p>
          Select a Colab / Kaggle or RunPod agent connection above. Run the base
          notebook once to start ComfyUI, the agent and its connection. All
          workflow downloads and plugin installations then happen here. Direct
          ComfyUI connections remain read-only.
        </p>
      </aside>
    );
  const artifacts = review?.profile?.artifacts ?? [];
  return (
    <section
      className="agent-workflow-setup panel"
      aria-label="Agent initialization"
    >
      <div>
        <span className="eyebrow">REMOTE INITIALIZATION</span>
        <h3>Set up on {connection.name}</h3>
        <p>
          Check this session, review exact downloads, then initialize. Verified
          files are reused. Creating a movie copy or preparing inputs does not
          start a generation.
        </p>
      </div>
      <ol className="setup-steps">
        <li>Check & review</li>
        <li>Install dependencies</li>
        <li>Restart if requested</li>
        <li>Prepare inputs</li>
        <li>Recheck & verify canary</li>
      </ol>
      <div className="jobs-toolbar">
        <button disabled={!!busy} onClick={() => void inspect()}>
          Check node & review
        </button>
        <button
          className="primary"
          disabled={
            !!busy || !review?.reviewId || review.managedRuntime !== true
          }
          onClick={() =>
            void act("Initializing reviewed setup…", async () => {
              const id = review!.reviewId;
              setReview(null);
              setReport(
                await operation("plan_deployment", {
                  connectionId: connection.id,
                  workflowIds: [workflow.id],
                  guided: true,
                  apply: true,
                  reviewId: id,
                }),
              );
            })
          }
        >
          Initialize reviewed setup
        </button>
        <button
          disabled={
            !!busy ||
            (report?.state !== "needs-restart" && !report?.restartRequired)
          }
          onClick={() =>
            void act("Restarting idle ComfyUI workers…", async () => {
              setReview(null);
              setReport(
                await operation("runner_action", {
                  connectionId: connection.id,
                  action: "runtime-restart",
                }),
              );
            })
          }
        >
          Restart managed ComfyUI
        </button>
        <button
          disabled={!!busy}
          onClick={() =>
            void act("Preparing original workflow…", async () => {
              setReview(null);
              await prepare(workflow.id, connection.id);
            })
          }
        >
          Prepare inputs
        </button>
      </div>
      {busy && <p role="status">{busy} Keep the notebook cell running.</p>}
      {report && (
        <div className="setup-result" role="status">
          <strong>
            {report.ready && !report.restartRequired
              ? "Ready for this session"
              : report.state === "review"
                ? "Review before installation"
                : report.state?.replaceAll("-", " ")}
          </strong>
          {report.note && <p>{report.note}</p>}
          {report.restartRequired && (
            <p>A dependency change is waiting for a managed ComfyUI restart.</p>
          )}
          {report.managedRuntime === false && (
            <p>
              This runtime is external and read-only. Start a managed notebook
              to install dependencies here.
            </p>
          )}
          {report.restartSupported === false && (
            <p>
              For in-app restarts, update the agent and rerun the bundled base
              notebook.
            </p>
          )}
        </div>
      )}
      {!!artifacts.length && (
        <div className="setup-download-list">
          {artifacts.map((a) => {
            const row = review?.inventory?.files?.find(
              (f) => f.target === a.target,
            );
            return (
              <article
                key={`${a.kind}:${a.category}:${a.target}`}
                className="panel"
              >
                <div className="row">
                  <strong>{a.target}</strong>
                  <span className="compatibility-badge">
                    {row?.state ?? "Check required"}
                  </span>
                </div>
                <p>
                  {a.kind} · {(a.size / 1024 ** 2).toFixed(2)} MiB ·{" "}
                  {a.architecture}
                </p>
                <code>{row?.path ?? `${a.category}/${a.target}`}</code>
                <small>{a.license}</small>
                <details>
                  <summary>Verified source & checksum</summary>
                  <p>
                    {a.source ||
                      "Bundled MyMovie plugin / private transfer reference"}
                  </p>
                  <code>{a.sha256}</code>
                </details>
              </article>
            );
          })}
        </div>
      )}
      {report?.plan && (
        <details>
          <summary>Readiness details</summary>
          <pre>{JSON.stringify(report.plan, null, 2)}</pre>
        </details>
      )}
      {error && <p role="alert">{error}</p>}
      <p className="muted">
        The last initialization verifies a weight-free 64×64 output and its
        collection. Next, Create a job → Add to queue → Start selected. Your
        actual generated results appear in Library.
      </p>
    </section>
  );
}
