import { describe, expect, it } from "vitest";
import {
  defaultRunnerTokens,
  notebookRelayUrl,
  notebookTokenConfig,
  tokenError,
} from "./node-auth";

describe("notebook node authentication", () => {
  const tokens = {
    MYMOVIE_AGENT_TOKEN: "a".repeat(32),
    MYMOVIE_DESKTOP_TOKEN: "d".repeat(32),
  };
  it("validates the public pair and requires distinct, header-safe values", () => {
    expect(tokenError(defaultRunnerTokens)).toBeNull();
    expect(tokenError(tokens)).toBeNull();
    for (const value of [
      "short",
      tokens.MYMOVIE_AGENT_TOKEN,
      "d".repeat(32) + "\n",
      "d".repeat(513),
    ])
      expect(
        tokenError({ ...tokens, MYMOVIE_DESKTOP_TOKEN: value }),
      ).not.toBeNull();
  });
  it("exports editable Python assignments with quoting preserved", () => {
    expect(notebookTokenConfig(tokens)).toBe(
      `MYMOVIE_AGENT_TOKEN = "${tokens.MYMOVIE_AGENT_TOKEN}"\nMYMOVIE_DESKTOP_TOKEN = "${tokens.MYMOVIE_DESKTOP_TOKEN}"`,
    );
    expect(
      notebookTokenConfig({ ...tokens, MYMOVIE_AGENT_TOKEN: 'a"\\b' }),
    ).toContain('"a\\"\\\\b"');
  });
  it("accepts a temporary relay only after explicit polling selection", () => {
    expect(() =>
      notebookRelayUrl("https://demo.trycloudflare.com", false),
    ).toThrow(/polling/);
    expect(notebookRelayUrl("https://demo.trycloudflare.com/", true)).toBe(
      "https://demo.trycloudflare.com",
    );
    expect(notebookRelayUrl("https://relay.example/", false)).toBe(
      "https://relay.example",
    );
    // A similar domain is an ordinary HTTPS host, not a Cloudflare tunnel.
    expect(notebookRelayUrl("https://nottrycloudflare.com", false)).toBe(
      "https://nottrycloudflare.com",
    );
    for (const url of [
      "http://relay.example",
      "https://user:secret@relay.example",
      "https://relay.example?token=value",
      "https://relay.example#token",
    ])
      expect(() => notebookRelayUrl(url, true)).toThrow();
  });
});
