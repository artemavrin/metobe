import "server-only";
import type {
  Capabilities,
  Pricing,
  ProxyMode,
  SourceFailure,
  SourceHealth,
  SourceInput,
  SourceKind,
  SourceOptions,
} from "@metobe/contracts/models";
import { models, sources } from "@metobe/db/schema/models";
import type { Source } from "@metobe/db/schema/models";
import { and, eq, inArray } from "drizzle-orm";

import { invalidateAi } from "./ai";
import { baseUrlOf } from "./ai-build";
import { getDb } from "./db";
import { syncModels } from "./discovery";
import { GATEWAY_MODELS_URL } from "./discovery-fetch";
import type { SourceSpec } from "./discovery-fetch";
import { addProxy, enabledProxies, fetchFor, fetchThrough } from "./net";
import { fetchWith, parseProxyUrl, proxyDispatcher } from "./net-transport";
import { removeSecrets, setSecret, withSecret } from "./secrets";
import { classifyFailure, probeSource } from "./sources-probe";
import type { ProbeResult } from "./sources-probe";

// Sources (ARCH §5.2, §7, §18.3): connected after a real check, a key replaced only by one that passes, a source
// removed together with its secrets. Every change drops the cached AI provider of that source.

const DEFAULT_TITLES: Record<
  Exclude<SourceKind, "openai-compatible">,
  string
> = {
  anthropic: "Anthropic",
  gateway: "Vercel AI Gateway",
  openai: "OpenAI",
  yandex: "Yandex AI Studio",
};

const titleFor = (input: SourceInput) => {
  if (input.title) {
    return input.title;
  }
  if (input.kind === "openai-compatible") {
    return new URL(input.baseUrl ?? "http://server").host;
  }
  return DEFAULT_TITLES[input.kind];
};

const specOf = (input: SourceInput): SourceSpec => ({
  baseUrl: input.baseUrl ?? null,
  kind: input.kind,
  options: input.options,
});

/** The URL routes are resolved for: the host that model requests go to. */
const routedUrl = (spec: SourceSpec) =>
  spec.kind === "gateway"
    ? GATEWAY_MODELS_URL
    : baseUrlOf(spec.kind, spec.baseUrl);

const healthOf = (result: ProbeResult): SourceHealth =>
  result.ok
    ? {
        checkedAt: new Date().toISOString(),
        latencyMs: result.latencyMs,
        state: "ok",
      }
    : {
        checkedAt: new Date().toISOString(),
        error: result.message.slice(0, 500),
        reason: result.reason,
        state: "error",
        status: result.status,
      };

interface Failure {
  reason: SourceFailure;
  httpStatus?: number;
}
const failureOf = (result: Extract<ProbeResult, { ok: false }>): Failure => ({
  httpStatus: result.status,
  reason: result.reason,
});

// Connecting ------------------------------------------------------------------------------------------------------

/** How to reach a source that did not answer directly: a saved proxy, or one typed right in the form. */
export type Via = { proxyId: string } | { proxyUrl: string };

export type ConnectResult =
  | { status: "connected"; sourceId: string }
  /** Directly unreachable, but works through this proxy: ask before using it. */
  | { status: "proxy-found"; proxy: { id: string; title: string } }
  /** Directly unreachable and no saved proxy helps: offer to type one. */
  | { status: "blocked" }
  | ({ status: "failed" } & Failure)
  /** The typed proxy is not an address, or the source does not answer through it either. */
  | { status: "proxy-failed"; reason: "invalid-url" | SourceFailure };

const save = async (
  input: SourceInput,
  route: { mode: ProxyMode; proxyId: string | null },
  health: SourceHealth
) => {
  const { db } = getDb();
  const [row] = await db
    .insert(sources)
    .values({
      baseUrl: input.baseUrl ?? null,
      health,
      kind: input.kind,
      options: input.options,
      proxyId: route.proxyId,
      proxyMode: route.mode,
      title: titleFor(input),
    })
    .returning({ id: sources.id });
  if (!row) {
    throw new Error("source was not saved");
  }
  if (input.apiKey) {
    try {
      await setSecret({ id: row.id, type: "source" }, "api_key", input.apiKey);
    } catch (error) {
      // No master key, no source: a source without its key would only fail later (ARCH §7.1).
      await db.delete(sources).where(eq(sources.id, row.id));
      throw error;
    }
  }
  return row.id;
};

