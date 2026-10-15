import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Maximize, Minimize, RefreshCw } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Connection } from "../lib/types";
import { call, native } from "../lib/bridge";
import { Modal } from "./Controls";
type Reply = {
  id: string;
  state: string;
  output: { seq: number; text: string }[];
};
export function AgentTerminal({
  connection,
  onClose,
}: {
  connection: Connection;
  onClose: () => void;
}) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const term = useRef<Terminal | null>(null),
    session = useRef<string | null>(null);
  const send = useRef<(command: Record<string, unknown>) => void>(() => {});
  const [state, setState] = useState("connecting"),
    [error, setError] = useState(""),
    [full, setFull] = useState(false),
    [retry, setRetry] = useState(0);
  const originalFullscreen = useRef<boolean | null>(null);
  useEffect(() => {
    if (!host) return;
    let alive = true,
      polling = false,
      lastSeq = -1,
      inputQueue = Promise.resolve();
    const sessionKey = `studio.console.${connection.id}.${connection.deploymentId ?? ""}`;
    session.current = sessionStorage.getItem(sessionKey);
    const t = new Terminal({
      fontFamily: '"IBM Plex Mono", monospace',
      fontSize: 14,
      convertEol: false,
      cursorBlink: true,
      scrollback: 5000,
      theme: {
        background: "#191b19",
        foreground: "#f7f6ee",
        cursor: "#d5ff65",
        selectionBackground: "#526c37",
      },
    });
    const fit = new FitAddon();
    t.loadAddon(fit);
    term.current = t;
    t.open(host);
    const receive = (v: Reply) => {
      if (!alive) return;
      session.current = v.id;
      sessionStorage.setItem(sessionKey, v.id);
      setState(v.state);
      setError("");
      for (const row of v.output) {
        if (row.seq > lastSeq) {
          t.write(row.text);
          lastSeq = row.seq;
        }
      }
    };
    const request = (command: Record<string, unknown> | null) =>
      call<Reply>("console_request", {
        connectionId: connection.id,
        sessionId: session.current,
        command,
      });
    send.current = (command) => {
      inputQueue = inputQueue.then(async () => {
        if (!alive || !session.current) return;
        try {
          receive(await request(command));
        } catch (e) {
          if (alive)
            setError(
              `${String(e)}. Input was not replayed; reconnect to inspect the session.`,
            );
        }
      });
    };
    const resized = () => {
      try {
        fit.fit();
        if (session.current)
          send.current({ type: "resize", cols: t.cols, rows: t.rows });
      } catch {}
    };
    const observer = new ResizeObserver(resized);
    observer.observe(host);
    const input = t.onData((data) => send.current({ type: "input", data }));
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        receive(await request(null));
      } catch (e) {
        if (alive) setError(String(e));
      } finally {
        polling = false;
      }
    };
    void poll().then(resized);
    const timer = setInterval(() => void poll(), 700);
    t.focus();
    return () => {
      alive = false;
      clearInterval(timer);
      observer.disconnect();
      input.dispose();
      t.dispose();
      term.current = null;
      send.current = () => {};
    };
  }, [host, connection.id, retry]);
  useEffect(
    () => () => {
      if (native && originalFullscreen.current !== null)
        void getCurrentWindow().setFullscreen(originalFullscreen.current);
    },
    [],
  );
  const toggle = async () => {
    if (native) {
      const win = getCurrentWindow();
      if (originalFullscreen.current === null)
        originalFullscreen.current = await win.isFullscreen();
      await win.setFullscreen(!full);
    }
    setFull(!full);
  };
  return (
    <Modal
      title={`Terminal · ${connection.name}`}
      onClose={onClose}
      fullScreen
      className="console-window"
    >
      <div className="jobs-toolbar">
        <span role="status">{state}</span>
        <button
          title="Send an interrupt to the foreground process"
          onClick={() => send.current({ type: "input", data: "\x03" })}
        >
          Ctrl+C
        </button>
        <button
          title="Fit the terminal to the entire screen"
          onClick={() => void toggle()}
        >
          {full ? <Minimize size={16} /> : <Maximize size={16} />}{" "}
          {full ? "Exit full screen" : "Full screen"}
        </button>
        <button
          title="Reconnect to the agent's existing shell without replaying commands"
          onClick={() => setRetry((v) => v + 1)}
        >
          <RefreshCw size={16} /> Reconnect
        </button>
        {(state === "closed" || !!error) && (
          <button
            onClick={() => {
              sessionStorage.removeItem(
                `studio.console.${connection.id}.${connection.deploymentId ?? ""}`,
              );
              setRetry((v) => v + 1);
            }}
          >
            New session
          </button>
        )}
        <button
          title="Close the remote shell process"
          onClick={() => send.current({ type: "close" })}
        >
          End session
        </button>
      </div>
      <div
        ref={setHost}
        className="agent-terminal"
        aria-label="Interactive remote terminal"
      />
      <small>
        Type directly in the terminal. Tab, history, paste and Ctrl+C work in
        the remote shell. Closing this window detaches; it does not end the
        session. Private console access is required.
      </small>
      {error && <p role="alert">{error}</p>}
    </Modal>
  );
}
