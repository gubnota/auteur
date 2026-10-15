import { openActivity } from "./BackgroundActivity";
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
  onBusyChange,
  locked,
  connection,
  prepare,
}: {
  workflow: Workflow;
  onBusyChange: (busy: boolean) => void;
  locked: boolean;
  connection?: Connection;
  prepare: (w: string, c: string) => Promise<void>;
}) {
  const [report, setReport] = useState<SetupReport | null>(null),
    [review, setReview] = useState<SetupReport | null>(null),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [steps, setSteps] = useState<string[]>([]);
  const identity = JSON.stringify([
    connection,
    workflow.id,
    workflow.version,
    workflow.requirements,
    workflow.wrapper?.pythonPackages,
    workflow.wrapper?.initialization,
  ]);
  useEffect(() => {
    onBusyChange(!!busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);
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
    setSteps([]);
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
  const inspect = async () => {
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
    return result;
  };
  const initialize = () =>
    act("Checking node and resolving dependencies…", async () => {
      if (!review) {
        setSteps(["Checking this instance and resolving exact dependencies…"]);
        setReview(await inspect());
        return;
      }
      if (review.managedRuntime !== true)
        throw new Error(
          "Connect an agent-managed notebook to install dependencies.",
        );
      if (review.plan?.incompatible?.length)
        throw new Error(review.plan.incompatible.join("; "));
      const queued = await call<{ id: string }>("start_initialization", {
        connectionId: connection!.id,
        workflowId: workflow.id,
        reviewId: review.reviewId,
      });
      setReview(null);
      setSteps([
        `Initialization ${queued.id.slice(0, 8)} is running on the agent. You can close this window.`,
      ]);
      openActivity();
    });
  if (connection?.kind === "comfyui")
    return (
      <section
        className="agent-workflow-setup panel"
        aria-label="Local workflow initialization"
      >
        <h3>Set up on {connection.name}</h3>
        <p>
          Check this instance’s live inputs and prepare the workflow. Original
          editor workflows are also added to its workflow library. Existing
          models and plugins are reused.
        </p>
        <button
          className="primary"
          disabled={locked || !!busy}
          onClick={() =>
            void act("Preparing workflow…", async () => {
              setSteps([
                `Reading the node registry and preparing inputs on ${connection.name}…`,
              ]);
              await prepare(workflow.id, connection.id);
              if (workflow.editorGraph) {
                setSteps((v) => [
                  ...v,
                  "Publishing the original workflow to ComfyUI’s library…",
                ]);
                await call("install_workflow", {
                  workflowId: workflow.id,
                  connectionId: connection.id,
                });
              }
              setSteps((v) => [
                ...v,
                "Workflow prepared. Select this instance in Generate to queue a job.",
              ]);
            })
          }
        >
          {busy || `Initialize on ${connection.name}`}
        </button>
        <small>
          Missing models or plugins require an agent connection for
          installation. This direct connection does not install dependencies or
          restart your ComfyUI.
        </small>
        {!!steps.length && (
          <ol>
            {steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
    );
  if (connection?.kind !== "relay")
    return (
      <aside className="setup-guide-note">
        Choose a ComfyUI or agent instance above to initialize this workflow.
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
          Review downloads once, then the agent installs missing dependencies,
          restarts its managed instance if needed, prepares the workflow and
          checks readiness. Verified files are reused on later runs.
        </p>
      </div>
      <div className="jobs-toolbar">
        <button onClick={openActivity}>View background activity</button>
        <button
          className="primary"
          disabled={
            locked || !!busy || (!!review && review.managedRuntime !== true)
          }
          onClick={() => void initialize()}
        >
          {review
            ? `Install & prepare on ${connection.name}`
            : `Initialize on ${connection.name}`}
        </button>
        {review && (
          <button disabled={locked || !!busy} onClick={() => setReview(null)}>
            Discard review
          </button>
        )}
      </div>
      {review && (
        <p>
          Review the files, sizes, destinations and licenses below. Install &
          prepare runs the complete setup through your agent; no notebook
          commands are needed.
        </p>
      )}
      {!!steps.length && (
        <details open={!!busy}>
          <summary>Initialization progress</summary>
          <ol>
            {steps.map((message, i) => (
              <li key={i}>{message}</li>
            ))}
          </ol>
        </details>
      )}
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
            <p>
              A dependency change requires a managed ComfyUI restart. The guided
              setup performs this when the instance is idle.
            </p>
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
      {error && (
        <p role="alert">
          {connection.name}: {error}
        </p>
      )}
      <p className="muted">
        The last initialization verifies a weight-free 64×64 output and its
        collection. Next, Create a job → Add to queue → Start selected. Your
        actual generated results appear in Library.
      </p>
    </section>
  );
}
