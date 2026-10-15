import { openConsole, openActivity } from "../components/BackgroundActivity";
import { AssistantDialog } from "./PromptAssistant";
import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Server,
  Shield,
  Copy,
  Check,
  Cloud,
  HardDrive,
} from "lucide-react";
import { call, native } from "../lib/bridge";
import {
  uid,
  ratios,
  type AppSettings,
  type Connection,
  type Project,
} from "../lib/types";
import { Field, Modal, Picker, Toggle } from "../components/Controls";
import {
  RunnerTokenFields,
  RunnerTokenSettings,
} from "../components/RunnerTokens";
import {
  defaultRunnerTokens,
  loadRunnerTokens,
  saveRunnerTokens,
  tokenError,
  notebookRelayUrl,
  notebookTokenConfig,
} from "../lib/node-auth";
import { PageTitle } from "./Library";
import type { Update } from "../App";
const connectionTypes: Record<
  string,
  { label: string; url: string; pending?: boolean }
> = {
  comfyui: { label: "ComfyUI", url: "http://127.0.0.1:8188" },
  relay: { label: "Private runner", url: "https://" },
  google: {
    label: "Google AI Studio · Gemini",
    url: "https://generativelanguage.googleapis.com",
  },
  deepseek: { label: "DeepSeek", url: "https://api.deepseek.com" },
  openrouter: { label: "OpenRouter", url: "https://openrouter.ai" },
  fal: { label: "fal.ai", url: "https://fal.run", pending: true },
  "custom-api": { label: "Other API", url: "https://", pending: true },
};
export function Connections({
  settings,
  save,
  project,
  notify,
}: {
  settings: AppSettings;
  save: (s: AppSettings) => Promise<void>;
  project: Project;
  notify: (s: string) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [notebook, setNotebook] = useState(false);
  const [host, setHost] = useState<"colab" | "kaggle">("colab");
  const [nodeIds, setNodeIds] = useState("");
  const [relayUrl, setRelayUrl] = useState("https://");
  const [tokens, setTokens] = useState({ ...defaultRunnerTokens });
  const [tokensReady, setTokensReady] = useState(false);
  const [temporaryTunnel, setTemporaryTunnel] = useState(false);
  const [savingNotebook, setSavingNotebook] = useState(false);
  const openNotebook = async () => {
    setTokensReady(false);
    setNotebook(true);
    try {
      setTokens(await loadRunnerTokens());
      setTokensReady(true);
    } catch {
      notify("Unable to read node tokens from the system vault.");
    }
  };
  const addNotebook = async () => {
    const ids = nodeIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (
      !ids.length ||
      ids.length > (host === "kaggle" ? 2 : 1) ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !/^[a-zA-Z0-9_-]{1,96}$/.test(id))
    ) {
      notify(
        "Paste the notebook's node IDs: one for Colab, one or two for Kaggle.",
      );
      return;
    }
    try {
      if (!tokensReady) return;
      const url = notebookRelayUrl(relayUrl, temporaryTunnel);
      const error = tokenError(tokens);
      if (error) throw new Error(error);
      setSavingNotebook(true);
      await saveRunnerTokens(tokens);
      const connections: Connection[] = [];
      for (const [i, nodeId] of ids.entries()) {
        const id = uid();
        const credentialRef = await call<string>("save_credential", {
          connectionId: id,
          secret: tokens.MYMOVIE_DESKTOP_TOKEN,
        });
        connections.push({
          id,
          name: `${host === "colab" ? "Colab" : "Kaggle"} · GPU ${i}`,
          kind: "relay",
          url,
          credentialRef,
          deploymentId: nodeId,
          apiFamily: null,
          concurrency: 1,
          hosting: host,
        });
      }
      await save({
        ...settings,
        connections: [...settings.connections, ...connections],
      });
      setNotebook(false);
      notify(
        `Added ${connections.length} independent notebook GPU node${connections.length === 1 ? "" : "s"}. Check connection after starting the notebook client.`,
      );
    } catch (e) {
      notify(String(e));
    } finally {
      setSavingNotebook(false);
    }
  };
  const [assistant, setAssistant] = useState<Connection | null>(null);
  const [editing, setEditing] = useState<Connection | null>(null),
    [secret, setSecret] = useState(""),
    [report, setReport] = useState<{ title: string; data: unknown } | null>(
      null,
    ),
    [selected, setSelected] = useState<string[]>([]);
  const operation = useRef(0);
  useEffect(
    () => () => {
      operation.current++;
    },
    [],
  );
  const [reviewed, setReviewed] = useState<{ key: string; id: string } | null>(
    null,
  );
  const reviewKey = (c: Connection) =>
    JSON.stringify([
      c,
      project.workflows.filter((w) => selected.includes(w.id)),
    ]);
  const action = async (
    c: Connection,
    command: string,
    args: Record<string, unknown> = {},
  ) => {
    try {
      const generation = ++operation.current;
      const key = reviewKey(c);
      if (command === "plan_deployment") setReviewed(null);
      let data = await call<Record<string, unknown>>(command, {
        connectionId: c.id,
        ...args,
      });
      const title =
        command === "connection_health"
          ? "Connection health"
          : command === "plan_deployment"
            ? "Workflow initialization"
            : "Runner report";
      setReport({ title, data });
      if (
        native &&
        typeof data.id === "string" &&
        command !== "connection_health"
      ) {
        const id = data.id;
        while (
          operation.current === generation &&
          !["completed", "failed", "unknown", "canceled"].includes(
            String(data.state),
          )
        ) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          if (operation.current !== generation) break;
          data = await call<Record<string, unknown>>("runner_operation", {
            connectionId: c.id,
            operationId: id,
          });
          if (operation.current === generation) setReport({ title, data });
        }
        if (
          command === "plan_deployment" &&
          !args.apply &&
          data.state === "completed"
        ) {
          const report = data.report as { reviewId?: string } | undefined;
          if (report?.reviewId && operation.current === generation)
            setReviewed({ key, id: report.reviewId });
        }
      }
    } catch (e) {
      notify(String(e));
    }
  };
  const saveConnection = async () => {
    if (!editing) return;
    try {
      let c = editing;
      if (secret) {
        const ref = await call<string>("save_credential", {
          connectionId: c.id,
          secret,
        });
        c = { ...c, credentialRef: ref };
      }
      await save({
        ...settings,
        connections: [...settings.connections.filter((x) => x.id !== c.id), c],
      });
      setSecret("");
      setEditing(null);
    } catch (e) {
      notify(String(e));
    }
  };
  const add = () => {
    setSecret("");
    setEditing({
      id: uid(),
      name: "New connection",
      kind: "comfyui",
      url: "http://127.0.0.1:8188",
      credentialRef: null,
      deploymentId: null,
      apiFamily: null,
      concurrency: 1,
    });
  };
  return (
    <>
      <PageTitle
        eyebrow="EXECUTION NETWORK"
        title="Connections"
        description="Local ComfyUI and private outbound runners."
        action={
          <div className="row">
            <button onClick={() => void openNotebook()}>
              <Cloud size={18} />
              Colab / Kaggle
            </button>
            <button className="primary" onClick={add}>
              <Plus size={18} />
              Add connection
            </button>
          </div>
        }
      />
      <div className="filters" aria-label="Filter connections">
        {["all", ...Object.keys(connectionTypes)].map((type) => (
          <button
            key={type}
            className={filter === type ? "active" : ""}
            onClick={() => setFilter(type)}
          >
            {type === "all" ? "All connections" : connectionTypes[type].label}
          </button>
        ))}
      </div>
      <div className="connection-grid">
        {settings.connections
          .filter(
            (c) =>
              c.kind !== "retired" && (filter === "all" || c.kind === filter),
          )
          .map((c) => (
            <article className="panel connection" key={c.id}>
              <header>
                <span className="connection-icon">
                  {[
                    "google",
                    "deepseek",
                    "openrouter",
                    "fal",
                    "custom-api",
                  ].includes(c.kind) ? (
                    <Cloud size={22} />
                  ) : (
                    <Server size={22} />
                  )}
                </span>
                <div>
                  <h2>{c.name}</h2>
                  <span className="badge">
                    {c.hosting
                      ? `${c.hosting === "kaggle" ? "Kaggle" : "Colab"} · private runner`
                      : (connectionTypes[c.kind]?.label ?? c.kind)}
                  </span>
                </div>
              </header>
              <p className="mono">{c.url}</p>
              <small>
                {c.credentialRef
                  ? "Credential stored in system vault"
                  : "No credential configured"}{" "}
                · {c.concurrency} concurrent job{c.concurrency !== 1 ? "s" : ""}
              </small>
              {connectionTypes[c.kind]?.pending && (
                <p className="muted">
                  Saved configuration · execution adapter pending
                </p>
              )}
              <div className="row">
                {["google", "deepseek", "openrouter"].includes(c.kind) ? (
                  <button
                    disabled={!c.credentialRef}
                    onClick={() => setAssistant(c)}
                  >
                    Prompt assistant
                  </button>
                ) : (
                  <button
                    disabled={connectionTypes[c.kind]?.pending}
                    onClick={() => void action(c, "connection_health")}
                  >
                    Check connection
                  </button>
                )}
                <button
                  onClick={() => {
                    setSecret("");
                    setEditing(c);
                  }}
                >
                  Edit
                </button>
              </div>
              {c.kind === "relay" && (
                <>
                  <div className="row">
                    <button
                      onClick={() =>
                        void action(c, "runner_action", { action: "doctor" })
                      }
                    >
                      Doctor
                    </button>
                    <button
                      onClick={() =>
                        void action(c, "runner_action", { action: "inventory" })
                      }
                    >
                      Inventory
                    </button>
                    <button onClick={openActivity}>Activity</button>
                    <button onClick={() => openConsole(c.id)}>Remote console</button>
                    <button
                      onClick={() =>
                        void action(c, "runner_action", { action: "drain" })
                      }
                    >
                      Drain
                    </button>
                  </div>
                  <Picker
                    title="Workflows to initialize"
                    multiple
                    value={selected}
                    options={project.workflows.filter(w => !w.wrapper?.archivedAt).map((w) => ({
                      id: w.id,
                      label: w.name,
                      description: w.version.slice(0, 12),
                    }))}
                    onChange={(id) =>
                      setSelected((x) =>
                        x.includes(id) ? x.filter((v) => v !== id) : [...x, id],
                      )
                    }
                  />
                  <button
                    disabled={!selected.length}
                    onClick={() =>
                      void action(c, "plan_deployment", {
                        workflowIds: selected,
                        guided: true,
                      })
                    }
                  >
                    Review bulk initialization plan
                  </button>
                  <button
                    className="primary"
                    disabled={
                      reviewed?.key !== reviewKey(c) || !selected.length
                    }
                    onClick={() =>
                      void action(c, "plan_deployment", {
                        workflowIds: selected,
                        guided: true,
                        reviewId: reviewed?.id,
                        apply: true,
                      })
                    }
                  >
                    Initialize reviewed workflows
                  </button>
                  <button
                    onClick={() =>
                      void action(c, "runner_action", {
                        action: "runtime-restart",
                      })
                    }
                  >
                    Restart managed ComfyUI
                  </button>
                  <p className="muted">
                    Select workflows and review exact downloads before
                    installation. Restart only when requested, then prepare
                    inputs in Workflows and review again. A successful
                    weight-free canary marks this session ready. Getting started
                    examples include complete instructions in their Guide and
                    Setup tabs.
                  </p>
                </>
              )}
            </article>
          ))}
      </div>
      <article className="panel setup-help">
        <Shield size={24} />
        <div>
          <h2>Private runner setup</h2>
          <p>
            Keep ComfyUI on the server’s loopback interface. The studio’s runner
            connects outward to your authenticated relay; no public ComfyUI port
            or pod IP is required.
          </p>
          <p>
            Local test: keep the OrbStack engine running. Its window may be
            closed. Use the Docker test stack described in the README.
          </p>
          <pre>
            mymovie-agent doctor --comfy-url http://127.0.0.1:8188{"\n"}
            mymovie-agent serve --relay https://YOUR-RELAY --node-id YOUR-NODE
            --comfy-root /path/to/ComfyUI --python /path/to/python
            {"\n"}# Set MYMOVIE_AGENT_TOKEN in the server secret environment
          </pre>
          <p className="muted">
            Cloud setup needs an immutable image, approved model sources and
            private storage. Unresolved dependencies remain blocked.
          </p>
        </div>
      </article>
      {notebook && (
        <Modal
          title="Connect notebook GPUs"
          onClose={() => {
            if (!savingNotebook) {
              setNotebook(false);
            }
          }}
        >
          <Picker
            title="Notebook host"
            value={host}
            options={[
              {
                id: "colab",
                label: "Google Colab",
                description: "One GPU worker",
              },
              {
                id: "kaggle",
                label: "Kaggle",
                description: "One or two independent GPU workers",
              },
            ]}
            onChange={(v) => setHost(v as "colab" | "kaggle")}
          />
          <p>
            Open the bundled{" "}
            {host === "colab" ? "deploy/colab" : "deploy/kaggle"}
            /MyMovie_ComfyUI.ipynb notebook. Install the verified Linux client
            artifact, then Start. Copy the public relay address and generated
            node IDs here. The notebook configures its local relay allowlist.
          </p>
          <Field
            label="Authenticated HTTPS relay"
            value={relayUrl}
            onChange={setRelayUrl}
          />
          <Toggle
            label="Temporary Cloudflare tunnel · polling only"
            checked={temporaryTunnel}
            onChange={setTemporaryTunnel}
          />
          {temporaryTunnel && (
            <p className="muted">
              Paste the notebook's https://…trycloudflare.com address. Keep the
              session running; reconnect with its new address after a restart.
              This mode uses polling, without SSE.
            </p>
          )}
          <Field
            label={
              host === "kaggle"
                ? "Node IDs (comma separated · one per GPU)"
                : "Notebook node ID"
            }
            value={nodeIds}
            onChange={setNodeIds}
          />
          <RunnerTokenFields tokens={tokens} change={setTokens} />
          <button
            disabled={!tokensReady || !!tokenError(tokens)}
            onClick={() =>
              void navigator.clipboard
                .writeText(notebookTokenConfig(tokens))
                .then(() =>
                  notify(
                    "Token assignments copied for the notebook Configure cell.",
                  ),
                )
                .catch(() => notify("Unable to copy token assignments."))
            }
          >
            Copy notebook token configuration
          </button>
          <p className="muted">
            The notebook uses the same predefined pair unless you edit it. The
            app sends only MYMOVIE_DESKTOP_TOKEN; the agent uses
            MYMOVIE_AGENT_TOKEN. ComfyUI stays on loopback. Two Kaggle nodes
            have separate queues and concurrency 1; send one lightweight job to
            each for parallel execution. Their GPU memory is not combined.
          </p>
          <p className="muted">
            A fresh notebook session gets new node IDs. Collect results before
            stopping. A stale heartbeat is shown as offline; expired running
            jobs require reconciliation.
          </p>
          <button
            className="primary"
            disabled={
              !native ||
              !tokensReady ||
              savingNotebook ||
              !nodeIds.trim() ||
              !!tokenError(tokens)
            }
            onClick={() => void addNotebook()}
          >
            {savingNotebook ? "Saving…" : "Add GPU connections"}
          </button>
        </Modal>
      )}
      {assistant && (
        <AssistantDialog
          connection={assistant}
          close={() => setAssistant(null)}
        />
      )}
      {editing && (
        <Modal
          title="Connection settings"
          onClose={() => {
            setEditing(null);
            setSecret("");
          }}
        >
          <Field
            label="Display name"
            value={editing.name}
            onChange={(v) => setEditing({ ...editing, name: v })}
          />
          <Picker
            title="Connection type"
            value={editing.kind}
            options={Object.entries(connectionTypes).map(([id, t]) => ({
              id,
              label: t.label,
              description: t.pending
                ? "Configuration only · execution adapter pending"
                : ["google", "deepseek", "openrouter"].includes(id)
                  ? "Optional text assistance"
                  : "Supported execution adapter",
            }))}
            onChange={(v) =>
              setEditing({
                ...editing,
                kind: v,
                url: connectionTypes[v].url,
                deploymentId: null,
                credentialRef: null,
                apiFamily: null,
              })
            }
          />
          <Field
            label="Endpoint URL"
            value={editing.url}
            onChange={(v) => setEditing({ ...editing, url: v })}
          />
          {editing.kind === "relay" && (
            <Field
              label="Runner node ID"
              value={editing.deploymentId ?? ""}
              onChange={(v) =>
                setEditing({ ...editing, deploymentId: v || null })
              }
            />
          )}
          <Field
            label="Concurrent jobs"
            type="number"
            value={String(editing.concurrency)}
            onChange={(v) =>
              setEditing({
                ...editing,
                concurrency: Math.max(1, Math.min(8, Number(v) || 1)),
              })
            }
          />
          <Field
            label={
              editing.credentialRef
                ? "Replace credential (optional)"
                : "API key / relay token"
            }
            type="password"
            value={secret}
            onChange={setSecret}
          />
          <p className="muted">
            Credentials are stored in the system credential vault and never
            inside movie documents.
          </p>
          <div className="row">
            <button
              className="primary"
              disabled={!editing.name.trim() || !editing.url.trim() || !native}
              onClick={() => void saveConnection()}
            >
              Save connection
            </button>
            <button
              className="danger"
              onClick={() => {
                void save({
                  ...settings,
                  connections: settings.connections.filter(
                    (c) => c.id !== editing.id,
                  ),
                });
                setEditing(null);
              }}
            >
              Remove
            </button>
          </div>
        </Modal>
      )}
      {report && (
        <Modal
          title={report.title}
          onClose={() => {
            operation.current++;
            setReport(null);
          }}
        >
          <pre>{JSON.stringify(report.data, null, 2)}</pre>
        </Modal>
      )}
    </>
  );
}
export function Preferences({
  settings,
  save,
  project,
  update,
  notify,
}: {
  settings: AppSettings;
  save: (s: AppSettings) => Promise<void>;
  project: Project;
  update: Update;
  notify: (s: string) => void;
}) {
  const [tab, setTab] = useState("General"),
    [runtime, setRuntime] = useState(
      JSON.stringify(
        settings.storage.runtimeLock ?? {
          schemaVersion: 1,
          image: "",
          nodeTypes: [],
          artifacts: [],
        },
        null,
        2,
      ),
    ),
    [profile, setProfile] = useState(
      JSON.stringify(
        settings.storage.provisionProfile ?? {
          schemaVersion: 1,
          runtime: { kind: "native", fingerprint: "" },
          nodeTypes: [],
          artifacts: [],
          canary: {},
        },
        null,
        2,
      ),
    ),
    [custom, setCustom] = useState(project.ratio),
    [storage, setStorage] = useState(settings.storage),
    [secret, setSecret] = useState(""),
    [assetIds, setAssetIds] = useState<string[]>([]),
    [report, setReport] = useState<unknown>(null);
  const persistStorage = async () => {
    let next = storage;
    if (secret) {
      const ref = await call<string>("save_credential", {
        connectionId: "storage-transfer",
        secret,
      });
      next = { ...storage, transferCredentialRef: ref };
      setStorage(next);
      setSecret("");
    }
    await save({ ...settings, storage: next });
  };
  const sync = async (direction: string) => {
    try {
      await persistStorage();
      setReport(await call("sync_storage", { direction, assetIds }));
    } catch (e) {
      notify(String(e));
    }
  };
  return (
    <>
      <PageTitle
        eyebrow="YOUR STUDIO"
        title="Settings"
        description="Movie defaults, appearance and private asset storage."
      />
      <div
        className="settings-tabs"
        role="tablist"
        aria-label="Studio settings"
      >
        {[
          "General",
          "Media & FFmpeg",
          "S3 & LoRA",
          "RunPod",
          "App Runner",
          "Node access",
          "Language",
        ].map((name) => (
          <button
            role="tab"
            aria-selected={tab === name}
            className={tab === name ? "selected" : ""}
            key={name}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="settings-grid">
        {tab === "Node access" && <RunnerTokenSettings notify={notify} />}
        {tab === "General" && (
          <article className="panel">
            <h2>Movie defaults</h2>
            <Field
              label="Movie name"
              value={project.name}
              onChange={(v) => {
                if (v.trim())
                  update((p) => {
                    p.name = v;
                  });
              }}
            />
            <Picker
              title="Default aspect ratio"
              value={project.ratio}
              options={ratios.map((r) => ({ id: r, label: r }))}
              onChange={(v) => {
                setCustom(v);
                update((p) => {
                  p.ratio = v;
                });
              }}
            />
            <Field
              label="Custom ratio · width:height"
              value={custom}
              onChange={setCustom}
            />
            <button
              onClick={() => {
                if (
                  /^\d+(\.\d+)?:\d+(\.\d+)?$/.test(custom) &&
                  custom.split(":").every((n) => Number(n) > 0)
                )
                  update((p) => {
                    p.ratio = custom;
                  });
                else notify("Enter positive width:height values");
              }}
            >
              Apply custom ratio
            </button>
            <p className="muted">
              Frames can inherit or override this ratio. Workflows validate
              their own pixel dimensions.
            </p>
          </article>
        )}
        {tab === "General" && (
          <article className="panel">
            <h2>Appearance</h2>
            <Picker
              title="Theme"
              value={settings.theme || "light"}
              options={[
                { id: "light", label: "Fenki paper · light" },
                { id: "dark", label: "Fenki ink · dark" },
              ]}
              onChange={(v) =>
                void save({ ...settings, theme: v }).catch((e) =>
                  notify(String(e)),
                )
              }
            />
            <p>
              Manrope and IBM Plex Mono are bundled locally. System focus,
              reduced motion and keyboard navigation are supported.
            </p>
            <h3>Workflow compiler</h3>
            <Field
              label="Compiler Python executable"
              value={String(storage.compilerPython ?? "python3")}
              onChange={(v) => setStorage({ ...storage, compilerPython: v })}
            />
            <Field
              label="Chromium executable (optional override)"
              value={String(storage.compilerBrowser ?? "")}
              onChange={(v) => setStorage({ ...storage, compilerBrowser: v })}
            />
            <p>
              Install Playwright and Chromium for this Python once. Preparation
              uses an isolated browser with your target’s installed frontend; it
              never submits a generation.
            </p>
            <button onClick={() => void save({ ...settings, storage })}>
              Save compiler settings
            </button>
            <h3>Browser profiles · upcoming</h3>
            <p className="muted">
              Isolated manual logins for Flow and other image providers are
              planned. Profile sessions will stay outside movie documents.
            </p>
          </article>
        )}
        {tab === "S3 & LoRA" && (
          <article className="panel storage-panel">
            <div className="row">
              <HardDrive size={24} />
              <h2>Private storage & LoRA sync</h2>
            </div>
            <p>
              Use short-lived, object-scoped signed URLs for private uploads and
              downloads. Verify size and SHA256 before importing results.
            </p>
            <Field
              label="S3-compatible endpoint (HTTPS)"
              value={String(storage.endpoint ?? "")}
              onChange={(v) => setStorage({ ...storage, endpoint: v })}
            />
            <Field
              label="Private bucket"
              value={String(storage.bucket ?? "")}
              onChange={(v) => setStorage({ ...storage, bucket: v })}
            />
            <Field
              label="Manifest / signed transfer URL"
              type="password"
              value={secret}
              onChange={setSecret}
            />
            <Picker
              title="Selected LoRA assets"
              multiple
              value={assetIds}
              options={project.assets
                .filter((a) => a.kind === "lora")
                .map((a) => ({
                  id: a.id,
                  label: a.name,
                  description: a.sha256.slice(0, 16),
                }))}
              onChange={(id) =>
                setAssetIds((x) =>
                  x.includes(id) ? x.filter((v) => v !== id) : [...x, id],
                )
              }
            />
            <div className="row">
              <button
                onClick={() =>
                  void persistStorage().catch((e) => notify(String(e)))
                }
              >
                Save storage settings
              </button>
              <button onClick={() => void sync("push")}>
                Review & upload LoRAs
              </button>
              <button onClick={() => void sync("pull")}>
                Download verified results
              </button>
            </div>
            <p className="muted">
              Manifests must declare compatible architecture, hash, size and
              approved license/source. This screen syncs artifacts; training
              comes in a later milestone.
            </p>
          </article>
        )}
        {tab === "Media & FFmpeg" && (
          <article className="panel storage-panel">
            <h2>Local media tools</h2>
            <Field
              label="FFmpeg executable path (optional)"
              value={String(storage.ffmpegPath ?? "")}
              onChange={(v) => setStorage({ ...storage, ffmpegPath: v })}
            />
            <p className="muted">
              Leave empty for automatic discovery. macOS: install with Homebrew
              using brew install ffmpeg. Linux: sudo apt install ffmpeg. Save
              settings, then retry the video preview.
            </p>
            <p>
              Verify the local decoder before creating thumbnails and inspecting
              video files.
            </p>
            <button
              onClick={() =>
                void call("media_tools")
                  .then(setReport)
                  .catch((e) => notify(String(e)))
              }
            >
              Check FFmpeg & FFprobe
            </button>
            <p className="muted">
              Original media is copied into the movie document, hashed and
              preserved. Generated results use the same import path.
            </p>
          </article>
        )}
        {(tab === "RunPod" || tab === "App Runner") && (
          <article className="panel storage-panel">
            <h2>
              {tab === "RunPod"
                ? "Private RunPod execution"
                : "Pinned runner runtime"}
            </h2>
            <p>
              Use your own immutable Docker image. The runner connects outward
              to the relay, stages approved artifacts and returns results
              through authenticated transfers.
            </p>
            <h3>First-session readiness</h3>
            <p>
              Use Connections → Inventory to get the native runtime fingerprint.
              Docker profiles use the actual immutable image digest. Model, LoRA
              and plugin files need verified SHA256, size, license,
              architecture, category and relative target; use sourceRef for
              private S3 transfers.
            </p>
            <Field
              label="Provisioning profile · JSON"
              value={profile}
              onChange={setProfile}
              multiline
            />
            <button
              className="primary"
              onClick={() => {
                try {
                  const value = JSON.parse(profile);
                  void call("validate_profile", { profile: value })
                    .then(() =>
                      save({
                        ...settings,
                        storage: {
                          ...settings.storage,
                          provisionProfile: value,
                        },
                      }),
                    )
                    .then(() =>
                      notify("Provisioning profile verified and saved"),
                    )
                    .catch((e) => notify(String(e)));
                } catch {
                  notify("Enter valid profile JSON");
                }
              }}
            >
              Validate & save initialization profile
            </button>
            <p className="muted">
              Templates and exact Colab/RunPod setup: deploy/runner/README.md.
              External Mac ComfyUI stays read-only. New notebook sessions and
              changed files require initialization again.
            </p>
            <Field
              label="Runtime lock · JSON"
              value={runtime}
              onChange={setRuntime}
              multiline
            />
            <button
              className="primary"
              onClick={() => {
                try {
                  const lock = JSON.parse(runtime);
                  void call("validate_runtime", { runtime: lock })
                    .then(() =>
                      save({
                        ...settings,
                        storage: { ...settings.storage, runtimeLock: lock },
                      }),
                    )
                    .then(() => notify("Runtime lock verified and saved"))
                    .catch((e) => notify(String(e)));
                } catch {
                  notify("Enter valid runtime JSON");
                }
              }}
            >
              Validate & save runtime lock
            </button>
            <p className="muted">
              Specify schemaVersion, image@sha256, nodeTypes and artifacts with
              source, SHA256, size, architecture, license and model-relative
              target. Unknown nodes or models stay blocked. Bulk initialize
              imported workflows from Connections.
            </p>
            <pre>
              mymovie-agent doctor --comfy-url http://127.0.0.1:8188
              {String.fromCharCode(10)}mymovie-agent serve --relay
              https://YOUR-RELAY --node-id YOUR-NODE --comfy-root
              /path/to/ComfyUI --python /path/to/python
            </pre>
            <p>
              Cloud deployment requires your relay host, private storage and
              selected image. This app does not rent pods automatically.
            </p>
          </article>
        )}
        {tab === "Language" && (
          <article className="panel storage-panel">
            <h2>Documentation languages</h2>
            <p>
              English, Russian and French setup guides ship with the studio.
            </p>
            <p className="muted">
              The current application interface is English. Complete interface
              translation is a later milestone.
            </p>
          </article>
        )}
      </div>
      {report && (
        <Modal title="Private storage transfer" onClose={() => setReport(null)}>
          <pre>{JSON.stringify(report, null, 2)}</pre>
        </Modal>
      )}
    </>
  );
}
