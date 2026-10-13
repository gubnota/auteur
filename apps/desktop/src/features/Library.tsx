import { useState, useEffect } from "react";
import { Plus, Image, Upload, X, Workflow as WorkflowIcon } from "lucide-react";
import { Field, Modal, Picker, Empty } from "../components/Controls";
import { call, mediaUrl } from "../lib/bridge";
import {
  uid,
  type Project,
  type Job,
  type Binding,
  type Asset,
} from "../lib/types";
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
  return asset.kind === "video" ? (
    <video controls preload="metadata" src={mediaUrl(root, asset)} />
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
}: {
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
              Revision {c.revision} · {c.assetIds.length} references
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
}: {
  project: Project;
  root: string;
  onImport: () => void;
  onCollect: () => Promise<void>;
  onRelink: (assetId: string) => Promise<void>;
}) {
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
                <strong>{a.name}</strong>
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
                <code title={a.sha256}>SHA256 {a.sha256.slice(0, 16)}…</code>
              </article>
            ))}
        </div>
      )}
    </>
  );
}
export function Workflows({
  project: p,
  update,
  onImport,
}: {
  project: Project;
  update: Update;
  onImport: () => void;
}) {
  const [selected, setSelected] = useState(""),
    [nodeId, setNode] = useState(""),
    [input, setInput] = useState(""),
    [semantic, setSemantic] = useState("positivePrompt"),
    [valueType, setType] = useState("string");
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
        description="Import API graphs. Bind fields explicitly. Keep every original node and version."
        action={
          <button className="primary" onClick={onImport}>
            <Upload size={18} />
            Import API workflow
          </button>
        }
      />
      {p.workflows.length === 0 ? (
        <Empty
          title="Bring your workflow"
          action={
            <button onClick={onImport}>Choose a ComfyUI API export</button>
          }
        >
          LTX and MINIMAX exports can be imported here. Availability is checked
          against the selected server before submission.
        </Empty>
      ) : (
        <div className="asset-grid">
          {p.workflows.map((w) => (
            <button
              className="panel workflow-card"
              key={w.id}
              onClick={() => setSelected(w.id)}
            >
              <WorkflowIcon size={28} />
              <strong>{w.name}</strong>
              <small>
                {Object.keys(w.graph).length} nodes · {w.bindings.length}{" "}
                bindings
              </small>
              <code>{w.version.slice(0, 16)}</code>
            </button>
          ))}
        </div>
      )}
      {w && (
        <Modal title={w.name} onClose={() => setSelected("")}>
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
                <strong>{a.name}</strong>
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
