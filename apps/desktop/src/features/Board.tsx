import { useRef, useState, useEffect, type PointerEvent } from "react";
import {
  Plus,
  Search,
  Trash2,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Image,
  MessageSquare,
  Users,
  Sparkles,
  X,
} from "lucide-react";
import type { Update } from "../App";
import {
  uid,
  makeFrame,
  moveFrame,
  ratios,
  type Project,
  type Episode,
  type Frame,
} from "../lib/types";
import { mediaUrl } from "../lib/bridge";
import { Field, Picker, Modal, Toggle, Empty } from "../components/Controls";
export function Board({
  project: p,
  episode,
  root,
  update,
  onGenerate,
  navigation,
  characterFilter,
  clearFilter,
}: {
  navigation?: { frameId: string; token: string };
  characterFilter?: string;
  clearFilter: () => void;
  project: Project;
  episode: Episode;
  root: string;
  update: Update;
  onGenerate: (id: string) => void;
}) {
  const [selected, setSelected] = useState(""),
    [sceneId, setSceneId] = useState("all"),
    [search, setSearch] = useState(false),
    [query, setQuery] = useState(""),
    [sceneEditor, setSceneEditor] = useState(false),
    [newScene, setNewScene] = useState(""),
    [dragged, setDragged] = useState("");
  useEffect(() => {
    if (navigation) {
      setSelected(navigation.frameId);
      setSceneId("all");
    }
  }, [navigation]);
  const frames = episode.scenes.flatMap((s) =>
    s.shots.flatMap((sh) => sh.frames),
  );
  const frame = frames.find((f) => f.id === selected);
  const frameScene = episode.scenes.find((s) =>
    s.shots.some((sh) => sh.frames.some((f) => f.id === selected)),
  );
  const effectiveCast = (sceneIds: string[] = [], frameIds: string[] = []) => [
    ...new Set([...sceneIds, ...frameIds]),
  ];
  const cast = effectiveCast(frameScene?.characterIds, frame?.characterIds);
  const references = [
    ...new Set(
      p.characters
        .filter((c) => cast.includes(c.id))
        .flatMap((c) => c.assetIds),
    ),
  ]
    .map((id) => p.assets.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => !!a);
  const sort = useRef<{
    id: string;
    x: number;
    y: number;
    active: boolean;
  } | null>(null);
  const clearSort = () => {
    sort.current = null;
    setDragged("");
    document
      .querySelectorAll(".sort-target")
      .forEach((el) => el.classList.remove("sort-target"));
  };
  const sortTarget = (e: PointerEvent) =>
    document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>("[data-sort-shot]");
  const sortMove = (e: PointerEvent) => {
    const drag = sort.current;
    if (!drag) return;
    if (!drag.active && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5)
      return;
    drag.active = true;
    setDragged(drag.id);
    document
      .querySelectorAll(".sort-target")
      .forEach((el) => el.classList.remove("sort-target"));
    sortTarget(e)?.classList.add("sort-target");
  };
  const sortEnd = (e: PointerEvent) => {
    const drag = sort.current,
      target = sortTarget(e);
    if (drag?.active && target && target.dataset.frameId !== drag.id) {
      const shot = episode.scenes
        .flatMap((s) => s.shots)
        .find((sh) => sh.id === target.dataset.sortShot);
      if (shot)
        move(
          drag.id,
          shot.id,
          target.dataset.sortIndex === undefined
            ? shot.frames.length
            : Number(target.dataset.sortIndex),
        );
    }
    clearSort();
  };
  const modify = (id: string, fn: (f: Frame) => void) =>
    update((p) => {
      for (const ep of p.episodes)
        for (const s of ep.scenes)
          for (const sh of s.shots) {
            const f = sh.frames.find((f) => f.id === id);
            if (f) fn(f);
          }
    });
  const add = (shotId?: string) => {
    const f = makeFrame(frames.length + 1);
    update((p) => {
      const ep = p.episodes.find((e) => e.id === episode.id)!;
      if (shotId) {
        const shot = ep.scenes
          .flatMap((s) => s.shots)
          .find((sh) => sh.id === shotId)!;
        shot.frames.push(f);
      } else {
        if (!ep.scenes.length)
          ep.scenes.push({
            id: uid(),
            name: "Scene 01",
            positivePrompt: null,
            negativePrompt: null,
            shots: [],
          });
        const s = ep.scenes[0];
        if (!s.shots.length)
          s.shots.push({ id: uid(), name: "Shot 01", frames: [] });
        s.shots[0].frames.push(f);
      }
    });
    setSelected(f.id);
  };
  const move = (frameId: string, shotId: string, index: number) =>
    update((p) => {
      Object.assign(p, moveFrame(p, frameId, shotId, index));
    });
  const remove = (id: string) =>
    update((p) => {
      for (const ep of p.episodes)
        for (const s of ep.scenes)
          for (const sh of s.shots)
            sh.frames = sh.frames.filter((f) => f.id !== id);
    });
  const renderAsset = (f: Frame) => {
    const a = p.assets.find((a) => a.id === f.assetId);
    return a && root ? (
      <img src={mediaUrl(root, a)} alt={f.name} />
    ) : (
      <div className={`frame-placeholder tone-${frames.indexOf(f) % 4}`}>
        <span className="landscape-line" />
        <Image size={24} />
        <small>{f.assetId ? "Missing image" : "Drop an image here"}</small>
      </div>
    );
  };
  return (
    <>
      {characterFilter && (
        <div className="panel row">
          <span>
            Character:{" "}
            {p.characters.find((c) => c.id === characterFilter)?.name}
          </span>
          <button onClick={clearFilter}>Clear character filter</button>
        </div>
      )}
      <div className="board-toolbar">
        <div className="row">
          <Picker
            title="Scene"
            value={sceneId}
            options={[
              { id: "all", label: "All scenes" },
              ...episode.scenes.map((s) => ({ id: s.id, label: s.name })),
            ]}
            onChange={setSceneId}
          />
          <button
            onClick={() => {
              setQuery("");
              setSearch(true);
            }}
          >
            <Search size={17} />
            Search frames
          </button>
          <button onClick={() => setSceneEditor(true)}>Edit scenes</button>
        </div>
        <div className="row">
          <button
            data-file-drop="new-scene"
            data-episode-id={episode.id}
            onClick={() => setSceneEditor(true)}
          >
            <Plus size={18} />
            New scene · drop images
          </button>
          <button
            className="primary"
            data-file-drop="new-frame"
            data-episode-id={episode.id}
            onClick={() => add()}
          >
            <Plus size={18} />
            New keyframe
          </button>
        </div>
      </div>
      <div className="board-layout">
        <div className="board-scroll">
          {episode.scenes.length === 0 ? (
            <Empty
              title={`Start ${episode.name}`}
              action={
                <button
                  className="primary"
                  data-file-drop="new-frame"
                  data-episode-id={episode.id}
                  onClick={() => add()}
                >
                  <Plus size={18} />
                  Create the first keyframe
                </button>
              }
            >
              Every chapter begins with a moment. Add your first scene, shot and
              frame together.
            </Empty>
          ) : (
            episode.scenes
              .filter((s) => sceneId === "all" || s.id === sceneId)
              .map((s, i) => (
                <section
                  className="scene"
                  key={s.id}
                  data-file-drop="scene"
                  data-scene-id={s.id}
                  data-episode-id={episode.id}
                >
                  <header className="scene-title">
                    <div className="row">
                      <span className="scene-number">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <h2>{s.name}</h2>
                        <small>
                          {s.shots.reduce((n, sh) => n + sh.frames.length, 0)}{" "}
                          keyframes · {s.shots.length} shots
                        </small>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        update((p) => {
                          p.episodes
                            .find((e) => e.id === episode.id)!
                            .scenes.find((sc) => sc.id === s.id)!
                            .shots.push({
                              id: uid(),
                              name: `Shot ${s.shots.length + 1}`,
                              frames: [],
                            });
                        })
                      }
                    >
                      <Plus size={16} />
                      Add shot
                    </button>
                  </header>
                  {s.shots.map((sh) => (
                    <div
                      className="shot-lane"
                      key={sh.id}
                      data-sort-shot={sh.id}
                      data-file-drop="new-frame"
                      data-shot-id={sh.id}
                      data-scene-id={s.id}
                      data-episode-id={episode.id}
                    >
                      <div className="lane-label">
                        <span className="eyebrow">SHOT</span>
                        <input
                          aria-label="Shot name"
                          value={sh.name}
                          onChange={(e) =>
                            update((p) => {
                              p.episodes
                                .flatMap((e) =>
                                  e.scenes.flatMap((s) => s.shots),
                                )
                                .find((x) => x.id === sh.id)!.name =
                                e.target.value;
                            })
                          }
                        />
                      </div>
                      <div className="frames">
                        {sh.frames
                          .map((f, index) => ({ f, index }))
                          .filter(
                            ({ f }) =>
                              !characterFilter ||
                              effectiveCast(
                                s.characterIds,
                                f.characterIds,
                              ).includes(characterFilter),
                          )
                          .map(({ f, index }) => (
                            <article
                              key={f.id}
                              data-file-drop="frame"
                              data-frame-id={f.id}
                              data-sort-shot={sh.id}
                              data-sort-index={index}
                              className={`frame-card ${selected === f.id ? "selected" : ""} ${dragged === f.id ? "sorting" : ""}`}
                            >
                              <button
                                className="frame-image"
                                onClick={() => setSelected(f.id)}
                                style={{
                                  aspectRatio: (f.ratio ?? p.ratio).replace(
                                    ":",
                                    " / ",
                                  ),
                                }}
                              >
                                {renderAsset(f)}
                                <span className="frame-counter">
                                  {String(index + 1).padStart(2, "0")}
                                </span>
                              </button>
                              <div className="frame-card-body">
                                <button
                                  className="frame-name"
                                  onClick={() => setSelected(f.id)}
                                >
                                  {f.name || "Untitled frame"}
                                </button>
                                <p>
                                  {f.positivePrompt ||
                                    "Write the moment you want to create."}
                                </p>
                                <div className="row tags">
                                  {effectiveCast(
                                    s.characterIds,
                                    f.characterIds,
                                  ).map((id) => (
                                    <span className="badge blush" key={id}>
                                      {
                                        p.characters.find((c) => c.id === id)
                                          ?.name
                                      }
                                    </span>
                                  ))}
                                </div>
                                <div className="frame-actions">
                                  <button
                                    className="icon-button drag-handle"
                                    onPointerDown={(e) => {
                                      e.preventDefault();
                                      e.currentTarget.setPointerCapture(
                                        e.pointerId,
                                      );
                                      sort.current = {
                                        id: f.id,
                                        x: e.clientX,
                                        y: e.clientY,
                                        active: false,
                                      };
                                    }}
                                    onPointerMove={sortMove}
                                    onPointerUp={sortEnd}
                                    onPointerCancel={clearSort}
                                    onKeyDown={(e) => {
                                      if (e.key === "Escape") clearSort();
                                    }}
                                    aria-label={`Drag ${f.name}`}
                                  >
                                    <GripVertical size={15} />
                                  </button>
                                  <button
                                    className="icon-button"
                                    aria-label={`Move ${f.name} earlier`}
                                    disabled={index === 0}
                                    onClick={() => move(f.id, sh.id, index - 1)}
                                  >
                                    <ArrowUp size={15} />
                                  </button>
                                  <button
                                    className="icon-button"
                                    aria-label={`Move ${f.name} later`}
                                    disabled={index === sh.frames.length - 1}
                                    onClick={() => move(f.id, sh.id, index + 1)}
                                  >
                                    <ArrowDown size={15} />
                                  </button>
                                  <span className="spacer" />
                                  <button
                                    className="icon-button danger"
                                    aria-label={`Delete ${f.name}`}
                                    onClick={() => {
                                      remove(f.id);
                                      if (selected === f.id) setSelected("");
                                    }}
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              </div>
                            </article>
                          ))}
                        <button
                          className="add-frame-card"
                          data-file-drop="new-frame"
                          data-shot-id={sh.id}
                          data-scene-id={s.id}
                          data-episode-id={episode.id}
                          data-sort-shot={sh.id}
                          onClick={() => add(sh.id)}
                        >
                          <span>
                            <Plus size={26} />
                          </span>
                          <strong>Add keyframe</strong>
                          <small>Build the next moment</small>
                        </button>
                      </div>
                    </div>
                  ))}
                </section>
              ))
          )}
        </div>
        <aside className="inspector">
          {frame ? (
            <>
              <header>
                <div>
                  <span className="eyebrow">KEYFRAME DETAILS</span>
                  <h2>{frame.name}</h2>
                </div>
                <button
                  className="icon-button"
                  aria-label="Close inspector"
                  onClick={() => setSelected("")}
                >
                  <X size={18} />
                </button>
              </header>
              <div className="inspector-body">
                <Field
                  label="Frame name"
                  value={frame.name}
                  onChange={(v) =>
                    modify(frame.id, (f) => {
                      f.name = v;
                    })
                  }
                />
                <Picker
                  title="Reference image"
                  value={frame.assetId ?? ""}
                  options={[
                    { id: "", label: "No reference image" },
                    ...p.assets
                      .filter((a) => a.kind === "image")
                      .map((a) => ({ id: a.id, label: a.name })),
                  ]}
                  onChange={(v) =>
                    modify(frame.id, (f) => {
                      f.assetId = v || null;
                    })
                  }
                />
                <Picker
                  title="Aspect ratio"
                  value={frame.ratio ?? "inherit"}
                  options={[
                    { id: "inherit", label: `Inherit movie · ${p.ratio}` },
                    ...ratios.map((r) => ({ id: r, label: r })),
                    { id: "custom", label: "Custom ratio" },
                  ]}
                  onChange={(v) =>
                    modify(frame.id, (f) => {
                      f.ratio =
                        v === "inherit" ? null : v === "custom" ? "16:9" : v;
                    })
                  }
                />
                <RatioEditor
                  key={frame.id}
                  value={frame.ratio ?? p.ratio}
                  onApply={(v) =>
                    modify(frame.id, (f) => {
                      f.ratio = v;
                    })
                  }
                />
                <Picker
                  title="Additional frame characters"
                  multiple
                  value={frame.characterIds}
                  options={p.characters.map((c) => ({
                    id: c.id,
                    label: c.name,
                    description: c.description,
                  }))}
                  onChange={(v) =>
                    modify(frame.id, (f) => {
                      f.characterIds = f.characterIds.includes(v)
                        ? f.characterIds.filter((x) => x !== v)
                        : [...f.characterIds, v];
                    })
                  }
                />
                {!!frameScene?.characterIds?.length && (
                  <div className="tip">
                    <strong>Inherited scene cast</strong>
                    <p>
                      {p.characters
                        .filter((c) => frameScene.characterIds?.includes(c.id))
                        .map((c) => c.name)
                        .join(", ")}
                    </p>
                    <button onClick={() => setSceneEditor(true)}>
                      Edit scene cast
                    </button>
                  </div>
                )}
                {!!references.length && (
                  <div className="reference-grid frame-references">
                    {references.map((a) => (
                      <figure key={a.id}>
                        <img src={mediaUrl(root, a)} alt={a.name} />
                        <figcaption>{a.name}</figcaption>
                      </figure>
                    ))}
                  </div>
                )}
                <Field
                  label="Positive prompt"
                  multiline
                  value={frame.positivePrompt}
                  onChange={(v) =>
                    modify(frame.id, (f) => {
                      f.positivePrompt = v;
                    })
                  }
                />
                <Field
                  label="Negative prompt"
                  multiline
                  value={frame.negativePrompt}
                  onChange={(v) =>
                    modify(frame.id, (f) => {
                      f.negativePrompt = v;
                    })
                  }
                />
                <Toggle
                  label="Include common prompts"
                  checked={frame.includeCommon}
                  onChange={(v) =>
                    modify(frame.id, (f) => {
                      f.includeCommon = v;
                    })
                  }
                />
                <details>
                  <summary>Composed prompt preview</summary>
                  <p className="prompt-preview">
                    {[
                      frame.includeCommon
                        ? (episode.scenes.find((s) =>
                            s.shots.some((sh) =>
                              sh.frames.some((f) => f.id === frame.id),
                            ),
                          )?.positivePrompt ?? p.positivePrompt)
                        : "",
                      frame.positivePrompt,
                    ]
                      .filter(Boolean)
                      .join("\n")}
                  </p>
                </details>
                <button
                  className="primary wide"
                  onClick={() => onGenerate(frame.id)}
                >
                  <Sparkles size={17} />
                  Generate frame
                </button>
                <hr />
                <div className="row">
                  <MessageSquare size={17} />
                  <h3>Comments</h3>
                </div>
                {frame.comments.map((c) => (
                  <div className="comment" key={c.id}>
                    <Field
                      label="Comment"
                      multiline
                      value={c.text}
                      onChange={(v) =>
                        modify(frame.id, (f) => {
                          f.comments.find((x) => x.id === c.id)!.text = v;
                        })
                      }
                    />
                    <button
                      className="text-button danger"
                      onClick={() =>
                        modify(frame.id, (f) => {
                          f.comments = f.comments.filter((x) => x.id !== c.id);
                        })
                      }
                    >
                      Delete comment
                    </button>
                  </div>
                ))}
                <button
                  className="wide"
                  onClick={() =>
                    modify(frame.id, (f) => {
                      f.comments.push({
                        id: uid(),
                        text: "",
                        createdAt: new Date().toISOString(),
                      });
                    })
                  }
                >
                  <Plus size={16} />
                  Add comment
                </button>
              </div>
            </>
          ) : (
            <>
              <header>
                <div>
                  <span className="eyebrow">MOVIE DEFAULTS</span>
                  <h2>Common prompts</h2>
                </div>
                <Users size={20} />
              </header>
              <div className="inspector-body">
                <p className="muted">
                  Shared direction for this movie. Select a frame to refine its
                  prompt and character references.
                </p>
                <Field
                  label="Common positive prompt"
                  multiline
                  value={p.positivePrompt}
                  onChange={(v) =>
                    update((p) => {
                      p.positivePrompt = v;
                    })
                  }
                />
                <Field
                  label="Common negative prompt"
                  multiline
                  value={p.negativePrompt}
                  onChange={(v) =>
                    update((p) => {
                      p.negativePrompt = v;
                    })
                  }
                />
                <button
                  onClick={() =>
                    update((p) => {
                      p.positivePrompt = "";
                      p.negativePrompt = "";
                    })
                  }
                >
                  Clear common prompts
                </button>
                <div className="tip">
                  <span className="eyebrow">CONTINUITY NOTE</span>
                  <p>
                    Character references belong to the movie and can be used
                    across every episode.
                  </p>
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
      {search && (
        <Modal title="Search keyframes" onClose={() => setSearch(false)}>
          <Field
            label="Frame name, prompt or comment"
            value={query}
            onChange={setQuery}
          />
          <div className="choices">
            {frames
              .filter((f) =>
                `${f.name} ${f.positivePrompt} ${f.comments.map((c) => c.text).join(" ")}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((f) => (
                <button
                  className="choice"
                  key={f.id}
                  onClick={() => {
                    setSelected(f.id);
                    setSceneId("all");
                    setSearch(false);
                  }}
                >
                  <span>
                    <strong>{f.name}</strong>
                    <small>{f.positivePrompt}</small>
                  </span>
                </button>
              ))}
          </div>
        </Modal>
      )}
      {sceneEditor && (
        <Modal title="Scenes" onClose={() => setSceneEditor(false)}>
          {episode.scenes.map((s) => (
            <div className="panel" key={s.id}>
              <Field
                label="Scene name"
                value={s.name}
                onChange={(v) =>
                  update((p) => {
                    p.episodes
                      .flatMap((e) => e.scenes)
                      .find((x) => x.id === s.id)!.name = v;
                  })
                }
              />
              <Picker
                title="Scene characters"
                multiple
                value={s.characterIds ?? []}
                options={p.characters.map((c) => ({
                  id: c.id,
                  label: c.name,
                  description: `${c.assetIds.length} reference images · ${c.description}`,
                }))}
                onChange={(id) =>
                  update((p) => {
                    const scene = p.episodes
                      .flatMap((e) => e.scenes)
                      .find((x) => x.id === s.id)!;
                    const ids = scene.characterIds ?? [];
                    scene.characterIds = ids.includes(id)
                      ? ids.filter((x) => x !== id)
                      : [...ids, id];
                  })
                }
              />
              <p className="muted">
                Scene characters and reference images are inherited by every
                keyframe in this scene.
              </p>
              <Field
                label="Scene positive replacement (empty inherits)"
                multiline
                value={s.positivePrompt ?? ""}
                onChange={(v) =>
                  update((p) => {
                    p.episodes
                      .flatMap((e) => e.scenes)
                      .find((x) => x.id === s.id)!.positivePrompt = v || null;
                  })
                }
              />
              <Field
                label="Scene negative replacement"
                multiline
                value={s.negativePrompt ?? ""}
                onChange={(v) =>
                  update((p) => {
                    p.episodes
                      .flatMap((e) => e.scenes)
                      .find((x) => x.id === s.id)!.negativePrompt = v || null;
                  })
                }
              />
            </div>
          ))}
          <Field
            label="New scene name"
            value={newScene}
            onChange={setNewScene}
          />
          <button
            className="primary"
            disabled={!newScene.trim()}
            onClick={() => {
              update((p) => {
                p.episodes
                  .find((e) => e.id === episode.id)!
                  .scenes.push({
                    id: uid(),
                    name: newScene.trim(),
                    positivePrompt: null,
                    negativePrompt: null,
                    shots: [{ id: uid(), name: "Shot 01", frames: [] }],
                  });
              });
              setNewScene("");
            }}
          >
            Add scene
          </button>
        </Modal>
      )}
    </>
  );
}

function RatioEditor({
  value,
  onApply,
}: {
  value: string;
  onApply: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  const valid =
    /^\d+(\.\d+)?:\d+(\.\d+)?$/.test(text) &&
    text.split(":").every((n) => Number(n) > 0);
  return (
    <div className="ratio-editor">
      <Field
        label="Custom aspect ratio (width:height)"
        value={text}
        onChange={setText}
      />
      <button disabled={!valid} onClick={() => onApply(text)}>
        Apply ratio
      </button>
    </div>
  );
}
