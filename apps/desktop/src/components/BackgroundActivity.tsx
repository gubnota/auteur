import { useEffect, useRef, useState } from "react";
import {
  Activity,
  RefreshCw,
  Terminal,
  Maximize,
  Minimize,
} from "lucide-react";
import type { Connection } from "../lib/types";
import { call, native } from "../lib/bridge";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Modal, Picker } from "./Controls";

type Progress = {
  stage?: string;
  detail?: string;
  startedAt?: number;
  updatedAt?: number;
  bytes?: number;
  totalBytes?: number;
  log?: { stage: string; detail: string; at: number }[];
};
export type Initialization = {
  id: string;
  workflowId: string;
  workflowName: string;
  state: string;
  createdAt?: number;
  lastContact?: number;
  progress?: Progress;
  error?: string;
  connection: Connection;
};
const active = (state: string) =>
  ["queued", "running", "cancel_requested", "unknown"].includes(state);
export function openActivity() {
  window.dispatchEvent(new Event("mymovie:activity"));
}
export function openConsole(connectionId: string) {
  window.dispatchEvent(
    new CustomEvent("mymovie:console", { detail: connectionId }),
  );
}
const bytes = (n: number) =>
  n >= 1024 ** 3
    ? `${(n / 1024 ** 3).toFixed(2)} GiB`
    : `${(n / 1024 ** 2).toFixed(1)} MiB`;
