import "server-only";
import { systemSettings } from "@metobe/db/schema/system";
import { eq, sql } from "drizzle-orm";

import { getDb } from "./db";

// system_settings.policies: one jsonb row of the admin's settings, each part under its own key (mail, access, …).

export const readPolicies = async () => {
  const [row] = await getDb()
    .db.select({ policies: systemSettings.policies })
    .from(systemSettings)
    .where(eq(systemSettings.id, 1));
  return row?.policies ?? {};
};

/** Replaces the given keys in one statement; the other parts of the policies stay as they are. */
export const mergePolicies = (patch: Record<string, unknown>) =>
  getDb()
    .db.insert(systemSettings)
    .values({ id: 1, policies: patch })
    .onConflictDoUpdate({
      set: {
        policies: sql`${systemSettings.policies} || excluded.policies`,
        updatedAt: new Date(),
      },
      target: systemSettings.id,
    });
