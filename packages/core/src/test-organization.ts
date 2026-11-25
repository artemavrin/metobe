import type { Db } from "@metobe/db/client";
import { organizations } from "@metobe/db/schema/organizations";
import { asc } from "drizzle-orm";

/**
 * What a test's or a dev check's account needs since every account is in an organization (D48): the install's one, as a
 * member. A test base nobody has claimed gets one made — never more than the first is read.
 */
export const testMember = async (db: Db) => {
  const [found] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .orderBy(asc(organizations.createdAt), asc(organizations.id))
    .limit(1);
  if (found) {
    return { orgRole: "member" as const, organizationId: found.id };
  }
  const [made] = await db
    .insert(organizations)
    .values({ name: "example.test" })
    .returning({ id: organizations.id });
  if (!made) {
    throw new Error("no organization for the test's accounts");
  }
  return { orgRole: "member" as const, organizationId: made.id };
};
