import type { Db } from "@metobe/db/client";
import { organizations } from "@metobe/db/schema/organizations";
import { asc } from "drizzle-orm";

/**
 * The organization for a test's people (D48): the install's first, made when the test database has none — a fresh one
 * gets its organization from the claim, not from the migration. Work done for a person stops without one (ORGS-PLAN §6).
 */
export const testOrganizationId = async (db: Db) => {
  const [found] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .orderBy(asc(organizations.createdAt), asc(organizations.id))
    .limit(1);
  if (found) {
    return found.id;
  }
  const [made] = await db
    .insert(organizations)
    .values({ name: "test.example" })
    .returning({ id: organizations.id });
  if (!made) {
    throw new Error("the test organization was not made");
  }
  return made.id;
};
