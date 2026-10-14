import { useState } from "react";
import type { Asset } from "../lib/types";
import { Field, Modal } from "./Controls";
import { Media } from "./Media";

/** Chooses existing identities; selection never imports or copies originals. */
export function MediaPicker({
  title,
  assets,
  root,
  value,
  onChange,
  multiple = false,
  usedIds = [],
}: {
  title: string;
  assets: Asset[];
  root: string;
  value: string | string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  usedIds?: string[];
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState("");
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const [pending, setPending] = useState<string[]>([]);
  const visible = assets.filter(
    (a) => !a.archivedAt && a.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <button
        className="media-picker-trigger"
        onClick={() => {
          setPending(selected);
          setSearch("");
          setOpen(true);
        }}
      >
        {title} ·{" "}
        {selected.length
          ? `${selected.length} selected`
          : "Choose from Library"}
      </button>
      {open && (
        <Modal title={title} onClose={() => setOpen(false)}>
          <Field label="Search media" value={search} onChange={setSearch} />
          <div className="media-picker-grid">
            {visible.map((a) => (
              <button
                key={a.id}
                aria-label={`${a.name} · ${a.kind}${pending.includes(a.id) ? " · Selected" : usedIds.includes(a.id) ? " · Assigned to another input · reuse allowed" : ""}`}
                className={`media-tile ${pending.includes(a.id) ? "selected" : ""}`}
                aria-pressed={pending.includes(a.id)}
                onClick={() => {
                  if (!multiple) {
                    onChange([a.id]);
                    setOpen(false);
                  } else
                    setPending((ids) =>
                      ids.includes(a.id)
                        ? ids.filter((id) => id !== a.id)
                        : [...ids, a.id],
                    );
                }}
              >
                <div className="tile-preview">
                  <Media asset={a} root={root} thumbnail />
                </div>
                <strong className="asset-name" title={a.name}>
                  {a.name}
                </strong>
                <small>
                  {a.kind} ·{" "}
                  {pending.includes(a.id)
                    ? "Selected"
                    : usedIds.includes(a.id)
                      ? "Assigned to another input · reuse allowed"
                      : a.sha256.slice(0, 8)}
                </small>
              </button>
            ))}
          </div>
          {!visible.length && (
            <p>No matching media. Import files into Library first.</p>
          )}
          <div className="jobs-toolbar">
            <button
              onClick={() => {
                onChange([]);
                setOpen(false);
              }}
            >
              Clear selection
            </button>
            {multiple && (
              <button
                className="primary"
                onClick={() => {
                  onChange(pending);
                  setOpen(false);
                }}
              >
                Use {pending.length} selected
              </button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
