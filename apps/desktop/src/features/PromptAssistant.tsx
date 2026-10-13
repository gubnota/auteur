import { useState } from "react";
import { Field, Modal } from "../components/Controls";
import { call } from "../lib/bridge";
import type { Connection } from "../lib/types";

export function AssistantDialog({ connection, close }: { connection: Connection; close: () => void }) {
  const [model, setModel] = useState("");
  const [text, setText] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send() {
    setBusy(true); setError(""); setAnswer("");
    try { setAnswer((await call<{text: string}>("assistant_request", { connectionId: connection.id, model: model.trim(), text })).text); }
    catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  return <Modal title={`Prompt assistant · ${connection.name}`} onClose={close}>
    <p className="muted">Optional assistance. Only the text below is sent to this provider when you press Send. Your images and movie document stay local. Provider usage may incur charges.</p>
    <fieldset disabled={busy} className="reference-fieldset">
      <Field label="Model ID available to your account" value={model} onChange={setModel} />
      <Field label="Request or prompt to refine" value={text} onChange={setText} multiline />
      <button className="primary" disabled={!model.trim() || !text.trim()} onClick={() => void send()}>Send to {connection.name}</button>
    </fieldset>
    {busy && <p role="status">Waiting for the model…</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {answer && <><Field label="Suggested text · review before using" value={answer} onChange={setAnswer} multiline /><button onClick={() => void navigator.clipboard.writeText(answer).catch(() => setError("Could not copy. Select and copy the suggested text instead."))}>Copy suggestion</button></>}
  </Modal>;
}
