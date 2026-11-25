import "server-only";
import { organizations } from "@metobe/db/schema/organizations";
import { eq, sql } from "drizzle-orm";

import { getDb } from "./db";

// organizations.settings (ARCH §20.6): one jsonb value of an organization's settings, each part under its own key
// (access, privacy, …) — the same shape as system_settings.policies, which keeps the platform's parts.

export const readOrgSettings = async (
  orgId: string
): Promise<Record<string, unknown>> => {
  const [row] = await getDb()
    .db.select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  return row?.settings ?? {};
};

/** Replaces the given keys in one statement; the other parts of the organization's settings stay as they are. */
export const mergeOrgSettings = async (
  orgId: string,
  patch: Record<string, unknown>
) => {
  await getDb()
    .db.update(organizations)
    .set({
      settings: sql`${organizations.settings} || ${JSON.stringify(patch)}::jsonb`,
    })
    .where(eq(organizations.id, orgId));
};
