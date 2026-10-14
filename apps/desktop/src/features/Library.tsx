import { WorkflowTarget } from "../components/WorkflowTarget";
import { WorkflowSetup, compatibilityLabel } from "../components/WorkflowSetup";
import { useState, useEffect } from "react";
import { Plus, Image, Upload, X, Workflow as WorkflowIcon } from "lucide-react";
import { Field, Modal, Picker, Empty } from "../components/Controls";
import { call, mediaUrl, posterUrl, native } from "../lib/bridge";
import {
  uid,
  type Project,
  type Job,
  type Binding,
  type Asset,
  type AppSettings,
} from "../lib/types";
import {
  assetUsage,
  characterUsage,
  type FrameLocation,
} from "../lib/project-usage";
import type { Update } from "../App";
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="view-title">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Media({ asset, root }: { asset: Asset; root: string }) {
  const [poster, setPoster] = useState(false),
    [previewError, setPreviewError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let stopped = false;
    setPoster(false);
    setPreviewError("");
    if (asset.kind === "video" && native)
      void call<boolean>("video_thumbnail", { assetId: asset.id })
        .then((v) => {
          if (!stopped) setPoster(v);
        })
        .catch((e) => {
          if (!stopped) setPreviewError(String(e));
        });
    return () => {
      stopped = true;
    };
  }, [root, asset.id, asset.sha256, retry]);
  if (
    !mediaUrl(root, asset) &&
    ["image", "video", "audio"].includes(asset.kind)
  ) {
    return (
      <div className="file-placeholder">
        {asset.kind} · {asset.name}
      </div>
    );
  }
  return asset.kind === "video" ? (
    <div className="video-preview">
      <video
        controls
        preload="metadata"
        poster={poster ? posterUrl(asset) : undefined}
        src={mediaUrl(root, asset)}
      />
      {previewError && (
        <button
          className="text-button"
          title={previewError}
          onClick={() => setRetry((v) => v + 1)}
        >
          Preview unavailable · retry
        </button>
      )}
    </div>
  ) : asset.kind === "audio" ? (
    <audio controls src={mediaUrl(root, asset)} />
  ) : asset.kind === "image" ? (
    <img src={mediaUrl(root, asset)} alt={asset.name} />
  ) : (
    <div className="file-placeholder">LoRA · {asset.name}</div>
  );
}
export function Characters({
  project: p,
  root,
  update,
  onImport,
  onNavigate,
  onFilterCharacter,
}: {
  onNavigate: (f: FrameLocation) => void;
  onFilterCharacter: (id: string) => void;
  project: Project;
  root: string;
  update: Update;
  onImport: (characterId: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const c = p.characters.find((c) => c.id === selected);
  return (
    <>
      <PageTitle
        eyebrow="SHARED REFERENCES"
        title="Characters"
        description="One cast. Consistent across every scene."
        action={
          <button
            className="primary"
            onClick={() => {
              const id = uid();
              update((p) => {
                p.characters.push({
                  id,
                  name: "New character",
                  description: "",
                  assetIds: [],
                  revision: 1,
                });
              });
              setSelected(id);
            }}
          >
            <Plus size={18} />
            New character
          </button>
        }
      />
      <div className="asset-grid">
        {p.characters.map((c, i) => (
          <button
            className="character-card"
            data-file-drop="character"
            data-character-id={c.id}
            key={c.id}
            onClick={() => setSelected(c.id)}
          >
            <div className={`portrait tone-${i % 4}`}>
              {c.assetIds[0] && p.assets.find((a) => a.id === c.assetIds[0]) ? (
                <Media
                  asset={p.assets.find((a) => a.id === c.assetIds[0])!}
                  root={root}
                />
              ) : (
                <span>
                  {c.name
                    .split(" ")
                    .map((s) => s[0])
                    .join("")
                    .slice(0, 2)}
                </span>
              )}
            </div>
            <strong>{c.name}</strong>
            <p>{c.description || "Add appearance and continuity notes"}</p>
            <small>
              Revision {c.revision} · {c.assetIds.length} references ·{" "}
              {characterUsage(p, c.id).length} keyframes
            </small>
          </button>
        ))}
      </div>
      {c && (
        <Modal
          title="Edit character"
          onClose={() => {
            if (!importing) setSelected("");
          }}
        >
          <fieldset
            className="character-editor"
            disabled={importing}
            data-file-drop="character"
            data-character-id={c.id}
          >
            <Field
              label="Name"
              value={c.name}
              onChange={(v) =>
                update((p) => {
                  const ch = p.characters.find((x) => x.id === c.id)!;
                  ch.name = v;
                  ch.revision++;
                })
              }
            />
            <Field
              label="Appearance & continuity"
              multiline
              value={c.description}
              onChange={(v) =>
                update((p) => {
                  const ch = p.characters.find((x) => x.id === c.id)!;
                  ch.description = v;
                  ch.revision++;
                })
              }
            />
            <section className="usage-list">
              <h3>Used in {characterUsage(p, c.id).length} keyframes</h3>
              <button
                onClick={() => {
                  setSelected("");
                  onFilterCharacter(c.id);
                }}
              >
                Filter keyframes for this character
              </button>
              {characterUsage(p, c.id).map((f) => (
                <button
                  key={f.frameId}
                  onClick={() => {
                    setSelected("");
                    onNavigate(f);
                  }}
                >
                  {f.label}
                </button>
              ))}
            </section>
            <div className="row">
              <button
                className="primary"
                onClick={async () => {
                  setImporting(true);
                  setImportError("");
                  try {
                    await onImport(c.id);
                  } catch (e) {
                    setImportError(String(e));
                  } finally {
                    setImporting(false);
                  }
                }}
              >
                <Upload size={18} />
                {importing ? "Importing images…" : "Import reference images"}
              </button>
            </div>
            {importError && <p role="alert">{importError}</p>}
            <div
              className="reference-drop-zone"
              data-file-drop="character"
              data-character-id={c.id}
            >
              <Upload size={22} />
              <strong>Drop reference images for {c.name}</strong>
              <small>Uses the Media imports choice in the top bar</small>
            </div>
            <div className="reference-grid">
              {c.assetIds
                .map((id) => p.assets.find((a) => a.id === id))
                .filter((a): a is Asset => !!a)
                .map((a) => (
                  <figure key={a.id}>
                    <Media asset={a} root={root} />
                    <figcaption>{a.name}</figcaption>
                    <button
                      className="icon-button"
                      aria-label={`Detach ${a.name}`}
                      onClick={() =>
                        update((p) => {
                          const ch = p.characters.find((x) => x.id === c.id)!;
                          ch.assetIds = ch.assetIds.filter((id) => id !== a.id);
                          ch.revision++;
                        })
                      }
                    >
                      <X size={16} />
                    </button>
                  </figure>
                ))}
            </div>
            <Picker
              title="Reference images"
              multiple
              value={c.assetIds}
              options={p.assets
                .filter((a) => a.kind === "image")
                .map((a) => ({ id: a.id, label: a.name }))}
              onChange={(v) =>
                update((p) => {
                  const ch = p.characters.find((x) => x.id === c.id)!;
                  ch.assetIds = ch.assetIds.includes(v)
                    ? ch.assetIds.filter((x) => x !== v)
                    : [...ch.assetIds, v];
                  ch.revision++;
                })
              }
            />
            <button
              className="danger"
              onClick={() => {
                update((p) => {
                  p.characters = p.characters.filter((x) => x.id !== c.id);
                  for (const e of p.episodes)
                    for (const s of e.scenes) {
                      s.characterIds = (s.characterIds ?? []).filter(
                        (x) => x !== c.id,
                      );
                      for (const sh of s.shots)
                        for (const f of sh.frames)
                          f.characterIds = f.characterIds.filter(
                            (x) => x !== c.id,
                          );
                    }
                });
                setSelected("");
              }}
            >
              Remove character
            </button>
          </fieldset>
        </Modal>
      )}
    </>
  );
}
export function Library({
  project: p,
  root,
  onImport,
  onCollect,
  onRelink,
  onNavigate,
}: {
  onNavigate: (f: FrameLocation) => void;
  project: Project;
  root: string;
  onImport: () => void;
  onCollect: () => Promise<void>;
  onRelink: (assetId: string) => Promise<void>;
}) {
  const [usageId, setUsageId] = useState("");
  const usage = usageId ? assetUsage(p, usageId) : null;
  const [filter, setFilter] = useState("all");
  const [availability, setAvailability] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    void call<Record<string, boolean>>("asset_availability")
      .then((v) => {
        if (!stopped) setAvailability(v);
      })
      .catch(() => {});
    return () => {
      stopped = true;
    };
  }, [p.revision]);
  const action = async (fn: () => Promise<void>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    }
  };
  const linked = p.assets.filter((a) => a.sourcePath);
  return (
    <>
      <PageTitle
        eyebrow="MOVIE ASSETS"
        title="Library"
        description="Shared originals and linked materials. Collect linked files into your movie before export."
        action={
          <button className="primary" onClick={onImport}>
            <Upload size={18} />
            Import media
          </button>
        }
      />
      <div className="panel row collection-panel">
        <div className="spacer">
          <strong>
            {linked.length
              ? `${linked.length} linked materials`
              : "All materials are inside this movie"}
          </strong>
          <p className="muted">
            Copy or keep original locations with Media imports. Collect makes
            the saved movie portable.
          </p>
        </div>
        <button
          disabled={!linked.length}
          onClick={() => void action(onCollect)}
        >
          Collect for export
        </button>
        <button
          onClick={() =>
            void action(async () =>
              setAvailability(
                await call("asset_availability", { verify: true }),
              ),
            )
          }
        >
          Check files
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <button
        className="library-drop-zone"
        data-file-drop="library"
        onClick={onImport}
      >
        <Upload size={24} />
        <span>
          <strong>Drop media here, or choose files</strong>
          <small>
            Images, video, audio and LoRAs · follows Media imports above
          </small>
        </span>
      </button>
      <div className="filters">
        {["all", "image", "video", "audio", "lora"].map((k) => (
          <button
            key={k}
            className={filter === k ? "active" : ""}
            onClick={() => setFilter(k)}
          >
            {k === "all" ? "All assets" : k}
          </button>
        ))}
      </div>
      {p.assets.length === 0 ? (
        <Empty
          title="Build your visual library"
          action={
            <button onClick={onImport}>
              <Image size={18} />
              Import your first image or video
            </button>
          }
        >
          Images, clips and character references will be stored inside this
          movie.
        </Empty>
      ) : (
        <div className="asset-grid">
          {p.assets
            .filter((a) => filter === "all" || a.kind === filter)
            .map((a) => (
              <article className="media-card panel" key={a.id}>
                <Media asset={a} root={root} />
                <strong className="asset-name" title={a.name}>
                  {a.name}
                </strong>
                <span className="badge">
                  {a.sourcePath ? "Linked original" : "Inside movie"}
                </span>
                {a.sourcePath && (
                  <small className="source-path" title={a.sourcePath}>
                    {a.sourcePath}
                  </small>
                )}
                {availability[a.id] === false && (
                  <p role="alert">Original missing or changed</p>
                )}
                {a.sourcePath && (
                  <button onClick={() => void action(() => onRelink(a.id))}>
                    Relink original
                  </button>
                )}
                <small>
                  {a.kind} · {(a.size / 1024 / 1024).toFixed(2)} MB
                </small>
                <button onClick={() => setUsageId(a.id)}>
                  Usage · {assetUsage(p, a.id).frames.length} keyframes
                </button>
                <code title={a.sha256}>SHA256 {a.sha256.slice(0, 16)}…</code>
              </article>
            ))}
        </div>
      )}
      {usage && (
        <Modal title="Material usage" onClose={() => setUsageId("")}>
          <div className="usage-list">
            {!usage.frames.length && (
              <p>No keyframe placement or assigned character references.</p>
            )}
            {usage.frames.map((f) => (
              <button
                key={f.frameId}
                onClick={() => {
                  setUsageId("");
                  onNavigate(f);
                }}
              >
                <strong>{f.kind}</strong>
                <small>{f.label}</small>
              </button>
            ))}
            <h3>Draft references</h3>
            {usage.drafts.length ? (
              usage.drafts.map((name, i) => <p key={i}>{name}</p>)
            ) : (
              <p>None</p>
            )}
            <p className="muted">
              A character reference is available to the frame; this does not
              prove it was used by a completed render.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Workflows({
  project: p,
  settings,
  update,
  onImport,
  onGenerate,
  prepare,
  notify,
}: {
  prepare: (w: string, c: string) => Promise<void>;
  notify: (s: string) => void;
  project: Project;
  settings: AppSettings;
  update: Update;
  onImport: () => void;
  onGenerate: (frameId: string, workflowId: string) => void;
}) {
  const [selected, setSelected] = useState(""),
    [targetId, setTargetId] = useState(
      settings.connections.find((c) => ["comfyui", "relay"].includes(c.kind))
        ?.id ?? "",
    ),
    [nodeId, setNode] = useState(""),
    [input, setInput] = useState(""),
    [semantic, setSemantic] = useState("positivePrompt"),
    [valueType, setType] = useState("string"),
    [frameId, setFrameId] = useState(""),
    [mediaKind, setMediaKind] = useState("all");
  const w = p.workflows.find((w) => w.id === selected);
  const add = () => {
    if (!w) return;
    const b: Binding = { nodeId, input, semantic, valueType };
    update((p) => {
      const x = p.workflows.find((x) => x.id === w.id)!;
      x.bindings = [...x.bindings.filter((y) => y.semantic !== semantic), b];
    });
  };
  return (
    <>
      <PageTitle
        eyebrow="GENERATION DEFINITIONS"
        title="Workflows"
        description="Choose saved workflows, prepare their inputs, and preserve every original version."
        action={
          <button className="primary" onClick={onImport}>
            <Upload size={18} />
            Browse workflow catalogue
          </button>
        }
      />
      <Picker
        title="Preparation target"
        value={targetId}
        options={settings.connections
          .filter((c) => ["comfyui", "relay", "runninghub"].includes(c.kind))
          .map((c) => ({ id: c.id, label: c.name, description: c.kind }))}
        onChange={setTargetId}
      />
      <Picker
        title="Workflow category"
        value={mediaKind}
        options={[
          { id: "all", label: "All workflows" },
          { id: "image", label: "Image workflows" },
          { id: "video", label: "Video workflows" },
          { id: "other", label: "Other workflows" },
        ]}
        onChange={setMediaKind}
      />
      {p.workflows.length === 0 ? (
        <Empty
          title="Bring your workflow"
          action={
            <button onClick={onImport}>Choose or import a workflow</button>
          }
        >
          LTX and MINIMAX exports can be imported here. Availability is checked
          against the selected server before submission.
        </Empty>
      ) : (
        <div className="asset-grid">
          {p.workflows
            .filter(
              (w) =>
                mediaKind === "all" || (w.mediaKind ?? "other") === mediaKind,
            )
            .map((w) => (
              <button
                className="panel workflow-card"
                key={w.id}
                onClick={() => setSelected(w.id)}
              >
                <WorkflowIcon size={28} />
                <strong>{w.name}</strong>
                <small>
                  {Object.keys(w.graph).length
                    ? `${Object.keys(w.graph).length} nodes · ${w.bindings.length} bindings`
                    : "Editor workflow · prepare to discover inputs"}
                </small>
                <span className="compatibility-badge">
                  {compatibilityLabel(w)}
                </span>
                <code>{w.version.slice(0, 16)}</code>
              </button>
            ))}
        </div>
      )}
      {w && (
        <Modal title={w.name} onClose={() => setSelected("")}>
          <WorkflowTarget
            workflow={w}
            connection={settings.connections.find((c) => c.id === targetId)}
            prepare={prepare}
            notify={notify}
          />
          <WorkflowSetup
            workflow={w}
            connectionId={targetId}
            change={(requirements) =>
              update((p) => {
                p.workflows.find((x) => x.id === w.id)!.requirements =
                  requirements;
              })
            }
          />
          <h3>Generate a keyframe</h3>
          <Picker
            title="Target keyframe"
            value={frameId}
            options={p.episodes.flatMap((e) =>
              e.scenes.flatMap((s) =>
                s.shots.flatMap((sh) =>
                  sh.frames.map((f) => ({
                    id: f.id,
                    label: `${e.name} / ${s.name} / ${f.name}`,
                  })),
                ),
              ),
            )}
            onChange={setFrameId}
          />
          <button
            className="primary"
            disabled={!frameId}
            onClick={() => {
              setSelected("");
              onGenerate(frameId, w.id);
            }}
          >
            Create generation job
          </button>
          <p className="muted">
            Choose a keyframe, then review the account and job inputs before
            submission.
          </p>
          <h3>RunningHub deployments</h3>
          <p className="muted">
            An API export contains the graph, not its hosted deployment ID. Use
            the Workflow ID from RunningHub for this same graph, or an AI App ID
            with matching published inputs. Each account can use a different
            deployment.
          </p>
          {settings.connections.filter((c) => c.kind === "runninghub")
            .length === 0 && (
            <p>
              Add a RunningHub account and its API key in Connections first.
            </p>
          )}
          {settings.connections
            .filter((c) => c.kind === "runninghub")
            .map((c) => {
              const d = w.deployments?.find((d) => d.connectionId === c.id);
              const setDeployment = (change: {
                deploymentId?: string;
                apiFamily?: string;
              }) =>
                update((p) => {
                  const x = p.workflows.find((x) => x.id === w.id)!;
                  const next = {
                    connectionId: c.id,
                    deploymentId: d?.deploymentId ?? c.deploymentId ?? "",
                    apiFamily: d?.apiFamily ?? c.apiFamily ?? "workflow",
                    ...change,
                  };
                  x.deployments = [
                    ...(x.deployments ?? []).filter(
                      (d) => d.connectionId !== c.id,
                    ),
                    next,
                  ];
                });
              return (
                <section className="panel" key={c.id}>
                  <h4>{c.name}</h4>
                  <Picker
                    title="RunningHub API family"
                    value={d?.apiFamily ?? c.apiFamily ?? "workflow"}
                    options={[
                      { id: "workflow", label: "Hosted ComfyUI workflow" },
                      { id: "ai-app", label: "Published AI App (v2)" },
                    ]}
                    onChange={(apiFamily) => setDeployment({ apiFamily })}
                  />
                  <Field
                    label="Workflow / AI App ID"
                    value={d?.deploymentId ?? c.deploymentId ?? ""}
                    onChange={(deploymentId) =>
                      setDeployment({ deploymentId: deploymentId.trim() })
                    }
                  />
                  <p className="muted">
                    Saved in this movie. The API key stays in the system
                    credential store.
                  </p>
                </section>
              );
            })}
          <h3>Job input bindings</h3>
          <p className="muted">
            Explicit semantic bindings edit a copy of this immutable graph for
            each job. Image paths require staged references; unsupported inputs
            block submission.
          </p>
          <Picker
            title="Graph node"
            value={nodeId}
            options={Object.entries(w.graph).map(([id, n]) => ({
              id,
              label: `${id} · ${n.class_type}`,
            }))}
            onChange={(v) => {
              setNode(v);
              setInput("");
            }}
          />
          <Picker
            title="Node input"
            value={input}
            options={Object.entries(w.graph[nodeId]?.inputs ?? {})
              .filter(([, v]) => !Array.isArray(v))
              .map(([id, v]) => ({
                id,
                label: id,
                description: JSON.stringify(v).slice(0, 120),
              }))}
            onChange={setInput}
          />
          <Picker
            title="Semantic value"
            value={semantic}
            options={[
              "positivePrompt",
              "negativePrompt",
              "image",
              "seed",
              "ratio",
              "fps",
              "duration",
              "width",
              "height",
              "characterReference1",
              "characterReference2",
              "characterReference3",
              "characterReference4",
            ].map((id) => ({ id, label: id }))}
            onChange={setSemantic}
          />
          <p className="muted">
            Character reference slots use images from the frame and scene cast.
            Bind each slot to a verified image filename input, with string value
            type.
          </p>
          <Picker
            title="Value type"
            value={valueType}
            options={["string", "number", "boolean", "json"].map((id) => ({
              id,
              label: id,
            }))}
            onChange={setType}
          />
          <button
            className="primary"
            disabled={!nodeId || !input}
            onClick={add}
          >
            Save binding
          </button>
          <hr />
          {w.bindings.map((b) => (
            <div className="binding-row" key={b.semantic}>
              <span>
                {b.semantic} → {b.nodeId}.{b.input} <small>{b.valueType}</small>
              </span>
              <button
                onClick={() =>
                  update((p) => {
                    p.workflows.find((x) => x.id === w.id)!.bindings =
                      p.workflows
                        .find((x) => x.id === w.id)!
                        .bindings.filter((x) => x.semantic !== b.semantic);
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <details>
            <summary>Preserved graph</summary>
            <pre>{JSON.stringify(w.graph, null, 2)}</pre>
          </details>
        </Modal>
      )}
    </>
  );
}
export function Renders({
  jobs,
  root,
  project,
}: {
  jobs: Job[];
  root: string;
  project: Project;
}) {
  const [selected, setSelected] = useState<Job | null>(null);
  const rendered = jobs.filter((j) => j.results.length);
  return (
    <>
      <PageTitle
        eyebrow="TRACEABLE RESULTS"
        title="Renders"
        description="Every result remembers its frame, workflow version, account and exact submission."
      />
      {!rendered.length ? (
        <Empty title="Your movie is taking shape">
          Collected images and videos appear here after successful jobs.
          Original receipts remain inside your document.
        </Empty>
      ) : (
        <div className="asset-grid">
          {rendered.flatMap((j) =>
            j.results.map((a) => (
              <article className="media-card panel" key={`${j.id}-${a.id}`}>
                <Media asset={a} root={root} />
                <strong className="asset-name" title={a.name}>
                  {a.name}
                </strong>
                <span className="badge">
                  {a.sourcePath ? "Linked original" : "Inside movie"}
                </span>
                {a.sourcePath && (
                  <small className="source-path" title={a.sourcePath}>
                    {a.sourcePath}
                  </small>
                )}
                <small>
                  {project.workflows.find((w) => w.id === j.workflowId)?.name} ·{" "}
                  {j.state}
                </small>
                <button onClick={() => setSelected(j)}>View provenance</button>
              </article>
            )),
          )}
        </div>
      )}
      {selected && (
        <Modal title="Generation provenance" onClose={() => setSelected(null)}>
          <dl>
            <dt>Attempt</dt>
            <dd>{selected.id}</dd>
            {selected.runId && (
              <>
                <dt>Batch run</dt>
                <dd>{selected.runId}</dd>
              </>
            )}
            {selected.itemId && (
              <>
                <dt>Batch item</dt>
                <dd>{selected.itemId}</dd>
              </>
            )}
            <dt>Remote task</dt>
            <dd>{selected.remoteId}</dd>
            <dt>Workflow SHA256</dt>
            <dd>{selected.workflowVersion}</dd>
            <dt>Account/connection</dt>
            <dd>{selected.connectionId}</dd>
            <dt>Created</dt>
            <dd>{selected.createdAt}</dd>
          </dl>
          <pre>{JSON.stringify(selected.snapshot, null, 2)}</pre>
        </Modal>
      )}
    </>
  );
}
