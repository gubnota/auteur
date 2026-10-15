import "./global-workspace.css";
import { GlobalSearch } from "./global-search";
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
  X,
  Search,
  Check,
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
  ["Scenes", Film],
  ["Locations", Film],
  ["Timeline", Layers],
  ["Movie settings", Settings],
  ["Characters", Users],
  ["Library", Image],
  ["Workflows", WorkflowIcon],
  ["Generate", WandSparkles],
  ["Jobs", ListChecks],
  ["Renders", Clapperboard],
  ["Instances", Server],
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
  const [movie,setMovie] = useState<Project | null>(null);
  const movieRef = useRef<Project | null>(null);
  const movieRevision = useRef(0);
  const [searchOpen,setSearchOpen] = useState(false);
  const [moviesOpen,setMoviesOpen] = useState(false);
  const [p, setP] = useState<Project | null>(null),
    [root, setRoot] = useState(""),
    [route, setRoute] = useState(localStorage.getItem("studio.globalRoute") || "Workflows"),
    [episodeId, setEpisodeId] = useState(""),
    [settings, replaceSettings] = useState(initialSettings),
    [jobs, setJobs] = useState<Job[]>([]),
    [status, setStatus] = useState("Saved locally"),
    [modal, setModal] = useState<ReactNode>(null),
    [toasts, setToasts] = useState<{ id: string; message: string }[]>([]),
    [workspaceError,setWorkspaceError] = useState("");
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
    pending = useRef(Promise.resolve());
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
    movieRef.current = project;
    movieRevision.current = project.revision;
    setMovie(project);
    setRoot(path);
    setEpisodeId(project.episodes[0]?.id ?? "");
    setRoute("Keyframes");
    void run(async () => acceptWorkspace(await call<Project>("get_workspace")));
    if (native) void run(async () => setRecent(await call("recent_projects")));
  };
  const acceptWorkspace = (project:Project) => {
    current.current=project; revision.current=project.revision; setP(project);
  };
  const movieRoutes = ["Keyframes","Scenes","Characters","Locations","Timeline","Movie settings"];
  useEffect(() => { if(!movieRoutes.includes(route)) localStorage.setItem("studio.globalRoute",route); },[route]);
  useEffect(() => { void call<Project>("get_workspace").then(acceptWorkspace).catch(e=>setWorkspaceError(String(e))); },[]);
  useEffect(() => {
    const handler=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();setSearchOpen(v=>!v);}};
    window.addEventListener("keydown",handler);return()=>window.removeEventListener("keydown",handler);
  },[]);
  const updateMovie:Update = fn => {
    if(!movieRef.current)return;
    const before=movieRef.current, next=structuredClone(before); fn(next);
    movieRef.current=next;setMovie(next);
    pending.current=pending.current.then(async()=>{
      if(movieRef.current?.id !== next.id)return;
      try {const saved=await call<Project>("save_project",{project:next,expectedRevision:movieRevision.current});
        movieRevision.current=saved.revision;
        if(movieRef.current===next){movieRef.current=saved;setMovie(saved);}
      }catch(e){notify(String(e));const saved=await call<Project>("get_project");movieRevision.current=saved.revision;movieRef.current=saved;setMovie(saved);}
    });
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
    if (!native) return;
    const refresh = () => {
      void run(async () => {
        setJobs(await call<Job[]>("list_jobs"));
        setSettings(await call<AppSettings>("get_settings"));
        if (status === "Saved locally") {
          const saved = await call<Project>("get_workspace");
          if (saved.revision > revision.current) {
            revision.current = saved.revision;
            current.current = saved;
            setP(saved);
          }
        }
      });
    };
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [status]);
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
        const saved = await call<Project>("save_workspace", {
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
          const saved = await call<Project>("get_workspace");
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
  const episode = movie?.episodes.find((e) => e.id === episodeId) ?? movie?.episodes[0];
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
    if (frameId && movie && draft.context) {
      draft.context.storyboard = { movieId: movie.id, movieName: movie.name, positivePrompt: movie.positivePrompt, negativePrompt: movie.negativePrompt, episodes: structuredClone(movie.episodes), characters: structuredClone(movie.characters) };
    }
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
            "Workflow added to Studio",
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
      if(args.frameId || args.shotId || args.episodeId || args.sceneId || args.newScene || args.characterId) {movieRef.current=project;movieRevision.current=project.revision;setMovie(project);} else acceptWorkspace(project);
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
      if(command === "import_character_references" || command === "collect_media" && !!movieRef.current) { movieRef.current=project;movieRevision.current=project.revision;setMovie(project); } else acceptWorkspace(project);
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
        const project = await call<Project>("get_workspace");
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
  const welcome = () =>
    void run(async () => {
      await pending.current;
      if (native) await call("close_project");
      movieRef.current=null;setMovie(null);setRoot("");
      setRoute(localStorage.getItem("studio.globalRoute") || "Workflows");
      if (native) setRecent(await call("recent_projects"));
    });
  return (
    <div className="app" inert={importing}>
      {!p ? (
        <main className="welcome"><AppSymbol/><h1>MyMovie Studio</h1><p>{workspaceError || "Opening Studio…"}</p>{workspaceError && <button onClick={()=>window.location.reload()}>Retry</button>}</main>
      ) : (
        <>
          <aside className="sidebar">
            <button
              className="brand"
              aria-label="MyMovie STUDIO"
              onClick={() => setMoviesOpen(true)}
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
              <strong title={movie?.name}>{movie?.name || "Global workspace"}</strong>
              <small>
                {native
                  ? movie ? `${movie.episodes.length} episodes` : "No Movie required"
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
                  data-inactive={!movie && movieRoutes.includes(name)}
                  title={!movie && movieRoutes.includes(name) ? "Open a Movie to use this workspace" : name}
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
              <button className="text-button" onClick={movie ? welcome : ()=>setMoviesOpen(true)}>
                <FolderOpen size={16} />
                {movie ? "Close movie" : "Movies"}
              </button>
              <span className="status-dot" /> {status}
              <small>Shared Studio resources</small>
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
                  aria-label="Open movie"
                  onClick={open}
                >
                  <FolderOpen size={18} />
                </button>
                <span className="muted">{movie?.name || "Studio"}</span>
                <span className="muted">/</span>
                <strong>{route}</strong>
              </div>
              <div className="row">
                <button title="Search Studio (Command K)" onClick={()=>setSearchOpen(true)}><Search size={16}/>Search Studio</button>
                <button onClick={newMovie}><Plus size={16}/>Movie</button>
                <Picker
                  title="Media imports"
                  value={importMode}
                  options={[
                    {
                      id: "copy",
                      label: "Import into Library",
                      description:
                        "Store originals once in the global Library; attach them to Movies when needed",
                    },
                    {
                      id: "link",
                      label: "Keep original location",
                      description:
                        "Link original files; Collect makes a Movie portable",
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
              {movieRoutes.includes(route) && !movie && <Empty title="Open a Movie for this workspace"><p>Scenes, characters and the storyboard belong to a Movie. Workflows, jobs and media remain available globally.</p><div className="row"><button className="primary" onClick={newMovie}>Create Movie</button><button onClick={open}>Open Movie</button></div></Empty>}
              {movie && ["Scenes","Timeline"].includes(route) && <><h1>{route}</h1><button onClick={()=>setRoute("Keyframes")}>Open storyboard</button>{movie.episodes.map(e=><article className="panel" key={e.id}><h2>{e.name}</h2>{e.scenes.map(scene=><button className="choice" key={scene.id} onClick={()=>{setEpisodeId(e.id);setRoute("Keyframes");}}>{scene.name}<small>{scene.shots.length} shots</small></button>)}</article>)}</>}
              {movie && route === "Locations" && <Empty title="Scene locations"><p>Location notes are stored in scene descriptions in this version.</p><button onClick={()=>setRoute("Keyframes")}>Open scenes</button></Empty>}
              {movie && route === "Movie settings" && <><h1>Movie settings</h1><RenameMovie p={movie} update={updateMovie}/><Picker title="Movie ratio" value={movie.ratio} options={["16:9","9:16","1:1","3:4","4:3","2:3","21:9"].map(id=>({id,label:id}))} onChange={value=>updateMovie(p=>{p.ratio=value;})}/><button onClick={()=>void mutateMedia("collect_media",{},"Movie assets collected")}>Collect media for portability</button></>}
              {route === "Keyframes" && movie && episode && (
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
                        options={movie.episodes.map((e) => ({
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
                              p={movie!}
                              episodeId={episode.id}
                              update={updateMovie}
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
                    project={movie!}
                    episode={episode}
                    root={root}
                    update={updateMovie}
                    onGenerate={chooseJob}
                    navigation={frameNavigation}
                    characterFilter={characterFilter}
                    clearFilter={() => setCharacterFilter("")}
                  />
                </>
              )}
              {route === "Characters" && movie && (
                <Characters
                  project={movie!}
                  root={root}
                  update={updateMovie}
                  onImport={importCharacterReferences}
                  onNavigate={navigateFrame}
                  onFilterCharacter={(id) => {
                    setCharacterFilter(id);
                    setFrameNavigation(undefined);
                    setRoute("Keyframes");
                    const e = movie.episodes.find((e) =>
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
              {route === "Library" && movie && <details className="panel"><summary>Attach existing media to {movie.name}</summary><div className="attach-grid">{p.assets.filter(a=>!a.archivedAt).map(a=><button key={a.id} onClick={()=>void run(async()=>{const attached=await call<Project>("attach_global_asset",{assetId:a.id});movieRef.current=attached;movieRevision.current=attached.revision;setMovie(attached);notify("Media attached to Movie");})}>{a.name}</button>)}</div></details>}
              {route === "Library" && (
                <Library
                  project={p}
                  usageProject={movie ?? undefined}
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
                  movie={movie ?? undefined}
                  duplicate={async workflowId=>{await mutateMedia("duplicate_workflow",{workflowId},"Editable workflow copy created");}}
                  clearTrash={async () => { await mutateMedia("clear_workflow_trash", {}, "Workflow trash cleared"); }}
                  archive={async (workflowId, archived) => { await mutateMedia("archive_workflow", {workflowId, archived}, archived ? "Workflow moved to Trash" : "Workflow restored"); }}
                  project={p}
                  settings={settings}
                  update={update}
                  onImport={browseWorkflows}
                  pin={async (workflowId) => {
                    await mutateMedia(
                      "pin_workflow",
                      { workflowId },
                      "Example ready in Studio",
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
                  usageProject={movie ?? undefined}
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
              {route === "Instances" && (
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
                          ? "Redacted diagnostics. Generation receipts stay in Studio."
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
      {moviesOpen && <Modal title="Movies" onClose={()=>setMoviesOpen(false)}>                    <button
                      className="choice"
                      onClick={() => {
                        setMoviesOpen(false);
                        newMovie();
                      }}
                    >
                      Create a new movie
                    </button>
                    <button
                      className="choice"
                      onClick={() => {
                        setMoviesOpen(false);
                        open();
                      }}
                    >
                      Open another .mymovie
                    </button>
                    {movie && <RenameMovie p={movie} update={updateMovie} />}
                    {movie && <button className="choice" onClick={()=>{setMoviesOpen(false);welcome();}}>Close movie</button>}
                    <button disabled={!recent.length} onClick={()=>void run(async()=>setRecent(await call("clear_recent_projects")))}>Clear list</button><div className="recent-scroll">{recent.map(r=><div className="choice" key={r.path}><button onClick={()=>void run(async()=>{await pending.current;loaded(await openMovie(r.path),r.path);setMoviesOpen(false);})}><strong>{r.name}</strong><small>{r.path}</small></button><button type="button" aria-label={`Remove ${r.name} from recents`} onClick={e=>{e.stopPropagation();void run(async()=>setRecent(await call("remove_recent_project",{path:r.path})));}}><X size={16}/></button></div>)}</div>
</Modal>}
      {searchOpen && p && <GlobalSearch project={p} jobs={jobs} connections={settings.connections} recent={recent} close={()=>setSearchOpen(false)} navigate={setRoute} useWorkflow={id=>chooseJob("",id)} openMovie={path=>void run(async()=>loaded(await openMovie(path),path))}/>}
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
