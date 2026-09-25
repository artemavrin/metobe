import type { SourceKind } from "@metobe/contracts/models";

// Which built-in logo a source gets (keys of LOGOS in components/brand-logo). Plain module: the server builds the
// settings lists with it, the client draws the logo.

/** An OpenAI-compatible server says nothing about itself: guess from the base URL, otherwise no logo (a letter). */
const HOST_HINTS: [string, string][] = [
  ["ollama", "ollama"],
  // Ollama's default port, for addresses like http://127.0.0.1:11434/v1.
  [":11434", "ollama"],
  ["lmstudio", "lmstudio"],
  ["vllm", "vllm"],
  ["openrouter", "openrouter"],
  ["together", "together"],
  ["groq", "groq"],
  ["deepinfra", "deepinfra"],
  ["fireworks", "fireworks"],
  ["huggingface", "huggingface"],
  ["hf.space", "huggingface"],
  ["nvidia", "nvidia"],
  ["xinference", "xinference"],
  ["azure", "azure"],
  ["cloudflare", "cloudflare"],
];
export const guessHostLogo = (url: string | undefined) =>
  HOST_HINTS.find(([hint]) => (url ?? "").toLowerCase().includes(hint))?.[1];

/** Each kind's own logo; an OpenAI-compatible server gets one guessed from its address, or a letter. */
const SOURCE_LOGO: Record<Exclude<SourceKind, "openai-compatible">, string> = {
  anthropic: "anthropic-mono",
  gateway: "vercel",
  openai: "openai",
  yandex: "yandex",
};

/** A source's logo: the admin's pick, else its kind's, else a guess from the base URL. */
export const sourceLogo = (source: {
  kind: SourceKind;
  logo: string | null;
  baseUrl: string | null;
}) =>
  source.logo ??
  (source.kind === "openai-compatible"
    ? guessHostLogo(source.baseUrl ?? undefined)
    : SOURCE_LOGO[source.kind]);