/** Through a proxy typed in the form: checked before anything is saved, then saved as the first proxy. */
const connectViaUrl = async (
  input: SourceInput,
  proxyUrl: string
): Promise<ConnectResult> => {
  let config: ReturnType<typeof parseProxyUrl>;
  try {
    config = parseProxyUrl(proxyUrl);
  } catch {
    return { reason: "invalid-url", status: "proxy-failed" };
  }
  const dispatcher = proxyDispatcher(config);
  let result: ProbeResult;
  try {
    result = await probeSource(
      specOf(input),
      input.apiKey ?? null,
      fetchWith(dispatcher)
    );
  } finally {
    void dispatcher.close();
  }
  if (!result.ok) {
    return result.reason === "unreachable"
      ? { reason: "unreachable", status: "proxy-failed" }
      : { status: "failed", ...failureOf(result) };
  }
  const proxyId = await addProxy(config);
  const sourceId = await save(
    input,
    { mode: "proxy", proxyId },
    healthOf(result)
  );
  return { sourceId, status: "connected" };
};

/**
 * Adds a source after a real check (ARCH §18.3): directly first; if the source does not answer, the same check
 * through each enabled proxy, and the first that works is offered — nothing is saved until the admin agrees
 * (`via.proxyId`). Models arrive with `syncSource` right after.
 */
export const connectSource = async (
  input: SourceInput,
  via?: Via
): Promise<ConnectResult> => {
  const apiKey = input.apiKey ?? null;
  if (via && "proxyUrl" in via) {
    return connectViaUrl(input, via.proxyUrl);
  }
  if (via) {
    const result = await probeSource(
      specOf(input),
      apiKey,
      await fetchThrough(via.proxyId)
    );
    if (!result.ok) {
      return result.reason === "unreachable"
        ? { reason: "unreachable", status: "proxy-failed" }
        : { status: "failed", ...failureOf(result) };
    }
    const sourceId = await save(
      input,
      { mode: "proxy", proxyId: via.proxyId },
      healthOf(result)
    );
    return { sourceId, status: "connected" };
  }

  const direct = await probeSource(
    specOf(input),
    apiKey,
    await fetchThrough(null)
  );
  if (direct.ok) {
    const sourceId = await save(
      input,
      { mode: "auto", proxyId: null },
      healthOf(direct)
    );
    return { sourceId, status: "connected" };
  }
  if (direct.reason !== "unreachable") {
    return { status: "failed", ...failureOf(direct) };
  }
  const probeThrough = async (proxyId: string) =>
    probeSource(specOf(input), apiKey, await fetchThrough(proxyId));
  for (const proxy of await enabledProxies()) {
    // oxlint-disable-next-line no-await-in-loop -- one proxy at a time: the first that works is the answer
    const through = await probeThrough(proxy.id);
    if (through.ok) {
      return { proxy, status: "proxy-found" };
    }
  }
  return { status: "blocked" };
};

// Checking a saved source ------------------------------------------------------------------------------------------

const loadSource = async (id: string): Promise<Source> => {
  const { db } = getDb();
  const [source] = await db
    .select()
    .from(sources)
    .where(eq(sources.id, id))
    .limit(1);
  if (!source) {
    throw new Error(`source ${id} not found`);
  }
  return source;
};

/** A check of `spec` with `apiKey` over the source's own route. */
const probeSaved = async (
  source: Source,
  spec: SourceSpec,
  apiKey: string | null
) =>
  probeSource(
    spec,
    apiKey,
    await fetchFor(
      { mode: source.proxyMode, proxyId: source.proxyId },
      routedUrl(spec)
    )
  );

const writeHealth = async (id: string, health: SourceHealth) => {
  const { db } = getDb();
  await db.update(sources).set({ health }).where(eq(sources.id, id));
};

const storedKey = (id: string) =>
  withSecret({ id, type: "source" }, "api_key", (v) => v);

/** «Проверить»: the same real request with the stored key; the result is kept on the source. */
export const recheckSource = async (id: string): Promise<SourceHealth> => {
  const source = await loadSource(id);
  const health = healthOf(
    await probeSaved(source, source, await storedKey(id))
  );
  await writeHealth(id, health);
  return health;
};

export type ChangeResult = { ok: true } | ({ ok: false } & Failure);

/** The old key keeps working until the new one passes the check (prototype P7). */
export const replaceSourceKey = async (
  id: string,
  apiKey: string
): Promise<ChangeResult> => {
  const source = await loadSource(id);
  const result = await probeSaved(source, source, apiKey);
  if (!result.ok) {
    return { ok: false, ...failureOf(result) };
  }
  await setSecret({ id, type: "source" }, "api_key", apiKey);
  await writeHealth(id, healthOf(result));
  invalidateAi(id);
  return { ok: true };
};

