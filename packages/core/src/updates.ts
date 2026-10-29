import "server-only";
import { z } from "zod";

import pkg from "../../../package.json";
import { fetchFor } from "./net";
import { mergePolicies, readPolicies } from "./policies";
import { compareVersions, parseNotes } from "./updates-notes";
import type { Release } from "./updates-notes";

// «О системе» (D35): the version this server runs and the releases newer than it, from GitHub. Checked at most every
// six hours — the admin's page and the settings menu read the last check, «Проверить сейчас» forces one. The last
// check lives in system_settings.policies.updates, so the app and the worker see the same.

const REPO = "artemavrin/metobe";
const EVERY_MS = 6 * 60 * 60 * 1000;

/** The version of this build: the repository's own, bumped by release-please. */
export const APP_VERSION: string = pkg.version;

export interface UpdateCheck {
  current: string;
  /** Releases newer than this one, newest first. */
  newer: Release[];
  checkedAt: string | null;
  /** The last check failed: why, in a few words. Old results stay. */
  error: string | null;
}

const releaseSchema = z.object({
  body: z.string().nullish(),
  draft: z.boolean(),
  html_url: z.string(),
  prerelease: z.boolean(),
  published_at: z.string().nullish(),
  tag_name: z.string(),
});

const storedSchema = z.object({
  checkedAt: z.string().nullable(),
  error: z.string().nullable(),
  releases: z.array(
    z.object({
      date: z.string(),
      features: z.array(z.string()),
      fixes: z.array(z.string()),
      url: z.string(),
      version: z.string(),
    })
  ),
});
type Stored = z.infer<typeof storedSchema>;

const readStored = async (): Promise<Stored> => {
  const { updates } = await readPolicies();
  const parsed = storedSchema.safeParse(updates);
  return parsed.success
    ? parsed.data
    : { checkedAt: null, error: null, releases: [] };
};

const viewOf = (s: Stored): UpdateCheck => ({
  checkedAt: s.checkedAt,
  current: APP_VERSION,
  error: s.error,
  newer: s.releases.filter((r) => compareVersions(r.version, APP_VERSION) > 0),
});

/** The published releases on GitHub, through the routes the admin set for the outgoing network. */
const fetchReleases = async (): Promise<Release[]> => {
  const url = `https://api.github.com/repos/${REPO}/releases?per_page=30`;
  const fetchIt = await fetchFor(null, url);
  const res = await fetchIt(url, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": `metobe/${APP_VERSION}`,
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`GitHub ${res.status}`);
  }
  const list = z.array(releaseSchema).parse(await res.json());
  return (
    list
      .filter((r) => !r.draft && !r.prerelease)
      .map((r) => ({
        ...parseNotes(r.body ?? ""),
        date: (r.published_at ?? "").slice(0, 10),
        url: r.html_url,
        version: r.tag_name.replace(/^v/u, ""),
      }))
      // oxlint-disable-next-line unicorn/no-array-sort -- a fresh array from map
      .sort((a, b) => compareVersions(b.version, a.version))
  );
};

/** Asks GitHub now and keeps the answer; a failure keeps the last releases and says why. */
export const checkForUpdates = async (): Promise<UpdateCheck> => {
  const before = await readStored();
  let stored: Stored;
  try {
    stored = {
      checkedAt: new Date().toISOString(),
      error: null,
      releases: await fetchReleases(),
    };
  } catch (error) {
    stored = {
      ...before,
      checkedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
  await mergePolicies({ updates: stored });
  return viewOf(stored);
};

/** The last check; a fresh one first when it is older than six hours. */
export const getUpdates = async (): Promise<UpdateCheck> => {
  const stored = await readStored();
  const age = stored.checkedAt
    ? Date.now() - Date.parse(stored.checkedAt)
    : Number.POSITIVE_INFINITY;
  return age > EVERY_MS ? checkForUpdates() : viewOf(stored);
};

/** The newest version past this one by the last check, never a request to GitHub: the admin's dots. */
export const availableUpdate = async () =>
  viewOf(await readStored()).newer[0]?.version ?? null;
