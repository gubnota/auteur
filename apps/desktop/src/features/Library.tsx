import { WorkflowEditor } from "../components/WorkflowEditor";
import { Media } from "../components/Media";
export { Media } from "../components/Media";
import { MediaPicker } from "../components/MediaPicker";
import { WorkflowSetup, compatibilityLabel } from "../components/WorkflowSetup";
import { useState, useEffect } from "react";
import { Plus, Image, Upload, X, Workflow as WorkflowIcon } from "lucide-react";
import { Field, Modal, Picker, Empty } from "../components/Controls";
import { call } from "../lib/bridge";
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
            <MediaPicker
              title="Reference images"
              multiple
              root={root}
              value={c.assetIds}
              assets={p.assets.filter((a) => a.kind === "image")}
              onChange={(ids) =>
                update((p) => {
                  const ch = p.characters.find((x) => x.id === c.id)!;
                  ch.assetIds = ids;
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
  jobs,
  update,
  rendersOnly = false,
}: {
  jobs: Job[];
  update: Update;
  rendersOnly?: boolean;
  onNavigate: (f: FrameLocation) => void;
  project: Project;
  root: string;
  onImport: () => void;
  onCollect: () => Promise<void>;
  onRelink: (assetId: string) => Promise<void>;
}) {
  const [usageId, setUsageId] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [trash, setTrash] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [removing, setRemoving] = useState(false),
    [receipt, setReceipt] = useState<Job | null>(null);
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
  }, [p.assets]);
  const action = async (fn: () => Promise<void>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    }
  };
  const resultIds = new Set(jobs.flatMap((j) => j.results.map((a) => a.id)));
  const visible = p.assets.filter(
    (a) =>
      !!a.archivedAt === trash &&
      (!rendersOnly || resultIds.has(a.id)) &&
      (filter === "all" || filter === "renders"
        ? filter !== "renders" || resultIds.has(a.id)
        : a.kind === filter) &&
      a.name.toLowerCase().includes(search.toLowerCase()),
  );
  const usage = usageId ? assetUsage(p, usageId, jobs) : null;
  const chosen = p.assets.filter(
    (a) => selected.includes(a.id) && !!a.archivedAt === trash,
  );
  const archive = (restore: boolean) => {
    const ids = new Set(chosen.map((a) => a.id));
    update((p) => {
      for (const a of p.assets)
        if (ids.has(a.id))
          a.archivedAt = restore ? undefined : new Date().toISOString();
    });
    setSelected([]);
    setRemoving(false);
  };
  return (
    <>
      <PageTitle
        eyebrow={rendersOnly ? "TRACEABLE RESULTS" : "SHARED MOVIE MATERIAL"}
        title={rendersOnly ? "Renders" : "Library"}
        description="One shared library for imports and renders. Removing media moves it to Trash and keeps references and receipts."
        action={
          <button className="primary" onClick={onImport}>
            <Upload size={18} />
            Import media
          </button>
        }
      />
      <div className="jobs-toolbar media-toolbar">
        <button
          onClick={() => {
            setTrash(!trash);
            setSelected([]);
          }}
        >
          {trash ? "Back to media" : "Trash"}
        </button>
        <button
          disabled={!chosen.length}
          onClick={() => (trash ? archive(true) : setRemoving(true))}
        >
          {trash ? "Restore" : "Remove"} selected · {chosen.length}
        </button>
        <button
          onClick={() =>
            setSelected(
              visible.every((a) => selected.includes(a.id))
                ? []
                : visible.map((a) => a.id),
            )
          }
        >
          Select all visible
        </button>
        <button onClick={() => void action(onCollect)}>
          Collect for export
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <Field label="Search library" value={search} onChange={setSearch} />
      <div className="filter-row">
        {["all", "image", "video", "audio", "renders"].map((k) => (
          <button
            key={k}
            className={filter === k ? "selected" : ""}
            onClick={() => setFilter(k)}
          >
            {k}
          </button>
        ))}
      </div>
      <div className="library-drop-zone" data-file-drop="library">
        Drop files to import · existing media is reused
      </div>
      {!visible.length ? (
        <Empty title={trash ? "Trash is empty" : "No matching media"}>
          Import media or change the search and filters.
        </Empty>
      ) : (
        <div className="asset-grid">
          {visible.map((a) => (
            <article
              className="media-card panel"
              key={a.id}
              draggable={!trash}
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-mymovie-asset", a.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
            >
              <Media asset={a} root={root} />
              <strong className="asset-name" title={a.name}>
                {a.name}
              </strong>
              <span className="badge">
                {resultIds.has(a.id) ? "Render" : "Imported"} ·{" "}
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
              <button
                aria-pressed={selected.includes(a.id)}
                className={selected.includes(a.id) ? "selected" : ""}
                onClick={() =>
                  setSelected((ids) =>
                    ids.includes(a.id)
                      ? ids.filter((id) => id !== a.id)
                      : [...ids, a.id],
                  )
                }
              >
                {selected.includes(a.id) ? "Selected" : "Select"}
              </button>
              <button onClick={() => setUsageId(a.id)}>
                Usage · {assetUsage(p, a.id, jobs).frames.length} keyframes
              </button>
              <code title={a.sha256}>SHA256 {a.sha256.slice(0, 16)}…</code>
            </article>
          ))}
        </div>
      )}
      {removing && (
        <Modal
          title="Move selected media to Trash"
          onClose={() => setRemoving(false)}
        >
          <p>
            {chosen.length} materials will be hidden from galleries. Originals,
            frame assignments and job receipts remain; Restore makes them
            available again.
          </p>
          {chosen.map((a) => {
            const u = assetUsage(p, a.id, jobs);
            return (
              <p key={a.id}>
                {a.name} · {u.frames.length} frames · {u.characters.length}{" "}
                characters · {u.drafts.length} drafts · {u.jobs.length} jobs
              </p>
            );
          })}
          <button className="danger" onClick={() => archive(false)}>
            Move to Trash
          </button>
        </Modal>
      )}
      {usage && (
        <Modal title="Material usage" onClose={() => setUsageId("")}>
          <div className="usage-list">
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
            <h3>Characters</h3>
            {usage.characters.map((c) => (
              <p key={c.id}>{c.name}</p>
            ))}
            <h3>Draft references</h3>
            {usage.drafts.map((name, n) => (
              <p key={n}>{name}</p>
            ))}
            <h3>Job provenance</h3>
            {usage.jobs.map((j) => (
              <button
                key={j.id}
                onClick={() => {
                  setUsageId("");
                  setReceipt(j);
                }}
              >
                {j.state} · {j.id.slice(0, 8)} ·{" "}
                {j.results.some((a) => a.id === usageId) ? "Result" : "Input"}
              </button>
            ))}
            {!usage.frames.length &&
              !usage.characters.length &&
              !usage.drafts.length &&
              !usage.jobs.length && <p>No recorded usage.</p>}
            <p className="muted">
              A character reference available to a frame does not prove it was
              used in a render.
            </p>
          </div>
        </Modal>
      )}
      {receipt && (
        <Modal title="Generation provenance" onClose={() => setReceipt(null)}>
          <dl>
            <dt>Attempt</dt>
            <dd>{receipt.id}</dd>
            <dt>Workflow version</dt>
            <dd>{receipt.workflowVersion}</dd>
            <dt>Node</dt>
            <dd>{receipt.connectionId}</dd>
            <dt>Remote task</dt>
            <dd>{receipt.remoteId ?? "None"}</dd>
          </dl>
          <pre>{JSON.stringify(receipt.snapshot, null, 2)}</pre>
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
  saveForm,
}: {
  saveForm: (
    id: string,
    bindings: Binding[],
    layout: import("../lib/types").WorkflowLayout,
    connectionId: string,
  ) => Promise<void>;
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
    [frameId, setFrameId] = useState(""),
    [mediaKind, setMediaKind] = useState("all");
  const w = p.workflows.find((w) => w.id === selected);
  return (
    <div className="col">
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
      <div className="row">
        <Picker
          title="Preparation target"
          value={targetId}
          options={settings.connections
            .filter((c) => ["comfyui", "relay"].includes(c.kind))
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
      </div>
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
                {w.wrapper?.illustration ? (
                  <img
                    className="workflow-card-cover"
                    src={w.wrapper.illustration}
                    alt=""
                  />
                ) : (
                  <WorkflowIcon size={28} />
                )}
                <strong>{w.name}</strong>
                {w.wrapper?.collection && (
                  <small>
                    {w.wrapper.collection} · {w.wrapper.variantName}
                  </small>
                )}
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
          <WorkflowEditor
            key={`${w.id}:${targetId}`}
            workflow={w}
            workflows={p.workflows}
            connection={settings.connections.find((c) => c.id === targetId)}
            selectVariant={setSelected}
            change={(fn) =>
              update((p) => fn(p.workflows.find((x) => x.id === w.id)!))
            }
            prepare={prepare}
            saveForm={(bindings, layout) =>
              saveForm(w.id, bindings, layout, targetId)
            }
            notify={notify}
          />
          <details className="workflow-job-entry">
            <summary>Create a job</summary>
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
              onClear={() => setFrameId("")}
            />
            <button
              className="primary"
              disabled={false}
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
          </details>
        </Modal>
      )}
    </div>
  );
}
export function Renders(props: React.ComponentProps<typeof Library>) {
  return <Library {...props} rendersOnly />;
}
