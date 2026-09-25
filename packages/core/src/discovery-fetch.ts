import type { SourceKind, SourceOptions } from "@metobe/contracts/models";

import { baseUrlOf } from "./ai-build";
import {
  fromAnthropic,
  fromCompatible,
  fromGateway,
  fromOpenAI,
  fromYandex,
} from "./discovery-map";
import type {
  AnthropicModel,
  DiscoveredModel,
  OllamaShow,
} from "./discovery-map";

// A source's model list over a given fetch, free of the database: the same code lists a saved source (discovery.ts)
// and checks one that is not saved yet (sources-probe.ts).

/** What is needed to talk to a source, saved or not. */
export interface SourceSpec {
  kind: SourceKind;
  baseUrl: string | null;
  options: SourceOptions;
}

/** The Gateway's catalogue is public and lives outside its inference endpoint. */
export const GATEWAY_MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";

/** A failed list request, with the status the UI turns into a human message (401 → key, 403 → rights, …). */
export class DiscoveryError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "DiscoveryError";
    this.status = status;
  }
}

export interface ListOptions {
  /** Covers the whole response, body included: a body stuck mid-way (DPI) fails like a dead connection. */
  timeoutMs?: number;
  /** Ask Ollama for each model's capabilities; a check only needs the list. */
  enrich?: boolean;
}

const getJson = async <T>(
  fetch: typeof globalThis.fetch,
  url: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<T> => {
  const res = await fetch(url, {
    headers: { accept: "application/json", ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new DiscoveryError(
      `${new URL(url).host} answered ${res.status}`,
      res.status
    );
  }
  return (await res.json()) as T;
};

/**
 * When an OpenAI-compatible server is Ollama, its native `/api/show` states each model's capabilities and context.
 * Anything else answers 404 on the first try and is left as «unknown». Four requests at a time.
 */
const ollamaShows = async (
  fetch: typeof globalThis.fetch,
  base: string,
  ids: string[],
  headers: Record<string, string>
) => {
  const shows = new Map<string, OllamaShow>();
  const origin = base.replace(/\/v1$/u, "");
  const show = async (model: string) => {
    const res = await fetch(`${origin}/api/show`, {
      body: JSON.stringify({ model }),
      headers: { "content-type": "application/json", ...headers },
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? ((await res.json()) as OllamaShow) : null;
  };
  const [first, ...rest] = ids;
  if (!first) {
    return shows;
  }
  const probe = await show(first).catch(() => null);
  if (!probe?.capabilities) {
    return shows;
  }
  shows.set(first, probe);
  for (let i = 0; i < rest.length; i += 4) {
    const batch = rest.slice(i, i + 4);
    // oxlint-disable-next-line no-await-in-loop -- deliberate: four requests at a time, not all at once
    const answers = await Promise.all(
      batch.map((id) => show(id).catch(() => null))
    );
    for (const [k, id] of batch.entries()) {
      const answer = answers[k];
      if (answer) {
        shows.set(id, answer);
      }
    }
  }
  return shows;
};

/** The source's current model list, mapped to our shape. */
export const fetchModelList = async (
  spec: SourceSpec,
  apiKey: string | null,
  fetch: typeof globalThis.fetch,
  { timeoutMs = 20_000, enrich = true }: ListOptions = {}
): Promise<DiscoveredModel[]> => {
  const base = baseUrlOf(spec.kind, spec.baseUrl).replace(/\/$/u, "");
  const listUrl =
    spec.kind === "gateway" ? GATEWAY_MODELS_URL : `${base}/models`;
  const bearer: Record<string, string> = apiKey
    ? { authorization: `Bearer ${apiKey}` }
    : {};

  switch (spec.kind) {
    case "gateway": {
      const { data } = await getJson<{
        data: Parameters<typeof fromGateway>[0];
      }>(fetch, listUrl, {}, timeoutMs);
      return fromGateway(data);
    }
    case "openai": {
      const { data } = await getJson<{
        data: { id: string; created?: number }[];
      }>(fetch, listUrl, bearer, timeoutMs);
      return fromOpenAI(data);
    }
    case "anthropic": {
      // Paged: has_more / last_id.
      const all: AnthropicModel[] = [];
      let after: string | undefined;
      do {
        // oxlint-disable-next-line no-await-in-loop -- a cursor: the next page needs this page's last_id
        const page = await getJson<{
          data: typeof all;
          has_more: boolean;
          last_id?: string;
        }>(
          fetch,
          `${listUrl}?limit=1000${after ? `&after_id=${encodeURIComponent(after)}` : ""}`,
          { "anthropic-version": "2023-06-01", "x-api-key": apiKey ?? "" },
          timeoutMs
        );
        all.push(...page.data);
        after = page.has_more ? page.last_id : undefined;
      } while (after);
      return fromAnthropic(all);
    }
    case "yandex": {
      const { data } = await getJson<{ data: { id: string }[] }>(
        fetch,
        listUrl,
        bearer,
        timeoutMs
      );
      return fromYandex(data);
    }
    case "openai-compatible": {
      const { data } = await getJson<{ data: { id: string }[] }>(
        fetch,
        listUrl,
        bearer,
        timeoutMs
      );
      return fromCompatible(
        data,
        enrich
          ? await ollamaShows(
              fetch,
              base,
              data.map((m) => m.id),
              bearer
            )
          : undefined
      );
    }
    default: {
      const unknown: never = spec.kind;
      throw new Error(`unknown source kind ${String(unknown)}`);
    }
  }
};

/**
 * The Gateway lists models without a key, so its key is checked separately: `/v1/credits` needs one (the same call
 * the AI SDK makes for `getCredits`).
 */
export const checkGatewayKey = async (
  apiKey: string | null,
  fetch: typeof globalThis.fetch,
  timeoutMs = 20_000
) => {
  await getJson(
    fetch,
    new URL("/v1/credits", GATEWAY_MODELS_URL).toString(),
    {
      "ai-gateway-auth-method": "api-key",
      "ai-gateway-protocol-version": "0.0.1",
      authorization: `Bearer ${apiKey ?? ""}`,
    },
    timeoutMs
  );
};
