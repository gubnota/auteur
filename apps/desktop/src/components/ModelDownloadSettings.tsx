import { useEffect, useState } from "react";
import { call } from "../lib/bridge";
import { Field, Toggle } from "./Controls";
import { SourceLink } from "./SourceLink";

export function ModelDownloadSettings() {
  const [configured, setConfigured] = useState(false);
  const [token, setToken] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    void call<boolean>("model_token_status")
      .then(setConfigured)
      .catch((e) => setMessage(String(e)));
  }, []);
  const act = async (remove: boolean) => {
    setBusy(true);
    setMessage("");
    try {
      if (remove) await call("remove_model_token");
      else await call("save_model_token", { token: token.trim() });
      setConfigured(!remove);
      setToken("");
      setShow(false);
      setMessage(
        remove
          ? "Hugging Face token removed"
          : "Hugging Face token saved in the system vault",
      );
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="panel model-download-settings">
      <h2>Model downloads</h2>
      <p>
        Use your Hugging Face account for restricted model downloads during
        agent initialization.
      </p>
      <p role="status">
        HF_TOKEN:{" "}
        {configured ? "Configured in the system vault" : "Not configured"}
      </p>
      <Field
        label={configured ? "Replace HF_TOKEN" : "HF_TOKEN"}
        value={token}
        type={show ? "text" : "password"}
        onChange={setToken}
      />
      <Toggle label="Show new token" checked={show} onChange={setShow} />
      <div className="jobs-toolbar">
        <button
          className="primary"
          disabled={busy || !token.trim()}
          onClick={() => void act(false)}
        >
          {busy ? "Saving…" : configured ? "Replace token" : "Save token"}
        </button>
        <button disabled={busy || !configured} onClick={() => void act(true)}>
          Remove token
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      <p>
        Request access to gated models with the same account first. A token
        authenticates your account; it does not grant model access.
      </p>
      <SourceLink source="https://huggingface.co/settings/tokens" />
      <small>
        The saved value is never loaded into this form. Installation sends it
        once to the selected agent over an authenticated relay, with a
        ten-minute expiry. Use matching private desktop and agent tokens in Node
        access and on the node. Shared test defaults cannot carry private
        credentials. Node-local HF_TOKEN remains a fallback.
      </small>
    </article>
  );
}
