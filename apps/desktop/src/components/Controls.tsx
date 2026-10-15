import { AppSymbol } from "./AppSymbol";
import * as Dialog from "@radix-ui/react-dialog";
import { useState, type ReactNode } from "react";
import { X, Check, ChevronDown, Search } from "lucide-react";
export function Modal({
  title,
  children,
  onClose,
  footer,
  fullScreen = false,
  className = "",
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  fullScreen?: boolean;
  className?: string;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content
          className={`modal${fullScreen ? " modal-fullscreen" : ""} ${className}`}
          aria-describedby={undefined}
        >
          <header>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Close dialog">
              <X size={20} />
            </Dialog.Close>
          </header>
          <div className="modal-body">{children}</div>
          {footer && <footer className="modal-footer">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Picker({
  title,
  value,
  options,
  onChange,
  multiple = false,
  disabled = false,
  onClear,
}: {
  title: string;
  value: string | string[];
  options: { id: string; label: string; description?: string }[];
  onChange: (v: string) => void;
  multiple?: boolean;
  disabled?: boolean;
  onClear?: () => void;
}) {
  const [show, setShow] = useState(false);
  const [q, setQ] = useState("");
  const selected = Array.isArray(value) ? value : [value];
  return (
    <>
      <button
        className="picker"
        disabled={disabled}
        onClick={() => {
          setQ("");
          setShow(true);
        }}
        aria-label={title}
      >
        <span>
          {options
            .filter((o) => selected.includes(o.id))
            .map((o) => o.label)
            .join(", ") || title}
        </span>
        <ChevronDown size={16} />
      </button>
      {show && (
        <Modal title={title} onClose={() => setShow(false)}>
          <label className="search-input">
            <Search size={18} />
            <input
              autoFocus
              aria-label={`Search ${title}`}
              placeholder="Search…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          {onClear && (
            <button
              onClick={() => {
                onClear();
                setShow(false);
              }}
            >
              Clear selection
            </button>
          )}
          <div className="choices">
            {options
              .filter((o) =>
                `${o.label} ${o.description ?? ""}`
                  .toLowerCase()
                  .includes(q.toLowerCase()),
              )
              .map((o) => (
                <button
                  key={o.id}
                  className={`choice ${selected.includes(o.id) ? "selected" : ""}`}
                  onClick={() => {
                    onChange(o.id);
                    if (!multiple) setShow(false);
                  }}
                >
                  <span>
                    <strong>{o.label}</strong>
                    {o.description && <small>{o.description}</small>}
                  </span>
                  {selected.includes(o.id) && <Check size={20} />}
                </button>
              ))}
          </div>
        </Modal>
      )}
    </>
  );
}
export function Field({
  label,
  value,
  onChange,
  multiline = false,
  placeholder = "",
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}
export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-mark">
        <AppSymbol />
      </div>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
