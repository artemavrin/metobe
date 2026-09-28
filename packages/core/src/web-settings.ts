import "server-only";
import { systemSettings } from "@metobe/db/schema/system";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "./db";

// The web's settings (ARCH §8.1, /settings/search), in system_settings.policies: whether the model may search and
// read pages (`builtinTools`, on unless the admin turned it off), where SearXNG answers — the admin's address, else
// SEARXNG_URL from compose — and what the last check found. One backend in v1: `search_backends` comes with a second.

/** What the last check of SearXNG found. */
export type SearchCheck = { checkedAt: string } & (
  | { ok: true; ms: number; found: number }
  | { ok: false; reason: "unreachable" | "json-off" | "status"; detail: string }
);

const checkSchema = z.union([
  z.object({
    checkedAt: z.string(),
    found: z.number(),
    ms: z.number(),
    ok: z.literal(true),
  }),
  z.object({
    checkedAt: z.string(),
    detail: z.string(),
    ok: z.literal(false),
    reason: z.enum(["unreachable", "json-off", "status"]),
  }),
]);

interface WebPolicies {
  builtinTools?: Record<string, unknown> & {
    web_fetch?: boolean;
    web_search?: boolean;
  };
  searchCheck?: SearchCheck;
  searxngUrl?: string;
}

/** A value that fits its schema; anything else is as if it were not there. */
const valid = <T>(schema: z.ZodType<T>, value: unknown) => {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

/** The policies' web part, each value read on its own: one a hand edit broke does not take the others along. */
const webOf = (policies: Record<string, unknown>): WebPolicies => {
  const tools = valid(z.record(z.string(), z.unknown()), policies.builtinTools);
  return {
    builtinTools: {
      ...tools,
      web_fetch: valid(z.boolean(), tools?.web_fetch),
      web_search: valid(z.boolean(), tools?.web_search),
    },
    searchCheck: valid(checkSchema, policies.searchCheck),
    searxngUrl: valid(z.url(), policies.searxngUrl),
  };
};

export type WebTool = "web_search" | "web_fetch";

const trimmed = (url: string) => url.replace(/\/+$/u, "");

/** SEARXNG_URL: where compose runs it. */
export const defaultSearxng = () => {
  const url = z.url().optional().safeParse(process.env.SEARXNG_URL);
  return url.success && url.data ? trimmed(url.data) : null;
};

const readPolicies = async () => {
  const { db } = getDb();
  const [row] = await db
    .select({ policies: systemSettings.policies })
    .from(systemSettings)
    .where(eq(systemSettings.id, 1));
  return row?.policies ?? {};
};

/** Changes the policies' web part; the rest of them stays as it is. */
const patchPolicies = async (patch: (web: WebPolicies) => WebPolicies) => {
  const { db } = getDb();
  const all = await readPolicies();
  const next = { ...all, ...patch(webOf(all)) };
  await db
    .insert(systemSettings)
    .values({ id: 1, policies: next })
    .onConflictDoUpdate({
      set: { policies: next, updatedAt: new Date() },
      target: systemSettings.id,
    });
};

/** The web's settings as the admin sees them. */
export const getWebSettings = async () => {
  const web = webOf(await readPolicies());
  return {
    check: web.searchCheck ?? null,
    defaultUrl: defaultSearxng(),
    fetchOn: web.builtinTools?.web_fetch ?? true,
    searchOn: web.builtinTools?.web_search ?? true,
    /** The admin's own address; null — the default. */
    url: web.searxngUrl ? trimmed(web.searxngUrl) : null,
  };
};

/** Where SearXNG answers: the admin's address, else the default; null — nowhere to search. */
export const searxngUrl = async () => {
  const { url, defaultUrl } = await getWebSettings();
  return url ?? defaultUrl;
};

/** Which web tools the model gets: search needs a SearXNG, reading pages needs nothing. */
export const webToolsOn = async () => {
  const { url, defaultUrl, fetchOn, searchOn } = await getWebSettings();
  return { fetch: fetchOn, search: searchOn && Boolean(url ?? defaultUrl) };
};

export const setWebTool = (tool: WebTool, on: boolean) =>
  patchPolicies((web) => ({
    ...web,
    builtinTools: { ...web.builtinTools, [tool]: on },
  }));

/** The admin's SearXNG address; null goes back to the default. The last check was of the old one. */
export const setSearxngUrl = (url: string | null) =>
  patchPolicies((web) => ({
    ...web,
    searchCheck: undefined,
    searxngUrl: url ? trimmed(url) : undefined,
  }));

export const saveSearchCheck = (check: SearchCheck) =>
  patchPolicies((web) => ({ ...web, searchCheck: check }));
