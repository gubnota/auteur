import { useEffect, useState } from "react";
import type { Workflow, Connection, WorkflowLayout } from "../lib/types";
import { call, exportDestination } from "../lib/bridge";
export function WorkflowTarget({
  workflow,
  onBusyChange,
  locked = false,
  connection,
  prepare,
  notify,
}: {
  workflow: Workflow;
  onBusyChange?: (busy: boolean) => void;
  locked?: boolean;
  connection?: Connection;
  prepare: (w: string, c: string, layout?: WorkflowLayout) => Promise<void>;
  notify: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  const profile = workflow.profiles?.find(
    (p) => p.connectionId === connection?.id,
  );
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setFailure("");
    try {
      await fn();
    } catch (e) {
      setFailure(`${connection?.name ?? "No instance selected"}: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };
  const download = (editor: boolean) =>
    act(async () => {
      const path = await exportDestination(
        `${workflow.name}${editor ? "_editor" : "_api"}.json`,
      );
      if (path) {
        await call("export_workflow", {
          workflowId: workflow.id,
          connectionId: connection?.id ?? "",
          editor,
          path,
        });
        notify("Workflow exported");
      }
    });
  return (
    <section className="workflow-target">
      {connection && (
        <p className="workflow-destination">
          <strong>{connection.name}</strong> · {connection.url}
          {connection.deploymentId ? ` · ${connection.deploymentId}` : ""}
        </p>
      )}
      <p>
        {profile
          ? `Prepared for ${connection?.name} · ${profile.inputs.length} inputs · ${profile.outputs.length} outputs`
          : "Select a node and prepare to discover its actual inputs and outputs."}
      </p>
      <div className="jobs-toolbar">
        <button
          className="primary"
          disabled={locked || busy || !connection}
          onClick={() => void act(() => prepare(workflow.id, connection!.id))}
        >
          {profile ? "Refresh inputs" : "Prepare inputs"}
        </button>
        <button
          disabled={locked || busy || !connection || !workflow.editorGraph}
          onClick={() =>
            void act(async () => {
              const receipt = await call<{ libraryPath?: string }>(
                "install_workflow",
                { workflowId: workflow.id, connectionId: connection!.id },
              );
              notify(
                `Saved in ComfyUI's workflow library${receipt.libraryPath ? `: ${receipt.libraryPath}` : ""}`,
              );
            })
          }
        >
          Install in ComfyUI
        </button>
        <button
          disabled={locked || busy || !workflow.editorGraph}
          onClick={() => void download(true)}
        >
          Export editor JSON
        </button>
        <button
          disabled={
            locked || busy || (!Object.keys(workflow.graph).length && !profile)
          }
          onClick={() => void download(false)}
        >
          Export API JSON
        </button>
        <button
          disabled={locked || busy}
          onClick={() =>
            void act(async () => {
              await call("catalogue_workflow", { workflowId: workflow.id });
              notify("Saved to the reusable workflow catalogue");
            })
          }
        >
          Save to catalogue
        </button>
      </div>
      {failure && <p role="alert">{failure}</p>}
    </section>
  );
}
