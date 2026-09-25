import type { SourceFailure } from "@metobe/contracts/models";

import {
  checkGatewayKey,
  DiscoveryError,
  fetchModelList,
} from "./discovery-fetch";
import type { SourceSpec } from "./discovery-fetch";
import type { DiscoveredModel } from "./discovery-map";

// The real check of a source (ARCH §7, UX §5): its model list over a given route, read to the end. A 200 with
// headers proves nothing — from some networks the body stalls after ~10 KB (DPI, IMPLEMENTATION M2 §3), so the
// timeout covers the body and such a source counts as unreachable, which is what offers a proxy.

export type ProbeResult =
  | { ok: true; models: DiscoveredModel[]; latencyMs: number }
  | { ok: false; reason: SourceFailure; status?: number; message: string };

const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

const causeCode = (error: unknown) => {
  const { cause } = error as { cause?: { code?: unknown } };
  return typeof cause?.code === "string" ? cause.code : undefined;
};

/** What went wrong, in terms the UI can explain. */
export const classifyFailure = (
  error: unknown
): { reason: SourceFailure; status?: number; message: string } => {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof DiscoveryError) {
    const { status } = error;
    if (status === 401 || status === 403) {
      return { message, reason: "auth", status };
    }
    if (status === 404) {
      return { message, reason: "not-found", status };
    }
    return { message, reason: "http", status };
  }
  const { name } = error as { name?: unknown };
  if (name === "TimeoutError" || name === "AbortError") {
    return { message, reason: "unreachable" };
  }
  const code = causeCode(error);
  // undici: `TypeError: fetch failed` with the socket error as the cause; a proxy that refuses — the same.
  if (
    (code && NETWORK_CODES.has(code)) ||
    (error instanceof TypeError && message === "fetch failed")
  ) {
    return { message: code ?? message, reason: "unreachable" };
  }
  // Not JSON, or JSON without the list we expect: something answers there, but not a model API.
  return { message, reason: "invalid" };
};

/** Asks the source for its models (and the Gateway for its key) over `fetch`. */
export const probeSource = async (
  spec: SourceSpec,
  apiKey: string | null,
  fetch: typeof globalThis.fetch,
  { timeoutMs = 15_000 }: { timeoutMs?: number } = {}
): Promise<ProbeResult> => {
  const started = performance.now();
  try {
    if (spec.kind === "gateway") {
      await checkGatewayKey(apiKey, fetch, timeoutMs);
    }
    const models = await fetchModelList(spec, apiKey, fetch, {
      enrich: false,
      timeoutMs,
    });
    return {
      latencyMs: Math.round(performance.now() - started),
      models,
      ok: true,
    };
  } catch (error) {
    return { ok: false, ...classifyFailure(error) };
  }
};
