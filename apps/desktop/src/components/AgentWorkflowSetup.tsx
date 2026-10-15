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
  const checkSelection = (stamp: string) => {
    if (!mounted.current || current.current !== stamp)
      throw new Error(
        "Selection changed. Check the operation in Connections before retrying.",
      );
  };
  const step = (message: string) => {
    setBusy(message);
    setSteps((all) => [...all, message]);
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
      const stamp = identity;
      if (!review) {
        setSteps(["Checking this instance and resolving exact dependencies…"]);
        setReview(await inspect());
        return;
      }
      let checked = review;
      let prepared = false;
      setReview(null);
      // A review is single-use. Restart/preparation changes its runtime or workflow identity.
      for (let pass = 0; pass < 3; pass++) {
        checkSelection(stamp);
        if (checked.managedRuntime !== true)
          throw new Error(
            "This instance is read-only. Connect an agent-managed notebook to install dependencies.",
          );
        if (checked.plan?.incompatible?.length)
          throw new Error(checked.plan.incompatible.join("; "));
        step(
          pass
            ? "Verifying installed dependencies and session readiness…"
            : "Installing reviewed models, LoRAs and plugins…",
        );
        const result = await operation("plan_deployment", {
          connectionId: connection!.id,
          workflowIds: [workflow.id],
          guided: true,
          apply: true,
          reviewId: checked.reviewId,
        });
        setReport(result);
        if (result.ready && !result.restartRequired && prepared) {
          step("Ready for this session. Your workflow can now be queued.");
          return;
        }
        if (result.state === "needs-restart" || result.restartRequired) {
          if (checked.restartSupported !== true)
            throw new Error(
              "Dependencies are installed. Restart ComfyUI in its own environment, then initialize again. Update the agent/base notebook for automatic restarts.",
            );
          step("Restarting the idle, agent-managed ComfyUI instance…");
          await operation("runner_action", {
            connectionId: connection!.id,
            action: "runtime-restart",
          });
        } else if (result.state !== "needs-preparation" && !result.ready) {
          throw new Error(
            result.note ||
              `Initialization needs attention: ${result.state ?? "not ready"}. Expand readiness details.`,
          );
        }
        checkSelection(stamp);
        step(
          "Preparing the original workflow and discovering inputs and outputs…",
        );
        await prepare(workflow.id, connection!.id);
        checkSelection(stamp);
        prepared = true;
        if (workflow.editorGraph) {
          step(
            "Saving the original workflow in this instance’s ComfyUI library…",
          );
          await call("install_workflow", {
            workflowId: workflow.id,
            connectionId: connection!.id,
          });
          checkSelection(stamp);
        }
        step("Checking the prepared workflow against the current instance…");
        checked = await inspect();
      }
      throw new Error(
        "Initialization still requires attention. Review the latest report before retrying.",
      );
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
          Review downloads once, then the agent installs missing dependencies,
          restarts its managed instance if needed, prepares the workflow and
          checks readiness. Verified files are reused on later runs.
        </p>
      </div>
      <div className="jobs-toolbar">
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
