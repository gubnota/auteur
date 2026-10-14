import defaults from "../../../../deploy/node-auth.defaults.json";
import { call, native } from "./bridge";

// Public, user-selected test defaults. Custom values are kept in the OS vault.
export const defaultRunnerTokens = defaults;
export type RunnerTokens = typeof defaults;

export function tokenError(tokens: RunnerTokens): string | null {
  if (Object.values(tokens).some((v) => !/^[!-~]{24,512}$/.test(v)))
    return "Use 24–512 printable characters without spaces for each token.";
  if (tokens.MYMOVIE_AGENT_TOKEN === tokens.MYMOVIE_DESKTOP_TOKEN)
    return "Agent and desktop tokens must be different.";
  return null;
}

export async function loadRunnerTokens(): Promise<RunnerTokens> {
  return native ? call<RunnerTokens>("get_runner_tokens") : { ...defaults };
}

export async function saveRunnerTokens(tokens: RunnerTokens): Promise<void> {
  const error = tokenError(tokens);
  if (error) throw new Error(error);
  await call("save_runner_tokens", { tokens });
}

export function notebookTokenConfig(tokens: RunnerTokens): string {
  return Object.entries(tokens)
    .map(([name, value]) => `${name} = ${JSON.stringify(value)}`)
    .join("\n");
}

export function notebookRelayUrl(raw: string, allowTemporary: boolean): string {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Use an HTTPS relay address without credentials, query or fragment.",
    );
  const temporary =
    url.hostname === "trycloudflare.com" ||
    url.hostname.endsWith(".trycloudflare.com");
  if (temporary && !allowTemporary)
    throw new Error(
      "Enable temporary Cloudflare polling mode for this notebook address.",
    );
  return url.toString().replace(/\/$/, "");
}
