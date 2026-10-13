import { AssistantDialog } from "./PromptAssistant";
import { useState } from "react";
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
import { PageTitle } from "./Library";
import type { Update } from "../App";
const connectionTypes: Record<string, { label: string; url: string; pending?: boolean }> = {
  comfyui: { label: "ComfyUI", url: "http://127.0.0.1:8188" },
  runninghub: { label: "RunningHub", url: "https://www.runninghub.ai" },
  relay: { label: "Private runner", url: "https://" },
  google: { label: "Google AI Studio · Gemini", url: "https://generativelanguage.googleapis.com" },
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
  const [assistant, setAssistant] = useState<Connection | null>(null);
  const [editing, setEditing] = useState<Connection | null>(null),
    [secret, setSecret] = useState(""),
    [report, setReport] = useState<{ title: string; data: unknown } | null>(
      null,
    ),
    [selected, setSelected] = useState<string[]>([]);
  const action = async (
    c: Connection,
    command: string,
    args: Record<string, unknown> = {},
  ) => {
    try {
      const data = await call(command, { connectionId: c.id, ...args });
      setReport({
        title:
          command === "connection_health"
            ? "Connection health"
            : command === "plan_deployment"
              ? "Workflow initialization plan"
              : "Runner report",
        data,
      });
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
        description="Local ComfyUI, isolated RunningHub accounts and private outbound runners."
        action={
          <button className="primary" onClick={add}>
            <Plus size={18} />
            Add connection
          </button>
        }
      />
      <div className="filters" aria-label="Filter connections">
        {["all", ...Object.keys(connectionTypes)].map(type => <button key={type} className={filter === type ? "active" : ""} onClick={() => setFilter(type)}>{type === "all" ? "All connections" : connectionTypes[type].label}</button>)}
      </div>
      <div className="connection-grid">
        {settings.connections
          .filter(c => filter === "all" || c.kind === filter)
          .map((c) => (
            <article className="panel connection" key={c.id}>
              <header>
                <span className="connection-icon">
                  {["runninghub", "google", "deepseek", "openrouter", "fal", "custom-api"].includes(c.kind) ? (
                    <Cloud size={22} />
                  ) : (
                    <Server size={22} />
                  )}
                </span>
                <div>
                  <h2>{c.name}</h2>
                  <span className="badge">{connectionTypes[c.kind]?.label ?? c.kind}</span>
                </div>
              </header>
              <p className="mono">{c.url}</p>
              <small>
                {c.credentialRef
                  ? "Credential stored in Keychain"
                  : "No credential configured"}{" "}
                · {c.concurrency} concurrent job{c.concurrency !== 1 ? "s" : ""}
              </small>
              {connectionTypes[c.kind]?.pending && <p className="muted">Saved configuration · execution adapter pending</p>}
              <div className="row">
                {["google", "deepseek", "openrouter"].includes(c.kind) ? <button disabled={!c.credentialRef} onClick={() => setAssistant(c)}>Prompt assistant</button> : <button disabled={connectionTypes[c.kind]?.pending} onClick={() => void action(c, "connection_health")}>Check connection</button>}
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
                    options={project.workflows.map((w) => ({
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
                    onClick={() =>
                      void action(c, "plan_deployment", {
                        workflowIds: selected,
                      })
                    }
                  >
                    Review bulk initialization plan
                  </button>
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
            {"\n"}# Set MYMOVIE_AGENT_TOKEN in the server secret environment
          </pre>
          <p className="muted">
            Cloud setup needs an immutable image, approved model sources and
            private storage. Unresolved dependencies remain blocked.
          </p>
        </div>
      </article>
      {assistant && <AssistantDialog connection={assistant} close={() => setAssistant(null)} />}
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
            options={Object.entries(connectionTypes).map(([id, t]) => ({ id, label: t.label, description: t.pending ? "Configuration only · execution adapter pending" : ["google", "deepseek", "openrouter"].includes(id) ? "Optional text assistance" : "Supported execution adapter" }))}
            onChange={(v) =>
              setEditing({
                ...editing,
                kind: v,
                url: connectionTypes[v].url,
                deploymentId: null,
                credentialRef: null,
                apiFamily: v === "runninghub" ? "ai-app" : null,
              })
            }
          />
          <Field
            label="Endpoint URL"
            value={editing.url}
            onChange={(v) => setEditing({ ...editing, url: v })}
          />
          {(editing.kind === "runninghub" || editing.kind === "relay") && (
            <>
              {editing.kind === "runninghub" && <Picker
                title="RunningHub API family"
                value={editing.apiFamily ?? "ai-app"}
                options={[
                  {
                    id: "ai-app",
                    label: "AI App · verified deployment inputs",
                  },
                  { id: "workflow", label: "Workflow · API-format bindings" },
                ]}
                onChange={(v) => setEditing({ ...editing, apiFamily: v })}
              />}
              <Field
                label={
                  editing.kind === "relay"
                    ? "Runner node ID"
                    : "Authorized deployment ID"
                }
                value={editing.deploymentId ?? ""}
                onChange={(v) =>
                  setEditing({ ...editing, deploymentId: v || null })
                }
              />
              <p className="muted">
                Workflow and AI App IDs are separate. Configure bindings from
                the account’s verified API schema before submitting.
              </p>
            </>
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
            Credentials are stored in macOS Keychain and never inside movie
            documents.
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
        <Modal title={report.title} onClose={() => setReport(null)}>
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
    [runtime, setRuntime] = useState(JSON.stringify(settings.storage.runtimeLock ?? { schemaVersion: 1, image: "", nodeTypes: [], artifacts: [] }, null, 2)),
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
      <div className="settings-tabs" role="tablist" aria-label="Studio settings">
        {["General", "Media & FFmpeg", "S3 & LoRA", "RunPod", "App Runner", "Language"].map(name => <button role="tab" aria-selected={tab === name} className={tab === name ? "selected" : ""} key={name} onClick={() => setTab(name)}>{name}</button>)}
      </div>
      <div className="settings-grid">
        {tab === "General" && <article className="panel">
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
            Frames can inherit or override this ratio. Workflows validate their
            own pixel dimensions.
          </p>
        </article>}
        {tab === "General" && <article className="panel">
          <h2>Appearance</h2>
          <Picker
            title="Theme"
            value={settings.theme || "light"}
            options={[
              { id: "light", label: "Fenki paper · light" },
              { id: "dark", label: "Fenki ink · dark" },
            ]}
            onChange={(v) => void save({ ...settings, theme: v }).catch(e => notify(String(e)))}
          />
          <p>
            Manrope and IBM Plex Mono are bundled locally. System focus, reduced
            motion and keyboard navigation are supported.
          </p>
          <h3>Browser profiles · upcoming</h3>
          <p className="muted">
            Isolated manual logins for Flow and other image providers are
            planned. Profile sessions will stay outside movie documents.
          </p>
        </article>}
        {tab === "S3 & LoRA" && <article className="panel storage-panel">
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
            approved license/source. This screen syncs artifacts; training comes
            in a later milestone.
          </p>
        </article>}
        {tab === "Media & FFmpeg" && <article className="panel storage-panel">
          <h2>Local media tools</h2><p>Verify the local decoder before creating thumbnails and inspecting video files.</p>
          <button onClick={() => void call("media_tools").then(setReport).catch(e => notify(String(e)))}>Check FFmpeg & FFprobe</button>
          <p className="muted">Original media is copied into the movie document, hashed and preserved. Generated results use the same import path.</p>
        </article>}
        {(tab === "RunPod" || tab === "App Runner") && <article className="panel storage-panel">
          <h2>{tab === "RunPod" ? "Private RunPod execution" : "Pinned runner runtime"}</h2>
          <p>Use your own immutable Docker image. The runner connects outward to the relay, stages approved artifacts and returns results through authenticated transfers.</p>
          <Field label="Runtime lock · JSON" value={runtime} onChange={setRuntime} multiline />
          <button className="primary" onClick={() => {
            try { const lock = JSON.parse(runtime); void call("validate_runtime", { runtime: lock }).then(() => save({ ...settings, storage: { ...settings.storage, runtimeLock: lock } })).then(() => notify("Runtime lock verified and saved")).catch(e => notify(String(e))); }
            catch { notify("Enter valid runtime JSON"); }
          }}>Validate & save runtime lock</button>
          <p className="muted">Specify schemaVersion, image@sha256, nodeTypes and artifacts with source, SHA256, size, architecture, license and model-relative target. Unknown nodes or models stay blocked. Bulk initialize imported workflows from Connections.</p>
          <pre>mymovie-agent doctor --comfy-url http://127.0.0.1:8188{String.fromCharCode(10)}mymovie-agent serve --relay https://YOUR-RELAY --node-id YOUR-NODE</pre>
          <p>Cloud deployment requires your relay host, private storage and selected image. This app does not rent pods automatically.</p>
        </article>}
        {tab === "Language" && <article className="panel storage-panel">
          <h2>Documentation languages</h2><p>English, Russian and French setup guides ship with the studio.</p>
          <p className="muted">The current application interface is English. Complete interface translation is a later milestone.</p>
        </article>}
      </div>
      {report && (
        <Modal title="Private storage transfer" onClose={() => setReport(null)}>
          <pre>{JSON.stringify(report, null, 2)}</pre>
        </Modal>
      )}
    </>
  );
}