/** A new address or Yandex folder is saved only if the source answers with it. */
export const updateSourceConfig = async (
  id: string,
  config: { baseUrl: string | null; options: SourceOptions }
): Promise<ChangeResult> => {
  const source = await loadSource(id);
  const spec = { ...config, kind: source.kind };
  const result = await probeSaved(source, spec, await storedKey(id));
  if (!result.ok) {
    return { ok: false, ...failureOf(result) };
  }
  const { db } = getDb();
  await db
    .update(sources)
    .set({ ...config, health: healthOf(result) })
    .where(eq(sources.id, id));
  invalidateAi(id);
  return { ok: true };
};

/** Route: «auto» (by proxy domains), «direct» or one proxy (ARCH §18.2). Checked right away over the new route. */
export const setSourceRoute = async (
  id: string,
  route: { mode: ProxyMode; proxyId: string | null }
): Promise<SourceHealth> => {
  const { db } = getDb();
  await db
    .update(sources)
    .set({
      proxyId: route.mode === "proxy" ? route.proxyId : null,
      proxyMode: route.mode,
    })
    .where(eq(sources.id, id));
  invalidateAi(id);
  return recheckSource(id);
};

/** Name, logo, on/off: nothing to check. */
export const updateSource = async (
  id: string,
  patch: { title?: string; logo?: string | null; enabled?: boolean }
) => {
  const { db } = getDb();
  await db.update(sources).set(patch).where(eq(sources.id, id));
  invalidateAi(id);
};

/** The source, its models (cascade) and its secrets (no FK — removed here, IMPLEMENTATION M2 §3). */
export const deleteSource = async (id: string) => {
  const { db } = getDb();
  await db.delete(sources).where(eq(sources.id, id));
  await removeSecrets({ id, type: "source" });
  invalidateAi(id);
};

// Models -----------------------------------------------------------------------------------------------------------

export type SyncResult =
  | ({ ok: true } & Awaited<ReturnType<typeof syncModels>>)
  | ({ ok: false } & Failure);

/** Pulls the model list; a failure is kept on the source like a failed check. */
export const syncSource = async (id: string): Promise<SyncResult> => {
  try {
    return { ok: true, ...(await syncModels(id)) };
  } catch (error) {
    const failure = classifyFailure(error);
    await writeHealth(id, {
      checkedAt: new Date().toISOString(),
      error: failure.message.slice(0, 500),
      reason: failure.reason,
      state: "error",
      status: failure.status,
    });
    return { httpStatus: failure.status, ok: false, reason: failure.reason };
  }
};

/** Turns models of one source on or off for chat. */
export const setModelsEnabled = async (
  sourceId: string,
  modelIds: string[],
  enabled: boolean
) => {
  if (!modelIds.length) {
    return;
  }
  const { db } = getDb();
  await db
    .update(models)
    .set({ enabled })
    .where(and(eq(models.sourceId, sourceId), inArray(models.id, modelIds)));
};

/**
 * Capabilities set by hand win over what the source or the seed says; sync keeps them (ARCH §7.3). `null` hands
 * the model back to the source — its own values return with the next sync.
 */
export const setModelCapabilities = async (
  sourceId: string,
  modelId: string,
  capabilities: Capabilities | null
) => {
  const { db } = getDb();
  await db
    .update(models)
    .set(
      capabilities
        ? { capabilities, capabilitiesSource: "manual" }
        : { capabilitiesSource: "discovered" }
    )
    .where(and(eq(models.sourceId, sourceId), eq(models.id, modelId)));
};

/** Prices typed by the admin, per any number of tokens and exactly as typed (`core/pricing`); `null` clears them. */
export const setModelPricing = async (
  sourceId: string,
  modelId: string,
  pricing: Pricing | null
) => {
  const { db } = getDb();
  await db
    .update(models)
    .set({
      priceCacheRead: pricing?.cacheRead ?? null,
      priceCacheWrite: pricing?.cacheWrite ?? null,
      priceCurrency: pricing?.currency ?? null,
      priceInput: pricing?.input ?? null,
      priceOutput: pricing?.output ?? null,
      priceUnitTokens: pricing?.unitTokens ?? null,
    })
    .where(and(eq(models.sourceId, sourceId), eq(models.id, modelId)));
};
