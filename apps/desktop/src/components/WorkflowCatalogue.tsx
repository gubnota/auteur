import { useEffect, useState } from "react";
import type { Workflow } from "../lib/types";
import { call, native } from "../lib/bridge";
import { Modal, Field } from "./Controls";
export function WorkflowCatalogue({
  close,
  pin,
  importFile,
}: {
  close: () => void;
  pin: (id: string) => Promise<void>;
  importFile: () => void;
}) {
  const [list, setList] = useState<Workflow[]>([]),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (native)
      void call<Workflow[]>("list_workflows")
        .then(setList)
        .catch((e) => setError(String(e)));
  }, []);
  return (
    <Modal title="Workflow catalogue" onClose={close}>
      <p>
        Import a ComfyUI editor or API workflow once. Select a saved version for
        this movie whenever you need it.
      </p>
      <Field label="Search saved workflows" value={query} onChange={setQuery} />
      <div className="choices">
        {list
          .filter((w) => w.name.toLowerCase().includes(query.toLowerCase()))
          .map((w) => (
            <button
              key={w.id}
              className="choice catalogue-choice"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void pin(w.id)
                  .then(close)
                  .catch((e) => setError(String(e)))
                  .finally(() => setBusy(false));
              }}
            >
              {w.wrapper?.illustration && (
                <img src={w.wrapper.illustration} alt="Illustration" />
              )}
              <span>
                {w.wrapper?.exampleId && (
                  <small className="example-label">
                    Example · Illustration
                  </small>
                )}
                <strong>{w.name}</strong>
                <small>{w.wrapper?.description}</small>
                <small>
                  {w.editorGraph ? "Editor workflow" : "API workflow"} ·{" "}
                  {w.version.slice(0, 12)} · {w.profiles?.length ?? 0} prepared
                  targets
                </small>
              </span>
            </button>
          ))}
      </div>
      {!list.length && (
        <p className="muted">
          Your imported workflows will appear here and remain available in other
          movies.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <button
        className="primary"
        onClick={() => {
          close();
          importFile();
        }}
      >
        Import a new workflow version
      </button>
    </Modal>
  );
}
