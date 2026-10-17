import { useEffect, useState } from "react";
import { SecretField } from "./Controls";
import {
  defaultRunnerTokens,
  loadRunnerTokens,
  notebookTokenConfig,
  saveRunnerTokens,
  tokenError,
  type RunnerTokens as Tokens,
} from "../lib/node-auth";

export function RunnerTokenFields({
  tokens,
  change,
}: {
  tokens: Tokens;
  change: (value: Tokens) => void;
}) {
  const [error, setError] = useState("");
  return (
    <>
      <SecretField
        label="MYMOVIE_DESKTOP_TOKEN · app → relay"
        value={tokens.MYMOVIE_DESKTOP_TOKEN}
        onChange={(value) =>
          change({ ...tokens, MYMOVIE_DESKTOP_TOKEN: value })
        }
      />
      <SecretField
        label="MYMOVIE_AGENT_TOKEN · agent → relay"
        value={tokens.MYMOVIE_AGENT_TOKEN}
        onChange={(value) => change({ ...tokens, MYMOVIE_AGENT_TOKEN: value })}
      />
      <p className="muted">
        Predefined values are shared test defaults. Use the same pair in the
        agent and relay; custom values are saved in the system vault. Change both
        values for a private deployment.
      </p>
      <div className="row wrap">
        <button onClick={() => change({ ...defaultRunnerTokens })}>
          Use predefined values
        </button>
        <button
          onClick={() =>
            void loadRunnerTokens(true)
              .then((value) => {
                change(value);
                setError("");
              })
              .catch(() => setError("Unable to read saved private tokens."))
          }
        >
          Load saved private tokens
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </>
  );
}

export function RunnerTokenSettings({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [tokens, setTokens] = useState<Tokens>({ ...defaultRunnerTokens });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    loadRunnerTokens()
      .then((value) => {
        if (active) {
          setTokens(value);
          setReady(true);
        }
      })
      .catch(() => {
        if (active) notify("Unable to read node tokens from the system vault.");
      });
    return () => {
      active = false;
    };
  }, []);
  const save = async () => {
    setBusy(true);
    try {
      await saveRunnerTokens(tokens);
      notify(
        "Node tokens saved. New agent connections use this pair; saved connection credentials are preserved.",
      );
    } catch (e) {
      notify(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="panel storage-panel">
      <h2>Remote node access</h2>
      <p>
        Set the token pair used by your Colab, Kaggle or private runner relay.
        These settings apply to new agent connections, including Colab and Kaggle.
      </p>
      <RunnerTokenFields tokens={tokens} change={setTokens} />
      {tokenError(tokens) && <p role="alert">{tokenError(tokens)}</p>}
      <div className="row wrap">
        <button
          className="primary"
          disabled={!ready || busy || !!tokenError(tokens)}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save node tokens"}
        </button>
        <button
          disabled={!ready || !!tokenError(tokens)}
          onClick={() =>
            void navigator.clipboard
              .writeText(notebookTokenConfig(tokens))
              .then(() =>
                notify(
                  "Token assignments copied. Paste into the notebook Configure cell.",
                ),
              )
              .catch(() => notify("Unable to copy token assignments."))
          }
        >
          Copy notebook token configuration
        </button>
      </div>
    </article>
  );
}
