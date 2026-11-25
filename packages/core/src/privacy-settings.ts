import "server-only";
import { readFile } from "node:fs/promises";

import { z } from "zod";

import { getEnv } from "./env";
import { mergeOrgSettings, readOrgSettings } from "./org-settings";
import { installOrganizationId } from "./organizations";
import { mergePolicies, readPolicies } from "./policies";

// Data protection's settings (PII-GUARD-PLAN З6, P31 «Настройки», ARCH §20.6): whether it masks, where (chat, tasks,
// Telegram, memory, service calls), what to do with each type of data, whether local models are masked too, how long
// «what the model saw» is kept — the organization's, in `organizations.settings.privacy` — and the service's address
// (the admin's, else PII_GUARD_URL from compose) with whether the updater has it up — the platform's, in
// `system_settings.policies.privacy`. Each value is read on its own: one a hand edit broke does not take the others along.

export const PRIVACY_PLACES = [
  "chat",
  "tasks",
  "telegram",
  "memory",
  "service",
] as const;
export type PrivacyPlace = (typeof PRIVACY_PLACES)[number];

/** The types a person can decide on; organisations always stay (the guard's own policy). */
export const PRIVACY_TYPES = [
  "PERSON",
  "EMAIL",
  "PHONE",
  "ID_DOCUMENT",
  "ADDRESS",
  "BANK_ACCOUNT",
  "DATE_OF_BIRTH",
] as const;
export type PrivacyType = (typeof PRIVACY_TYPES)[number];

/** hide — a label in its place; keep — the value goes as it is; block — the request does not go at all. */
export const PRIVACY_ACTIONS = ["hide", "keep", "block"] as const;
export type PrivacyAction = (typeof PRIVACY_ACTIONS)[number];

/** How long «what the model saw» is kept: as long as the chat, a number of days, or not at all. */
export const PRIVACY_RETENTION = ["chat", "30", "7", "none"] as const;
export type PrivacyRetention = (typeof PRIVACY_RETENTION)[number];

/** What the organization decides. */
export interface PrivacyRules {
  on: boolean;
  places: Record<PrivacyPlace, boolean>;
  types: Record<PrivacyType, PrivacyAction>;
  /** Mask for models on this server too (their data does not leave it). */
  local: boolean;
  keepFor: PrivacyRetention;
}

/** What the platform decides: where the service is. */
export interface GuardService {
  /** The admin's address of the service; null — PII_GUARD_URL. */
  url: string | null;
  /** The service in this install's compose is up: the updater started it for the switch. */
  bundled: boolean;
}

export type PrivacySettings = PrivacyRules & GuardService;

/** Where the app finds the service compose bundles (`pii-guard`, profile `pii`). */
export const BUNDLED_GUARD_URL = "http://pii-guard:8787";

const valid = <T>(schema: z.ZodType<T>, value: unknown) => {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

const trimmed = (url: string) => url.replace(/\/+$/u, "");

const rulesOf = (settings: Record<string, unknown>): PrivacyRules => {
  const raw = valid(z.record(z.string(), z.unknown()), settings.privacy) ?? {};
  const places = valid(z.record(z.string(), z.unknown()), raw.places) ?? {};
  const types = valid(z.record(z.string(), z.unknown()), raw.types) ?? {};
  return {
    keepFor: valid(z.enum(PRIVACY_RETENTION), raw.keepFor) ?? "chat",
    local: valid(z.boolean(), raw.local) ?? false,
    on: valid(z.boolean(), raw.on) ?? true,
    places: Object.fromEntries(
      PRIVACY_PLACES.map((p) => [p, valid(z.boolean(), places[p]) ?? true])
    ) as Record<PrivacyPlace, boolean>,
    types: Object.fromEntries(
      PRIVACY_TYPES.map((t) => [
        t,
        valid(z.enum(PRIVACY_ACTIONS), types[t]) ?? "hide",
      ])
    ) as Record<PrivacyType, PrivacyAction>,
  };
};

const serviceOf = (policies: Record<string, unknown>): GuardService => {
  const raw = valid(z.record(z.string(), z.unknown()), policies.privacy) ?? {};
  const url = valid(z.url(), raw.url);
  return {
    bundled: valid(z.boolean(), raw.bundled) ?? false,
    url: url ? trimmed(url) : null,
  };
};

/** Every value on its own, a default for anything missing or broken. */
export const privacyOf = (
  settings: Record<string, unknown>,
  policies: Record<string, unknown>
): PrivacySettings => ({ ...rulesOf(settings), ...serviceOf(policies) });

const readAll = async (orgId: string) => {
  const [settings, policies] = await Promise.all([
    readOrgSettings(orgId),
    readPolicies(),
  ]);
  return privacyOf(settings, policies);
};

// Read on every model call: a short cache keeps that one query, and a change shows within seconds.
const CACHE_MS = 5000;
const cached = new Map<string, { at: number; value: PrivacySettings }>();

/** Straight from the base: the settings page, which must see what the updater wrote a moment ago. */
export const readPrivacySettings = async (orgId: string) => {
  const value = await readAll(orgId);
  cached.set(orgId, { at: Date.now(), value });
  return value;
};

export const getPrivacySettings = (orgId: string): Promise<PrivacySettings> => {
  const hit = cached.get(orgId);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return Promise.resolve(hit.value);
  }
  return readPrivacySettings(orgId);
};

