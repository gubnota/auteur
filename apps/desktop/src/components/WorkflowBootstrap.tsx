import { useEffect, useState } from "react";
import type { Workflow } from "../lib/types";
import { call, exportDestination, native } from "../lib/bridge";
import {
  setupScript,
  type SetupHost,
  type SetupAction,
} from "../lib/setup-script";
import { Field, Modal, Picker, Toggle } from "./Controls";
export function WorkflowBootstrap({
  workflow: w,
  requirements,
  connectionId,
  onClose,
}: {
  workflow: Workflow;
  requirements: NonNullable<Workflow["requirements"]>;
  connectionId: string;
  onClose: () => void;
}) {
  const [host, setHost] = useState<SetupHost>("macos"),
    [action, setAction] = useState<SetupAction>("inventory"),
    [artifact, setArtifact] = useState(""),
    [sha256, setSha256] = useState(""),
    [root, setRoot] = useState("/path/to/ComfyUI"),
    [python, setPython] = useState("/path/to/ComfyUI/.venv/bin/python"),
    [comfyUrl, setComfyUrl] = useState("http://127.0.0.1:8188"),
    [relay, setRelay] = useState("https://YOUR-RELAY"),
    [nodeId, setNodeId] = useState("studio-gpu0"),
    [managed, setManaged] = useState(false),
    [notebook, setNotebook] = useState(""),
    [notice, setNotice] = useState("");
  const cloud = host === "colab" || host === "kaggle";
  useEffect(() => {
    if (cloud)
      void call<string>("notebook_setup_script", { host })
        .then(setNotebook)
        .catch((e) => setNotice(String(e)));
  }, [host]);
  const script = cloud
    ? notebook
    : setupScript({
        artifact,
        sha256,
        root,
        python,
        comfyUrl,
        relay,
        nodeId,
        managed,
        action,
      });
  const exportSetup = async () => {
    try {
      const path = await exportDestination("workflow-setup.json");
      if (path) {
        await call("export_workflow_setup", {
          path,
          workflowId: w.id,
          requirements,
          connectionId: connectionId || null,
        });
        setNotice(
          "Setup exported. Export profile.json from Settings → App Runner, and the editor graph as workflow.json from this workflow’s tools.",
        );
      }
    } catch (e) {
      setNotice(String(e));
    }
  };
  return (
    <Modal
      title="Set up this workflow on a node"
      onClose={onClose}
      footer={
        <>
          <button
            disabled={!script}
            onClick={() =>
              void navigator.clipboard
                .writeText(script)
                .then(() => setNotice("Script copied"))
                .catch((e) => setNotice(String(e)))
            }
          >
            Copy complete script
          </button>
          <button disabled={!native} onClick={() => void exportSetup()}>
            Export dependency setup
          </button>
        </>
      }
    >
      <div className="bootstrap-window">
        <Picker
          title="Run on"
          value={host}
          options={[
            { id: "macos", label: "macOS · local or SSH" },
            { id: "linux", label: "Linux · RunPod / VM / SSH" },
            { id: "colab", label: "Google Colab · one worker" },
            { id: "kaggle", label: "Kaggle · up to two independent workers" },
          ]}
          onChange={(v) => setHost(v as SetupHost)}
        />
        <p>
          Run this on the machine hosting ComfyUI. First inspect the runtime;
          start its agent, then review and initialize the selected workflows in
          Connections. Models go into the effective model category folder,
          plugins into custom_nodes, and verified wheels into the same Python
          environment.
        </p>
        {cloud ? (
          <p>
            Paste the complete script in a notebook cell. Edit its Configure
            section: archive source, trusted checksum, pinned ComfyUI revision,
            and reachable relay HTTPS address. Upload the archive from the
            current CI build; store the agent token in notebook Secrets. Install
            ComfyUI first using the notebook guide. Kaggle uses one process per
            GPU and separate ports, without pooling memory.
          </p>
        ) : (
          <>
            <Picker
              title="Setup step"
              value={action}
              options={[
                {
                  id: "inventory",
                  label: "1 · Inspect installed models and plugins",
                },
                {
                  id: "serve",
                  label: "2 · Connect agent; initialize from Studio",
                },
                {
                  id: "workflow-install",
                  label: "Import original workflow into ComfyUI",
                },
                {
                  id: "workflow-compile",
                  label: "Export original workflow to API",
                },
                {
                  id: "provision",
                  label: "Preview dependency installation plan",
                },
              ]}
              onChange={(v) => setAction(v as SetupAction)}
            />
            <div className="editor-grid">
              <Field
                label="Agent archive path or public HTTPS URL"
                value={artifact}
                onChange={setArtifact}
              />
              <Field
                label="Trusted archive SHA256"
                value={sha256}
                onChange={setSha256}
              />
              <Field label="ComfyUI root" value={root} onChange={setRoot} />
              <Field
                label="ComfyUI Python interpreter"
                value={python}
                onChange={setPython}
              />
              <Field
                label="ComfyUI address on this machine"
                value={comfyUrl}
                onChange={setComfyUrl}
              />
              {action === "serve" && (
                <>
                  <Field
                    label="Reachable HTTPS relay"
                    value={relay}
                    onChange={setRelay}
                  />
                  <Field
                    label="Allowlisted node ID"
                    value={nodeId}
                    onChange={setNodeId}
                  />
                </>
              )}
            </div>
            <Toggle
              label="Isolated app-managed runtime (allow reviewed initialization)"
              checked={managed}
              onChange={setManaged}
            />
          </>
        )}
        <details>
          <summary>
            Where do I get the HTTPS address? How does “once” work?
          </summary>
          <p>
            Deploy the authenticated relay on a reachable host behind HTTPS, or
            expose a local relay with your named Cloudflare tunnel. Copy that
            relay’s HTTPS origin into the notebook and Connections; leave
            ComfyUI private. A temporary Quick Tunnel supports polling only, and
            must be explicitly enabled in the notebook. Use separate desktop and
            agent tokens.
          </p>
          <p>
            The runner stores an initialization receipt bound to its current
            session, runtime fingerprint and dependency profile. A repeated
            verified setup reuses unchanged files. New sessions or modified
            dependencies require verification again. Exported workflows and
            private source references contain no tokens.
          </p>
        </details>
        <textarea
          className="bootstrap-code"
          aria-label="Complete setup script"
          readOnly
          value={script || "Loading notebook script…"}
        />
        <p role="status">{notice}</p>
      </div>
    </Modal>
  );
}
