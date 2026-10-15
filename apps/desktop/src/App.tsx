import { BackgroundActivity } from "./components/BackgroundActivity";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listen } from "@tauri-apps/api/event";
import {
  Film,
  WandSparkles,
  Cloud,
  Layers,
  Users,
  Image,
  Workflow as WorkflowIcon,
  Clapperboard,
  ListChecks,
  Server,
  Settings,
  Bell,
  ScrollText,
  Plus,
  FolderOpen,
  ChevronUp,
  ChevronDown,
  X,
  Search,
  Check,
  ArrowLeft,
} from "lucide-react";
import {
  call,
  native,
  pickDestination,
  pickFile,
  pickReferenceImages,
} from "./lib/bridge";
import {
  uid,
  makeFrame,
  type Project,
  type AppSettings,
  type Job,
  type WorkflowLayout,
} from "./lib/types";
import { Modal, Field, Picker, Empty, Toggle } from "./components/Controls";
import type { FrameLocation } from "./lib/project-usage";
import { workflowForTarget } from "./lib/job-inputs";
import { WorkflowCatalogue } from "./components/WorkflowCatalogue";
import { AppSymbol } from "./components/AppSymbol";
import { fileDropPoint } from "./lib/file-drop";
import { Board } from "./features/Board";
import { Characters, Library, Workflows, Renders } from "./features/Library";
import { Generate } from "./features/Generate";
import { Jobs } from "./features/Jobs";
import { newJobDraft } from "./lib/job-drafts";
import { Connections, Preferences } from "./features/Connections";
const routes = [
  ["Keyframes", Layers],
  ["Characters", Users],
  ["Library", Image],
  ["Workflows", WorkflowIcon],
  ["Generate", WandSparkles],
  ["Jobs", ListChecks],
  ["Renders", Clapperboard],
  ["Connections", Server],
  ["Settings", Settings],
  ["Notifications", Bell],
  ["Logs", ScrollText],
] as const;
const initialSettings: AppSettings = {
  connections: [],
  theme: "light",
  queueHeight: 180,
  storage: {},
  notifications: [],
  logs: [],
};
export type Update = (fn: (p: Project) => void) => void;
export default function App() {
  const [p, setP] = useState<Project | null>(null),
    [root, setRoot] = useState(""),
    [route, setRoute] = useState("Keyframes"),
    [episodeId, setEpisodeId] = useState(""),
    [settings, replaceSettings] = useState(initialSettings),
    [jobs, setJobs] = useState<Job[]>([]),
    [status, setStatus] = useState("Saved locally"),
    [modal, setModal] = useState<ReactNode>(null),
    [toasts, setToasts] = useState<{ id: string; message: string }[]>([]),
    [height, setHeight] = useState(180),
    [expanded, setExpanded] = useState(true);
  const [clearingQueue, setClearingQueue] = useState(false);
  const setSettings = (incoming: AppSettings) =>
    replaceSettings((previous) => ({
      ...incoming,
      dismissedQueueJobIds: [
        ...new Set([
          ...(previous.dismissedQueueJobIds ?? []),
          ...(incoming.dismissedQueueJobIds ?? []),
        ]),
      ],
    }));
  const [frameNavigation, setFrameNavigation] = useState<{
    frameId: string;
    token: string;
  }>();
  const [characterFilter, setCharacterFilter] = useState("");
  const navigateFrame = (f: FrameLocation) => {
    setEpisodeId(f.episodeId);
    setRoute("Keyframes");
    setCharacterFilter("");
    setFrameNavigation({ frameId: f.frameId, token: uid() });
  };
  const [jobDraftId, setJobDraftId] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMode, setImportMode] = useState("copy");
  const importingRef = useRef(false);
  const [recent, setRecent] = useState<
    { path: string; name: string; opened: string }[]
  >([]);
  const generation = useRef(0);
  const current = useRef<Project | null>(null),
    revision = useRef(0),
    pending = useRef(Promise.resolve()),
    drag = useRef<{ start: number; height: number } | null>(null);
  const dropHandler = useRef<
    (paths: string[], target: HTMLElement | null) => void
  >(() => {});
  useEffect(() => {
    if (!native) return;
    let stopped = false;
    const listening = getCurrentWebview().onDragDropEvent((event) => {
      document
        .querySelectorAll(".file-drop-hover")
        .forEach((el) => el.classList.remove("file-drop-hover"));
      if (stopped || event.payload.type === "leave") return;
      const point = fileDropPoint(
        event.payload.position,
        navigator.platform,
        window.devicePixelRatio,
      );
      const target =
        document
          .elementFromPoint(point.x, point.y)
          ?.closest<HTMLElement>("[data-file-drop]") ?? null;
      if (event.payload.type === "drop")
        dropHandler.current(event.payload.paths, target);
      else target?.classList.add("file-drop-hover");
    });
    void listening.catch(() =>
      notify(
        "File drops are unavailable. Restart the app or use Import media.",
      ),
    );
    return () => {
      stopped = true;
      void listening.then((unlisten) => unlisten()).catch(() => {});
    };
  }, []);
  const notify = (message: string) => {
    const id = uid();
    setToasts((t) => [...t.slice(-3), { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6500);
  };
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn();
    } catch (e) {
      notify(String(e));
      return undefined;
    }
  };
  const loaded = (project: Project, path: string) => {
    generation.current++;
    current.current = project;
    revision.current = project.revision;
    setP(project);
    setRoot(path);
    setEpisodeId(project.episodes[0]?.id ?? "");
    setStatus("Saved locally");
    void run(async () => setJobs(await call<Job[]>("list_jobs")));
    if (native) void run(async () => setRecent(await call("recent_projects")));
  };
  const openMovie = async (path: string): Promise<Project> => {
    try {
      return await call<Project>("open_project", { path });
    } catch (e) {
      if (!String(e).startsWith("UPGRADE_REQUIRED:")) throw e;
      const upgrade = await new Promise<boolean>((resolve) =>
        setModal(
          <Modal
            title="Upgrade this movie for Generate"
            onClose={() => {
              setModal(null);
              resolve(false);
            }}
          >
            <p>{String(e).replace("UPGRADE_REQUIRED:", "")}</p>
            <p>
              The saved backup can restore this movie for the previous app.
              Originals stay in the document.
            </p>
            <button
              className="primary"
              onClick={() => {
                setModal(null);
                resolve(true);
              }}
            >
              Back up & open movie
            </button>
          </Modal>,
        ),
      );
      if (!upgrade) throw new Error("Movie upgrade canceled");
      return call<Project>("open_project", { path, allowUpgrade: true });
    }
  };
  useEffect(() => {
    void run(async () => {
      const s = await call<AppSettings>("get_settings");
      setSettings(s);
      setHeight(s.queueHeight || 180);
      if (native) setRecent(await call("recent_projects"));
    });
    if (!native) return;
    const unsub = listen<string[]>("opened-projects", (event) => {
      const path = event.payload[0];
      if (path) void run(async () => loaded(await openMovie(path), path));
    });
    void run(async () => {
      const paths = await call<string[]>("take_opened_projects");
      if (paths[0]) loaded(await openMovie(paths[0]), paths[0]);
    });
    return () => {
      void unsub.then((fn) => fn());
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme || "light";
  }, [settings.theme]);
  useEffect(() => {
    if (!native || !p) return;
    const timer = setInterval(() => {
      void run(async () => {
        setJobs(await call<Job[]>("list_jobs"));
        setSettings(await call<AppSettings>("get_settings"));
        if (status === "Saved locally") {
          const saved = await call<Project>("get_project");
          if (saved.revision > revision.current) {
            revision.current = saved.revision;
            current.current = saved;
            setP(saved);
          }
        }
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [p?.id, status]);
  const update: Update = (fn) => {
    if (!current.current) return;
    const epoch = generation.current;
    const next = structuredClone(current.current);
    fn(next);
    current.current = next;
    setP(next);
    setStatus("Saving…");
    pending.current = pending.current.then(async () => {
      if (epoch !== generation.current) return;
      try {
        const saved = await call<Project>("save_project", {
          project: next,
          expectedRevision: revision.current,
        });
        revision.current = saved.revision;
        if (current.current === next) {
          current.current = saved;
          setP(saved);
          setStatus(native ? "Saved locally" : "Preview · memory only");
        }
      } catch (e) {
        generation.current++;
        setStatus("Save failed · reload required");
        notify(String(e));
        if (native) {
          const saved = await call<Project>("get_project");
          current.current = saved;
          revision.current = saved.revision;
          setP(saved);
        }
      }
    });
  };
  const saveSettings = async (s: AppSettings) => {
    const saved = await call<AppSettings>("save_settings", { settings: s });
    setSettings(saved);
  };
  const finished = (job: Job) =>
    ["completed", "failed", "canceled"].includes(job.state);
  const dismissed = new Set(settings.dismissedQueueJobIds ?? []);
  const queueJobs = jobs.filter(
    (job) => !finished(job) || !dismissed.has(job.id),
  );
  const clearFinished = () =>
    void run(async () => {
      setClearingQueue(true);
      try {
        await saveSettings({
          ...settings,
          dismissedQueueJobIds: [
            ...new Set([
              ...(settings.dismissedQueueJobIds ?? []),
              ...queueJobs.filter(finished).map((job) => job.id),
            ]),
          ],
        });
      } finally {
        setClearingQueue(false);
      }
    });
  const open = () =>
    void run(async () => {
      await pending.current;
      const path = await pickFile("project");
      if (path) loaded(await openMovie(path), path);
    });
  const create = (name: string, demo: boolean) =>
    void run(async () => {
      await pending.current;
      const path = await pickDestination(name);
      if (path) {
        loaded(
          await call<Project>("create_project", { path, name, demo }),
          path,
        );
        setModal(null);
      }
    });
  const newMovie = () =>
    setModal(<NewMovie onClose={() => setModal(null)} onCreate={create} />);
  const demoPreview = () => {
    const pilot = uid(),
      characters = ["Mira", "Old Sal", "The Keeper"].map((name) => ({
        id: uid(),
        name,
        description: "Sample character · add appearance and continuity notes",
        assetIds: [],
        revision: 1,
      }));
    loaded(
      {
        id: uid(),
        name: "The Lighthouse Keeper",
        revision: 0,
        ratio: "16:9",
        positivePrompt: "Cinematic light, coherent characters, natural detail",
        negativePrompt: "Artifacts, text, watermark",
        characters,
        assets: [],
        workflows: [],
        episodes: [
          {
            id: pilot,
            name: "Pilot",
            scenes: [
              {
                id: uid(),
                name: "The lighthouse",
                positivePrompt: null,
                negativePrompt: null,
                shots: [
                  {
                    id: uid(),
                    name: "Arrival at the coast",
                    frames: Array.from({ length: 4 }, (_, i) => ({
                      ...makeFrame(i + 1),
                      positivePrompt: [
                        "A lighthouse watches over a quiet coastline at dawn.",
                        "Mira arrives, wind moving through her coat.",
                        "Old Sal waits by the keeper’s door.",
                        "A storm gathers beyond the bay.",
                      ][i],
                      characterIds: [characters[0].id],
                    })),
                  },
                ],
              },
            ],
          },
          { id: uid(), name: "The Storm", scenes: [] },
        ],
      },
      "",
    );
  };
  const episode = p?.episodes.find((e) => e.id === episodeId) ?? p?.episodes[0];
  const queueActions = async (
    command: string,
    args: Record<string, unknown> = {},
  ) => {
    await run(async () => {
      await pending.current;
      await call(command, args);
      setJobs(await call<Job[]>("list_jobs"));
    });
  };
  const chooseJob = (frameId: string, workflowId?: string) => {
    if (!p) return;
    const draft = newJobDraft(p, settings, frameId, workflowId);
    update((p) => {
      (p.jobDrafts ??= []).push(draft);
    });
    setJobDraftId(draft.id);
    setModal(null);
    setRoute("Generate");
  };
  const importFile = (kind: "media" | "workflow") =>
    void run(async () => {
      const epoch = generation.current;
      const path = await pickFile(kind);
      if (epoch !== generation.current)
        throw new Error("Movie changed during import");
      if (path)
        await mutateMedia(
          kind === "media" ? "import_asset" : "import_workflow",
          { path, linked: importMode === "link" },
          `${kind === "media" ? "Media" : "Workflow"} imported`,
        );
    });
  const browseWorkflows = () =>
    setModal(
      <WorkflowCatalogue
        close={() => setModal(null)}
        importFile={() => importFile("workflow")}
        pin={async (workflowId) => {
          await mutateMedia(
            "pin_workflow",
            { workflowId },
            "Workflow added to this movie",
          );
        }}
      />,
    );
  const prepareWorkflow = async (
    workflowId: string,
    connectionId: string,
    layout?: WorkflowLayout,
  ) => {
    await mutateMedia(
      layout ? "save_workflow_layout" : "prepare_workflow",
      layout ? { workflowId, layout } : { workflowId, connectionId },
      layout
        ? "Workflow form saved for reuse"
        : "Workflow prepared for selected target",
    );
  };
  const importCharacterReferences = async (characterId: string) => {
    const epoch = generation.current;
    const paths = await pickReferenceImages();
    if (epoch !== generation.current)
      throw new Error("Movie changed during import");
    if (!paths.length) return;
    await mutateMedia(
      "import_character_references",
      { characterId, paths, linked: importMode === "link" },
      "Reference images imported and attached",
    );
  };
  dropHandler.current = (paths, target) => {
    if (!current.current || !paths.length || importingRef.current) return;
    if (!target) {
      notify("Drop files onto Library, a character, a scene, or a keyframe");
      return;
    }
    const epoch = generation.current;
    const args = {
      paths,
      frameId: target.dataset.frameId ?? null,
      shotId: target.dataset.shotId ?? null,
      episodeId: target.dataset.episodeId ?? null,
      sceneId: target.dataset.sceneId ?? null,
      newScene: target.dataset.fileDrop === "new-scene",
      characterId: target.dataset.characterId ?? null,
      linked: importMode === "link",
    };
    importingRef.current = true;
    setImporting(true);
    setStatus("Importing files…");
    const operation = pending.current.then(async () => {
      if (epoch !== generation.current)
        throw new Error("Movie changed during import");
      if (target.dataset.fileDrop === "generate" && paths.length !== 1)
        throw new Error("Drop one file onto each media slot");
      const project =
        target.dataset.fileDrop === "generate"
          ? (
              await call<import("./lib/types").ImportResult>(
                "import_job_media",
                {
                  draftId: target.dataset.draftId,
                  itemId: target.dataset.itemId,
                  semantic: target.dataset.semantic,
                  path: paths[0],
                  linked: importMode === "link",
                },
              )
            ).project
          : await call<Project>("import_media_drop", args);
      if (epoch !== generation.current)
        throw new Error("Movie changed during import");
      revision.current = project.revision;
      current.current = project;
      setP(project);
      if (target.dataset.fileDrop === "library") setRoute("Library");
      notify(
        args.characterId
          ? "Character reference images attached"
          : args.newScene
            ? "Scene created from images"
            : args.frameId
              ? "Keyframe image assigned"
              : args.episodeId
                ? "Images imported as keyframes"
                : "Media imported into Library",
      );
    });
    pending.current = operation
      .catch((e) => notify(String(e)))
      .finally(() => {
        importingRef.current = false;
        setStatus("Saved locally");
        setImporting(false);
      });
  };
  const mutateMedia = async (
    command: string,
    args: Record<string, unknown>,
    message: string,
  ) => {
    if (importingRef.current) return;
    const epoch = generation.current;
    importingRef.current = true;
    setImporting(true);
    setStatus("Updating media…");
    const operation = pending.current.then(async () => {
      if (epoch !== generation.current)
        throw new Error("Movie changed during import");
      const reply = await call<Project | import("./lib/types").ImportResult>(
        command,
        args,
      );
      const project = "assetIds" in reply ? reply.project : reply;
      if (epoch !== generation.current)
        throw new Error("Movie changed during update");
      revision.current = project.revision;
      current.current = project;
      setP(project);
      notify(message);
      return project;
    });
    pending.current = operation.then(() => {}).catch(() => {});
    try {
      return await operation;
    } finally {
      importingRef.current = false;
      setImporting(false);
      setStatus("Saved locally");
    }
  };
  const importGenerateMedia = async (
    draftId: string,
    itemId: string,
    semantic: string,
  ) => {
    const epoch = generation.current;
    const path = await pickFile("media");
    if (!path) return;
    if (epoch !== generation.current)
      throw new Error("Movie changed during import");
    await mutateMedia(
      "import_job_media",
      { path, draftId, itemId, semantic, linked: importMode === "link" },
      "Media assigned",
    );
  };
  const executeJob = async <T,>(
    command: string,
    args: Record<string, unknown>,
  ): Promise<T> => {
    if (importingRef.current)
      throw new Error("Wait for the current operation to finish");
    const epoch = generation.current;
    importingRef.current = true;
    setImporting(true);
    setStatus("Preparing job…");
    const operation = pending.current.then(async () => {
      if (epoch !== generation.current)
        throw new Error("Movie changed during preparation");
      let reply: T;
      let failure: unknown;
      try {
        reply = await call<T>(command, args);
      } catch (e) {
        failure = e;
      }
      // Preparation can persist a refreshed profile even when preflight rejects
      // the job. Keep the document revision current in that case as well.
      try {
        const project = await call<Project>("get_project");
        if (epoch !== generation.current)
          throw new Error("Movie changed during preparation");
        revision.current = project.revision;
        current.current = project;
        setP(project);
      } catch (e) {
        if (failure === undefined) failure = e;
      }
      if (failure !== undefined) throw failure;
      return reply!;
    });
    pending.current = operation.then(() => {}).catch(() => {});
    try {
      return await operation;
    } finally {
      importingRef.current = false;
      setImporting(false);
      setStatus("Saved locally");
    }
  };
  const persistHeight = (h: number) => {
    void run(() => saveSettings({ ...settings, queueHeight: h }));
  };
  const resize = (clientY: number) => {
    if (drag.current) {
      setHeight(
        Math.max(
          96,
          Math.min(
            window.innerHeight * 0.65,
            drag.current.height + drag.current.start - clientY,
          ),
        ),
      );
    }
  };
  const welcome = () =>
    void run(async () => {
      await pending.current;
      if (native) await call("close_project");
      generation.current++;
      current.current = null;
      setP(null);
      setJobs([]);
      if (native) setRecent(await call("recent_projects"));
    });
  return (
    <div className="app" inert={importing}>
      {!p ? (
        <main className="welcome">
          <div className="brand-mark">
            <AppSymbol />
          </div>
          <span className="eyebrow">MYMOVIE STUDIO</span>
          <h1>
            Every movie begins
            <br />
            with a moment.
          </h1>
          <p>
            Bring your characters, keyframes and creative direction together in
            a portable film studio.
          </p>
          <div className="welcome-actions">
            <button className="welcome-card" onClick={open}>
              <FolderOpen size={30} />
              <strong>Open a movie</strong>
              <span>Pick up where your story left off.</span>
              <small>Choose a .mymovie document →</small>
            </button>
            <button className="welcome-card new" onClick={newMovie}>
              <Plus size={30} />
              <strong>Create a movie</strong>
              <span>A fresh canvas for your next story.</span>
              <small>Choose a name and location →</small>
            </button>
          </div>
          {recent.length > 0 && (
            <section className="recent-projects">
              <div className="row recent-heading">
                <span className="eyebrow">RECENT MOVIES</span>
                <button
                  className="text-button"
                  onClick={() =>
                    void run(async () =>
                      setRecent(await call("clear_recent_projects")),
                    )
                  }
                >
                  Clear list
                </button>
              </div>
              <div className="recent-scroll">
                {recent.map((r) => (
                  <div className="recent-entry" key={r.path}>
                    <button
                      className="choice"
                      onClick={() =>
                        void run(async () =>
                          loaded(await openMovie(r.path), r.path),
                        )
                      }
                    >
                      <AppSymbol />
                      <span>
                        <strong>{r.name}</strong>
                        <small>{r.path}</small>
                      </span>
                      <small>{new Date(r.opened).toLocaleDateString()}</small>
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Remove ${r.name} from recent movies`}
                      onClick={() =>
                        void run(async () =>
                          setRecent(
                            await call("remove_recent_project", {
                              path: r.path,
                            }),
                          ),
                        )
                      }
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <small>Removing entries keeps your movie files.</small>
            </section>
          )}
          <div className="welcome-note">
            <span>LOCAL FIRST</span>
            <span>YOUR ASSETS, YOUR STORY</span>
            <span>BUILT FOR MACOS</span>
          </div>
          {!native && (
            <button className="text-button" onClick={demoPreview}>
              Explore the browser preview
            </button>
          )}
        </main>
      ) : (
        <>
          <aside className="sidebar">
            <button
              className="brand"
              onClick={() =>
                setModal(
                  <Modal title="Your movie" onClose={() => setModal(null)}>
                    <button
                      className="choice"
                      onClick={() => {
                        setModal(null);
                        newMovie();
                      }}
                    >
                      Create a new movie
                    </button>
                    <button
                      className="choice"
                      onClick={() => {
                        setModal(null);
                        open();
                      }}
                    >
                      Open another .mymovie
                    </button>
                    <RenameMovie p={p} update={update} />
                  </Modal>,
                )
              }
            >
              <span className="brand-mark small">
                <AppSymbol />
              </span>
              <strong>
                MyMovie<span>STUDIO</span>
              </strong>
            </button>
            <div className="sidebar-project">
              <span className="eyebrow">MOVIE DOCUMENT</span>
              <strong title={p.name}>{p.name}</strong>
              <small>
                {native
                  ? `${p.episodes.length} episodes · local document`
                  : "Browser preview · memory only"}
              </small>
            </div>
            <nav>
              {routes.map(([name, Icon]) => (
                <button
                  key={name}
                  aria-label={name}
                  data-file-drop={name === "Library" ? "library" : undefined}
                  className={route === name ? "active" : ""}
                  onClick={() => setRoute(name)}
                >
                  <Icon size={18} />
                  <span>{name}</span>
                  {name === "Notifications" &&
                    settings.notifications.length > 0 && (
                      <b className="count">{settings.notifications.length}</b>
                    )}
                </button>
              ))}
            </nav>
            <div className="sidebar-bottom">
              <button className="text-button" onClick={welcome}>
                <ArrowLeft size={16} />
                Welcome
              </button>
              <span className="status-dot" /> {status}
              <small>⌘ Your story stays with you</small>
            </div>
          </aside>
          <section
            className="studio"
            data-file-drop={route === "Library" ? "library" : undefined}
          >
            <header className="topbar">
              <div className="row">
                <button
                  className="icon-button"
                  aria-label="Back to welcome"
                  onClick={welcome}
                >
                  <ArrowLeft size={18} />
                </button>
                <span className="muted">{p.name}</span>
                <span className="muted">/</span>
                <strong>{route}</strong>
              </div>
              <div className="row">
                <Picker
                  title="Media imports"
                  value={importMode}
                  options={[
                    {
                      id: "copy",
                      label: "Copy into movie",
                      description:
                        "Portable originals inside the .mymovie package",
                    },
                    {
                      id: "link",
                      label: "Keep original location",
                      description:
                        "Link files; collect them before sharing the movie",
                    },
                  ]}
                  onChange={setImportMode}
                />
                <span className="badge">
                  {native ? "LOCAL DOCUMENT" : "PREVIEW"}
                </span>
                <button
                  className="icon-button"
                  aria-label="Notifications"
                  onClick={() => setRoute("Notifications")}
                >
                  <Bell size={18} />
                </button>
              </div>
            </header>
            <main className="workspace">
              {route === "Keyframes" && episode && (
                <>
                  <div className="view-title">
                    <div>
                      <span className="eyebrow">STORY DEVELOPMENT</span>
                      <h1>Keyframes Board</h1>
                      <p>Shape the moments that make your movie.</p>
                    </div>
                    <div className="row">
                      <Picker
                        title="Episode"
                        value={episode.id}
                        options={p.episodes.map((e) => ({
                          id: e.id,
                          label: e.name,
                          description: `${e.scenes.length} scenes`,
                        }))}
                        onChange={setEpisodeId}
                      />
                      <button
                        onClick={() =>
                          setModal(
                            <EpisodeDialog
                              p={p}
                              episodeId={episode.id}
                              update={update}
                              onClose={() => setModal(null)}
                            />,
                          )
                        }
                      >
                        Edit episodes
                      </button>
                    </div>
                  </div>
                  <Board
                    key={episode.id}
                    project={p}
                    episode={episode}
                    root={root}
                    update={update}
                    onGenerate={chooseJob}
                    navigation={frameNavigation}
                    characterFilter={characterFilter}
                    clearFilter={() => setCharacterFilter("")}
                  />
                </>
              )}
              {route === "Characters" && (
                <Characters
                  project={p}
                  root={root}
                  update={update}
                  onImport={importCharacterReferences}
                  onNavigate={navigateFrame}
                  onFilterCharacter={(id) => {
                    setCharacterFilter(id);
                    setFrameNavigation(undefined);
                    setRoute("Keyframes");
                    const e = p.episodes.find((e) =>
                      e.scenes.some(
                        (s) =>
                          s.characterIds?.includes(id) ||
                          s.shots.some((sh) =>
                            sh.frames.some((f) => f.characterIds.includes(id)),
                          ),
                      ),
                    );
                    if (e) setEpisodeId(e.id);
                  }}
                />
              )}{" "}
              {route === "Library" && (
                <Library
                  project={p}
                  root={root}
                  jobs={jobs}
                  update={update}
                  onImport={() => importFile("media")}
                  onNavigate={navigateFrame}
                  onCollect={async () => {
                    await mutateMedia(
                      "collect_media",
                      {},
                      "All media collected into movie",
                    );
                  }}
                  onRelink={async (assetId) => {
                    const path = await pickFile("media");
                    if (path)
                      await mutateMedia(
                        "relink_asset",
                        { assetId, path },
                        "Original relinked",
                      );
                  }}
                />
              )}{" "}
              {route === "Workflows" && (
                <Workflows
                  archive={async (workflowId, archived) => { await mutateMedia("archive_workflow", {workflowId, archived}, archived ? "Workflow moved to Trash" : "Workflow restored"); }}
                  project={p}
                  settings={settings}
                  update={update}
                  onImport={browseWorkflows}
                  pin={async (workflowId) => {
                    await mutateMedia(
                      "pin_workflow",
                      { workflowId },
                      "Example added to this movie",
                    );
                  }}
                  prepare={prepareWorkflow}
                  notify={notify}
                  onGenerate={chooseJob}
                  saveForm={async (
                    workflowId,
                    bindings,
                    layout,
                    connectionId,
                  ) => {
                    await mutateMedia(
                      "save_workflow_form",
                      { workflowId, bindings, layout, connectionId },
                      "Workflow inputs saved",
                    );
                  }}
                />
              )}{" "}
              {route === "Generate" && (
                <Generate
                  project={p}
                  settings={settings}
                  root={root}
                  update={update}
                  selectedId={jobDraftId}
                  select={setJobDraftId}
                  flush={() => pending.current}
                  onJobs={setJobs}
                  jobs={jobs}
                  executeJob={executeJob}
                  configure={() => setRoute("Workflows")}
                  importMedia={importGenerateMedia}
                  importWorkflow={browseWorkflows}
                  prepare={prepareWorkflow}
                  notify={notify}
                />
              )}
              {route === "Jobs" && (
                <Jobs
                  project={p}
                  settings={settings}
                  jobs={jobs}
                  update={update}
                  select={(id) => {
                    setJobDraftId(id);
                    setRoute("Generate");
                  }}
                  onJobs={setJobs}
                  notify={notify}
                />
              )}
              {route === "Renders" && (
                <Renders
                  jobs={jobs}
                  root={root}
                  project={p}
                  update={update}
                  onNavigate={navigateFrame}
                  onImport={() => importFile("media")}
                  onCollect={async () => {
                    await mutateMedia(
                      "collect_media",
                      {},
                      "All media collected into movie",
                    );
                  }}
                  onRelink={async (assetId) => {
                    const path = await pickFile("media");
                    if (path)
                      await mutateMedia(
                        "relink_asset",
                        { assetId, path },
                        "Original relinked",
                      );
                  }}
                />
              )}{" "}
              {route === "Connections" && (
                <Connections
                  settings={settings}
                  save={saveSettings}
                  project={p}
                  notify={notify}
                />
              )}{" "}
              {route === "Settings" && (
                <Preferences
                  settings={settings}
                  save={saveSettings}
                  project={p}
                  update={update}
                  notify={notify}
                />
              )}{" "}
              {(route === "Notifications" || route === "Logs") && (
                <>
                  <div className="view-title">
                    <div>
                      <span className="eyebrow">STUDIO ACTIVITY</span>
                      <h1>{route}</h1>
                      <p>
                        {route === "Logs"
                          ? "Redacted diagnostics. Generation receipts stay in your movie."
                          : "A clear view of progress and things that need attention."}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        void run(async () =>
                          setSettings(
                            await call<AppSettings>("clear_diagnostics", {
                              kind: route.toLowerCase(),
                            }),
                          ),
                        )
                      }
                    >
                      Clear {route.toLowerCase()}
                    </button>
                  </div>
                  {settings[route.toLowerCase() as "logs" | "notifications"]
                    .length === 0 ? (
                    <Empty title="All clear">
                      Activity appears here as you work.
                    </Empty>
                  ) : (
                    settings[
                      route.toLowerCase() as "logs" | "notifications"
                    ].map((d) => (
                      <article className="panel activity" key={d.id}>
                        <span className="badge">{d.level}</span>
                        <p>{d.message}</p>
                        <small>{new Date(d.createdAt).toLocaleString()}</small>
                      </article>
                    ))
                  )}
                </>
              )}
            </main>
            <section
              className="queue"
              style={{ height: expanded ? height : "3.5rem" }}
            >
              <div
                className="queue-divider"
                role="separator"
                aria-label="Resize render queue"
                aria-orientation="horizontal"
                aria-valuenow={Math.round(height)}
                tabIndex={0}
                onPointerDown={(e) => {
                  drag.current = { start: e.clientY, height };
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setExpanded(true);
                }}
                onPointerMove={(e) => resize(e.clientY)}
                onPointerUp={() => {
                  drag.current = null;
                  persistHeight(height);
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                    e.preventDefault();
                    const h = Math.max(
                      96,
                      Math.min(
                        window.innerHeight * 0.65,
                        height + (e.key === "ArrowUp" ? 24 : -24),
                      ),
                    );
                    setHeight(h);
                    persistHeight(h);
                  }
                }}
              >
                <span />
              </div>
              <header className="queue-header">
                <div className="row">
                  <Clapperboard size={18} />
                  <strong>Render queue</strong>
                  <span className="badge">{queueJobs.length} jobs</span>
                </div>
                <div className="row">
                  <button
                    className="text-button"
                    disabled={clearingQueue || !queueJobs.some(finished)}
                    title="Clear completed, failed and canceled entries. Results and history stay in Jobs and Renders."
                    onClick={clearFinished}
                  >
                    Clear finished
                  </button>
                  <button
                    className="text-button"
                    onClick={() => void queueActions("refresh_jobs")}
                  >
                    Refresh
                  </button>
                  <button
                    className="icon-button"
                    aria-label={expanded ? "Collapse queue" : "Expand queue"}
                    onClick={() => setExpanded(!expanded)}
                  >
                    {expanded ? (
                      <ChevronDown size={18} />
                    ) : (
                      <ChevronUp size={18} />
                    )}
                  </button>
                </div>
              </header>
              {expanded && (
                <div className="queue-body">
                  {queueJobs.length === 0 ? (
                    <p className="muted">
                      Choose a workflow in Generate or select a keyframe to
                      start a render.
                    </p>
                  ) : (
                    queueJobs.map((j) => (
                      <article className="queue-job" key={j.id}>
                        <div>
                          <strong>
                            {!j.frameId
                              ? (p.workflows.find((w) => w.id === j.workflowId)
                                  ?.name ?? "Standalone generation")
                              : (p.episodes
                                  .flatMap((e) =>
                                    e.scenes.flatMap((s) =>
                                      s.shots.flatMap((sh) => sh.frames),
                                    ),
                                  )
                                  .find((f) => f.id === j.frameId)?.name ??
                                "Archived frame")}
                          </strong>
                          <small>{j.remoteId ?? j.id}</small>
                        </div>
                        <span className={`badge state-${j.state}`}>
                          {j.state}
                        </span>
                        {j.error && <span className="error">{j.error}</span>}
                        {j.state === "unknown" && !j.remoteId ? (
                          <button
                            onClick={() =>
                              setModal(
                                <ReconcileDialog
                                  job={j}
                                  onClose={() => setModal(null)}
                                  reconcile={async (
                                    remoteId,
                                    confirmedAbsent,
                                  ) => {
                                    await pending.current;
                                    await call("reconcile_job", {
                                      jobId: j.id,
                                      remoteId,
                                      confirmedAbsent,
                                    });
                                    setJobs(await call<Job[]>("list_jobs"));
                                  }}
                                />,
                              )
                            }
                          >
                            Resolve submission
                          </button>
                        ) : (
                          !["completed", "failed", "canceled"].includes(
                            j.state,
                          ) && (
                            <button
                              onClick={() =>
                                void queueActions("cancel_job", { jobId: j.id })
                              }
                            >
                              Cancel
                            </button>
                          )
                        )}
                      </article>
                    ))
                  )}
                </div>
              )}
            </section>
          </section>
        </>
      )}
      <BackgroundActivity connections={settings.connections} movieId={p?.id} apply={(connectionId,operationId) => {
        const epoch = generation.current;
        const operation = pending.current.then(async () => {
          if (epoch !== generation.current) return;
          const project = await call<Project | null>("apply_initialization",{connectionId,operationId});
          if (project && epoch === generation.current) {revision.current=project.revision;current.current=project;setP(project);}
        });
        pending.current=operation.catch(() => {});
        return operation;
      }}/>
      {modal}
      <div className="toast-host" aria-live="polite">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            <span>{t.message}</span>
            <button
              className="icon-button"
              aria-label="Dismiss notification"
              onClick={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))}
            >
              <X size={18} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
function NewMovie({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, demo: boolean) => void;
}) {
  const [name, setName] = useState("Untitled Movie"),
    [demo, setDemo] = useState(false);
  return (
    <Modal title="Create a movie" onClose={onClose}>
      <Field label="Movie name" value={name} onChange={setName} />
      <button
        className={`choice ${demo ? "selected" : ""}`}
        onClick={() => setDemo(!demo)}
      >
        <span>
          <strong>Include sample story</strong>
          <small>
            Pilot, The Storm and shared characters. Clearly marked sample
            content.
          </small>
        </span>
        {demo && <Check size={20} />}
      </button>
      <p className="muted">
        Choose where to store your portable .mymovie document in the next Finder
        dialog.
      </p>
      <button
        className="primary"
        disabled={!name.trim()}
        onClick={() => onCreate(name, demo)}
      >
        Choose location & create
      </button>
    </Modal>
  );
}
function RenameMovie({ p, update }: { p: Project; update: Update }) {
  const [name, setName] = useState(p.name);
  return (
    <>
      <Field label="Movie name" value={name} onChange={setName} />
      <button
        className="primary"
        disabled={!name.trim()}
        onClick={() =>
          update((p) => {
            p.name = name.trim();
          })
        }
      >
        Save movie name
      </button>
    </>
  );
}
function EpisodeDialog({
  p,
  episodeId,
  update,
  onClose,
}: {
  p: Project;
  episodeId: string;
  update: Update;
  onClose: () => void;
}) {
  const [name, setName] = useState(
      p.episodes.find((e) => e.id === episodeId)?.name ?? "",
    ),
    [newName, setNewName] = useState("");
  return (
    <Modal title="Episodes" onClose={onClose}>
      <Field label="Current episode name" value={name} onChange={setName} />
      <button
        disabled={!name.trim()}
        onClick={() => {
          update((p) => {
            p.episodes.find((e) => e.id === episodeId)!.name = name.trim();
          });
          onClose();
        }}
      >
        Save name
      </button>
      <hr />
      <Field
        label="New episode"
        value={newName}
        onChange={setNewName}
        placeholder="A new chapter"
      />
      <button
        className="primary"
        disabled={!newName.trim()}
        onClick={() => {
          update((p) => {
            p.episodes.push({ id: uid(), name: newName.trim(), scenes: [] });
          });
          onClose();
        }}
      >
        Add episode
      </button>
    </Modal>
  );
}
function ReconcileDialog({
  job,
  onClose,
  reconcile,
}: {
  job: Job;
  onClose: () => void;
  reconcile: (
    remoteId: string | null,
    confirmedAbsent: boolean,
  ) => Promise<void>;
}) {
  const [remote, setRemote] = useState("");
  const [absent, setAbsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title="Resolve unknown submission" onClose={onClose}>
      <p>
        Check the selected account’s task history for this attempt (
        {job.createdAt}). Attaching a task continues tracking; this action never
        submits a new job.
      </p>
      <Field
        label="Existing provider task ID"
        value={remote}
        onChange={(v) => {
          setRemote(v);
          setAbsent(false);
        }}
      />
      <Toggle
        label="I checked the provider history and confirm that no task was created"
        checked={absent}
        onChange={(v) => {
          setAbsent(v);
          if (v) setRemote("");
        }}
      />
      {error && <p role="alert">{error}</p>}
      <button
        className="primary"
        disabled={busy || (!remote.trim() && !absent)}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await reconcile(remote.trim() || null, absent);
            onClose();
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Checking…" : "Resolve submission"}
      </button>
    </Modal>
  );
}