/**
 * The settings of the install's organization, for a model call that does not know whose it is: until one carries its
 * organization (O4) there is only the one. An install nobody has claimed reads the defaults.
 */
export const getInstallPrivacySettings = async () => {
  const orgId = await installOrganizationId();
  return orgId
    ? getPrivacySettings(orgId)
    : privacyOf({}, await readPolicies());
};

/** Changes the organization's privacy part; the rest of its settings stays as it is. */
export const setPrivacySettings = async (
  orgId: string,
  patch: (current: PrivacyRules) => PrivacyRules
) => {
  const current = rulesOf(await readOrgSettings(orgId));
  await mergeOrgSettings(orgId, { privacy: patch(current) });
  cached.delete(orgId);
};

/** Changes the platform's part — the service's address; the rest of the policies stays as it is. */
export const setGuardService = async (
  patch: (current: GuardService) => GuardService
) => {
  const policies = await readPolicies();
  const { bundled, url } = patch(serviceOf(policies));
  await mergePolicies({
    privacy: {
      ...valid(z.record(z.string(), z.unknown()), policies.privacy),
      bundled,
      url,
    },
  });
  cached.clear();
};

/**
 * Where the service answers: the admin's address, else PII_GUARD_URL, else the bundled service once the updater has
 * it up; null — not set up.
 */
export const guardUrl = (settings: PrivacySettings) =>
  settings.url ??
  getEnv().PII_GUARD_URL ??
  (settings.bundled ? BUNDLED_GUARD_URL : null);

/**
 * The install's own service is the one meant: no address yet, or the bundled one. The switch then has the updater
 * start and stop it; an address of another server is left to its admin.
 */
export const usesBundledGuard = (settings: PrivacySettings) => {
  const url = settings.url ?? getEnv().PII_GUARD_URL ?? null;
  return url === null || trimmed(url) === BUNDLED_GUARD_URL;
};

/** What the bundled service takes once its model is loaded, with room to spare: less free memory gets a warning. */
export const GUARD_MEMORY = 2 * 1024 ** 3;

/** The host's memory free for a new service, bytes (MemAvailable); null where there is no /proc (a Mac in dev). */
export const availableMemory = async () => {
  try {
    const found = /^MemAvailable:\s+(?<kb>\d+) kB$/mu.exec(
      await readFile("/proc/meminfo", "utf-8")
    );
    return found?.groups?.kb ? Number(found.groups.kb) * 1024 : null;
  } catch {
    return null;
  }
};

/** What the last look at the service found. */
export type GuardCheck =
  | { ok: true; ms: number; ready: boolean }
  | { ok: false; reason: "unset" | "unreachable" | "status" };

/** Asks the service whether it answers and has its model loaded (`/healthz`). */
export const checkGuard = async (
  url: string | null,
  fetchFn: typeof globalThis.fetch = globalThis.fetch
): Promise<GuardCheck> => {
  if (!url) {
    return { ok: false, reason: "unset" };
  }
  const started = Date.now();
  try {
    const response = await fetchFn(`${trimmed(url)}/healthz`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      return { ok: false, reason: "status" };
    }
    const body = (await response.json()) as { ner?: unknown };
    return { ms: Date.now() - started, ok: true, ready: body.ner === "ready" };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
};

/** The types to leave as they are and the types that stop a request, for the guard. */
export const policyFor = (settings: PrivacySettings) => ({
  block: PRIVACY_TYPES.filter((t) => settings.types[t] === "block"),
  keep: PRIVACY_TYPES.filter((t) => settings.types[t] === "keep"),
});