export function BackgroundActivity({
  connections,
  movieId,
  apply,
}: {
  connections: Connection[];
  movieId?: string;
  apply: (connectionId: string, operationId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<Initialization[]>([]),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [consoleId, setConsoleId] = useState("");
  const [refresh, setRefresh] = useState(0);
  const applied = useRef(new Set<string>()),
    applying = useRef(new Set<string>());
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const rates = useRef(
    new Map<string, { bytes: number; time: number; rate: number }>(),
  );
  const signature = JSON.stringify(
    connections.filter((c) => c.kind === "relay"),
  );
  useEffect(() => {
    const show = () => setOpen(true);
    const terminal = (e: Event) => {
      setConsoleId((e as CustomEvent<string>).detail);
    };
    window.addEventListener("mymovie:activity", show);
    window.addEventListener("mymovie:console", terminal);
    return () => {
      window.removeEventListener("mymovie:activity", show);
      window.removeEventListener("mymovie:console", terminal);
    };
  }, []);
  useEffect(() => {
    let stopped = false,
      polling = false;
    const targets: Connection[] = JSON.parse(signature);
    setRows((old) =>
      old.filter((r) => targets.some((c) => c.id === r.connection.id)),
    );
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        for (const connection of targets) {
          try {
            const data = await call<Omit<Initialization, "connection">[]>(
              "list_initializations",
              { connectionId: connection.id },
            );
            if (stopped) return;
            setRows((old) => [
              ...old.filter((r) => r.connection.id !== connection.id),
              ...data.map((r) => ({ ...r, connection })),
            ]);
            setErrors((old) => {
              const next = { ...old };
              delete next[connection.id];
              return next;
            });
            for (const row of data) {
              const key = `${connection.id}:${row.id}:${movieId ?? "welcome"}`;
              if (row.progress?.bytes != null) {
                const now = Date.now(),
                  prev = rates.current.get(row.id);
                rates.current.set(row.id, {
                  bytes: row.progress.bytes,
                  time: now,
                  rate:
                    prev && now > prev.time && row.progress.bytes >= prev.bytes
                      ? ((row.progress.bytes - prev.bytes) * 1000) /
                        (now - prev.time)
                      : 0,
                });
              }
              if (
                movieId &&
                row.state === "completed" &&
                !applied.current.has(key) &&
                !applying.current.has(key)
              ) {
                applying.current.add(key);
                try {
                  await applyRef.current(connection.id, row.id);
                  applied.current.add(key);
                } catch (e) {
                  setErrors((old) => ({ ...old, [connection.id]: String(e) }));
                } finally {
                  applying.current.delete(key);
                }
              }
            }
          } catch (e) {
            if (!stopped)
              setErrors((old) => ({ ...old, [connection.id]: String(e) }));
          }
        }
      } finally {
        polling = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [signature, refresh, movieId]);
  const count = rows.filter((r) => active(r.state)).length;
  const terminalConnection = connections.find((c) => c.id === consoleId);
  return (
    <>
      <button
        className={`activity-launcher ${count ? "has-activity" : ""}`}
        onClick={() => setOpen(true)}
        aria-label="Open background activity"
      >
        <Activity size={18} />
        <span>Activity{count ? ` · ${count}` : ""}</span>
      </button>
      {open && (
        <Modal title="Background activity" onClose={() => setOpen(false)}>
          <p>
            Initialization continues on the node while you work elsewhere or
            close Studio. Keep its notebook running. Reconnect reads the same
            operation.
          </p>
          <div className="jobs-toolbar">
            <button onClick={() => setRefresh((n) => n + 1)}>
              <RefreshCw size={16} />
              Reconnect
            </button>
            <Picker
              title="Open remote console"
              value=""
              options={connections
                .filter((c) => c.kind === "relay")
                .map((c) => ({ id: c.id, label: c.name }))}
              onChange={setConsoleId}
            />
          </div>
          {!rows.length && (
            <p>
              No initialization operations on the connected nodes yet. Choose a
              workflow → Setup → Initialize.
            </p>
          )}
          {Object.entries(errors).map(([id, message]) => (
            <p role="alert" key={id}>
              {connections.find((c) => c.id === id)?.name}: {message}
            </p>
          ))}
          {[...rows]
            .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
            .map((row) => {
              const p = row.progress,
                elapsed = Math.max(
                  0,
                  Math.floor(
                    Date.now() / 1000 -
                      (p?.startedAt ?? row.createdAt ?? Date.now() / 1000),
                  ),
                );
              const rate = rates.current.get(row.id)?.rate ?? 0;
              const contact = row.lastContact
                ? Math.max(0, Math.floor(Date.now() / 1000 - row.lastContact))
                : undefined;
              return (
                <article
                  className="panel activity-operation"
                  key={`${row.connection.id}:${row.id}`}
                >
                  <div className="row">
                    <strong>{row.workflowName}</strong>
                    <span className={`badge state-${row.state}`}>
                      {row.state.replaceAll("_", " ")}
                    </span>
                  </div>
                  <p>
                    {row.connection.name} · {p?.stage ?? "Waiting for agent"}
                    {active(row.state)
                      ? ` · ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
                      : ""}
                  </p>
                  <p role="status">{p?.detail}</p>
                  {p?.totalBytes != null && p.bytes != null && (
                    <div className="transfer-progress">
                      <progress max={p.totalBytes} value={p.bytes} />
                      <span>
                        {bytes(p.bytes)} / {bytes(p.totalBytes)}
                        {rate ? ` · ${bytes(rate)}/s` : ""}
                      </span>
                    </div>
                  )}
                  {contact != null && (
                    <small>
                      Last contact {contact}s ago
                      {contact > 20 && active(row.state)
                        ? " · reconnecting"
                        : ""}
                    </small>
                  )}
                  {row.error && <p role="alert">{row.error}</p>}
                  {row.state === "unknown" && (
                    <p>
                      The lease expired. Reconnect while the agent is still
                      running; do not submit a second installation. After an
                      agent restart, its saved receipt reports the interruption;
                      retry explicitly.
                    </p>
                  )}
                  <div className="jobs-toolbar">
                    {active(row.state) && row.state !== "unknown" && (
                      <button
                        disabled={row.state === "cancel_requested"}
                        onClick={() =>
                          void call("cancel_initialization", {
                            connectionId: row.connection.id,
                            operationId: row.id,
                          })
                            .then(() => setRefresh((n) => n + 1))
                            .catch((e) =>
                              setErrors((old) => ({
                                ...old,
                                [row.connection.id]: String(e),
                              })),
                            )
                        }
                      >
                        {row.state === "cancel_requested"
                          ? "Canceling…"
                          : "Cancel initialization"}
                      </button>
                    )}
                    <button onClick={() => setConsoleId(row.connection.id)}>
                      <Terminal size={16} />
                      Console
                    </button>
                  </div>
                  <details>
                    <summary>Steps & logs</summary>
                    <ol className="activity-log">
                      {p?.log?.map((line, i) => (
                        <li key={i}>
                          <time>
                            {new Date(line.at * 1000).toLocaleTimeString()}
                          </time>
                          <span>{line.detail}</span>
                        </li>
                      ))}
                    </ol>
                  </details>
                </article>
              );
            })}
        </Modal>
      )}
      {terminalConnection && (
        <RemoteConsole
          connection={terminalConnection}
          onClose={() => setConsoleId("")}
        />
      )}
    </>
  );
}
type ConsoleState = {
  id: string;
  state: string;
  output: { seq: number; text: string }[];
};
function RemoteConsole({
  connection,
  onClose,
}: {
  connection: Connection;
  onClose: () => void;
}) {
  const [session, setSession] = useState<ConsoleState | null>(null),
    [error, setError] = useState(""),
    [input, setInput] = useState(""),
    [size, setSize] = useState("auto"),
    [fullScreen, setFullScreen] = useState(false);
  const restoreFullScreen = useRef<boolean | null>(null);
  const terminal = useRef<HTMLPreElement>(null);
  const request = (command?: Record<string, unknown>) =>
    call<ConsoleState>("console_request", {
      connectionId: connection.id,
      sessionId: session?.id ?? null,
      command: command ?? null,
    });
  useEffect(() => {
    let stopped = false;
    void call<ConsoleState>("console_request", {
      connectionId: connection.id,
      sessionId: null,
      command: null,
    })
      .then((v) => {
        if (!stopped) setSession(v);
      })
      .catch((e) => {
        if (!stopped) setError(String(e));
      });
    return () => {
      stopped = true;
    };
  }, [connection.id]);
  useEffect(() => {
    if (!session?.id) return;
    let stopped = false;
    let pending = false;
    const timer = setInterval(() => {
      if (pending) return;
      pending = true;
      void call<ConsoleState>("console_request", {
        connectionId: connection.id,
        sessionId: session.id,
        command: null,
      })
        .then((v) => {
          if (!stopped) {
            setSession(v);
            setError("");
          }
        })
        .catch((e) => {
          if (!stopped) setError(String(e));
        })
        .finally(() => {
          pending = false;
        });
    }, 700);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [session?.id, connection.id]);
  const inputQueue = useRef(Promise.resolve());
  const send = (command: Record<string, unknown>) => {
    inputQueue.current = inputQueue.current.then(async () => {
      try {
        setSession(await request(command));
        setError("");
      } catch (e) {
        setError(String(e));
      }
    });
    return inputQueue.current;
  };
  const toggleFullScreen = async () => {
    try {
      if (native) {
        const appWindow = getCurrentWindow();
        const before = await appWindow.isFullscreen();
        if (restoreFullScreen.current === null)
          restoreFullScreen.current = before;
        await appWindow.setFullscreen(!before);
        setFullScreen(!before);
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
        setFullScreen(false);
      } else {
        await document.documentElement.requestFullscreen();
        setFullScreen(true);
      }
    } catch (e) {
      setError(String(e));
    }
  };
  useEffect(
    () => () => {
      if (native && restoreFullScreen.current !== null)
        void getCurrentWindow()
          .setFullscreen(restoreFullScreen.current)
          .catch(() => {});
      else if (!native && document.fullscreenElement)
        void document.exitFullscreen().catch(() => {});
    },
    [],
  );
  useEffect(() => {
    if (
      !terminal.current ||
      !session?.id ||
      session.state === "closed" ||
      size !== "auto"
    )
      return;
    let timer: ReturnType<typeof setTimeout>;
    let previous = "";
    const element = terminal.current;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const style = getComputedStyle(element);
        const measure = document.createElement("span");
        measure.style.font = style.font;
        measure.textContent = "M";
        element.append(measure);
        const charWidth = measure.getBoundingClientRect().width || 8;
        measure.remove();
        const cols = Math.max(
          20,
          Math.min(
            300,
            Math.floor(
              (element.clientWidth -
                parseFloat(style.paddingLeft) -
                parseFloat(style.paddingRight)) /
                charWidth,
            ),
          ),
        );
        const rows = Math.max(
          5,
          Math.min(
            120,
            Math.floor(
              (element.clientHeight -
                parseFloat(style.paddingTop) -
                parseFloat(style.paddingBottom)) /
                (parseFloat(style.lineHeight) || 20),
            ),
          ),
        );
        const next = `${cols}x${rows}`;
        if (next !== previous) {
          previous = next;
          void send({ type: "resize", cols, rows });
        }
      }, 150);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [session?.id, session?.state, size]);
  useEffect(() => {
    if (terminal.current)
      terminal.current.scrollTop = terminal.current.scrollHeight;
  }, [session?.output]);
  // Bounded plain-text view. Escape sequences never become HTML.
  const output =
    session?.output
      .map((o) => o.text)
      .join("")
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "") ?? "";
  return (
    <Modal
      title={`Remote console · ${connection.name}`}
      onClose={onClose}
      fullScreen
      className="console-window"
    >
      <details className="console-help">
        <summary>Session · {session?.state ?? "connecting"} · Help</summary>
        <p>
          Interactive agent terminal · {session?.state ?? "connecting"}.
          Requires private tokens and an agent started with{" "}
          <code>--allow-console</code>. Opening a console clears readiness;
          initialize again after changes. Closing this window detaches;
          reopening reconnects. Sessions end after 30 minutes. Output keeps the
          latest 256 KiB.
        </p>
      </details>
      <pre
        className="remote-terminal"
        ref={terminal}
        tabIndex={0}
        aria-label="Remote terminal output"
        onKeyDown={(e) => {
          if (!session || session.state === "closed") return;
          const key =
            e.ctrlKey && e.key.toLowerCase() === "c"
              ? "\x03"
              : e.key === "Enter"
                ? "\r"
                : e.key === "Backspace"
                  ? "\x7f"
                  : e.key === "Tab"
                    ? "\t"
                    : ((
                        {
                          ArrowUp: "\x1b[A",
                          ArrowDown: "\x1b[B",
                          ArrowRight: "\x1b[C",
                          ArrowLeft: "\x1b[D",
                        } as Record<string, string>
                      )[e.key] ??
                      (!e.ctrlKey && !e.metaKey && e.key.length === 1
                        ? e.key
                        : ""));
          if (key) {
            e.preventDefault();
            void send({ type: "input", data: key });
          }
        }}
      >
        {output || "Waiting for terminal…"}
      </pre>
      <form
        className="console-input"
        onSubmit={(e) => {
          e.preventDefault();
          if (input) {
            void send({ type: "input", data: input + "\n" });
            setInput("");
          }
        }}
      >
        <input
          maxLength={4095}
          aria-label="Remote command"
          placeholder="Enter a command…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!session || session.state === "closed"}
        />
        <button disabled={!input || !session}>Send</button>
      </form>
      <div className="jobs-toolbar">
        <button
          disabled={!session}
          onClick={() => void send({ type: "input", data: "\x03" })}
        >
          Ctrl+C
        </button>
        <button onClick={() => void toggleFullScreen()}>
          {fullScreen ? <Minimize size={16} /> : <Maximize size={16} />}
          {fullScreen ? "Exit full screen" : "Enter full screen"}
        </button>
        <Picker
          title="Terminal size"
          value={size}
          options={["auto", "80x24", "100x30", "140x40"].map((id) => ({
            id,
            label: id === "auto" ? "Fit window" : id,
          }))}
          onChange={(v) => {
            setSize(v);
            if (v !== "auto") {
              const [cols, rows] = v.split("x").map(Number);
              void send({ type: "resize", cols, rows });
            }
          }}
        />
        <button
          disabled={!session || session.state === "closed"}
          onClick={() => void send({ type: "close" })}
        >
          End session
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </Modal>
  );
}
