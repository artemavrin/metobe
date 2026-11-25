import "server-only";
import { isOrgRole, isRole, orgRoleFor } from "@metobe/contracts/members";
import type { OrgRole } from "@metobe/contracts/members";
import type { Db } from "@metobe/db/client";
import { user } from "@metobe/db/schema/auth";
import { organizations } from "@metobe/db/schema/organizations";
import type { Organization } from "@metobe/db/schema/organizations";
import { and, asc, eq } from "drizzle-orm";

import { getDb } from "./db";

// Organizations (D48, ARCH §20): there is always one. The claim makes it, an install that predates them got it from the
// migration (`0071_orgs_expand`). Until a second one can appear (O4–O6) everyone is in that one, and nothing outside
// this module needs to know which: the request context (O2) asks `getMembership`.

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** The person's organization and their role in it. */
export interface Membership {
  organization: Pick<Organization, "id" | "name" | "status" | "timeZone">;
  orgRole: OrgRole;
}

/** The install's organization — the first made. Null only in an install nobody has claimed yet. */
export const installOrganizationId = async (db: Db | Tx = getDb().db) => {
  const [row] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .orderBy(asc(organizations.createdAt), asc(organizations.id))
    .limit(1);
  return row?.id ?? null;
};

/**
 * Whom the person belongs to and as what; null when there is no such account. Between expand and contract (ARCH §20.4)
 * a row the previous release wrote has no role yet — it is read as the role its install role gives, the way contract
 * will fill it in; its organization comes from the column's default.
 */
export const getMembership = async (
  userId: string
): Promise<Membership | null> => {
  const [row] = await getDb()
    .db.select({
      id: organizations.id,
      name: organizations.name,
      orgRole: user.orgRole,
      role: user.role,
      status: organizations.status,
      timeZone: organizations.timeZone,
    })
    .from(user)
    .innerJoin(organizations, eq(organizations.id, user.organizationId))
    .where(eq(user.id, userId));
  if (!row) {
    return null;
  }
  const { orgRole, role, ...organization } = row;
  return {
    orgRole: isOrgRole(orgRole)
      ? orgRole
      : orgRoleFor(isRole(role) ? role : "user"),
    organization,
  };
};

/** The mail domain an organization is named by until its owner renames it (ORGS-PLAN §13). */
export const organizationNameFor = (email: string) =>
  email.split("@")[1]?.trim().toLowerCase() || "Organization";

/**
 * The organization the claim's superuser owns: the install's one when the migration already made it (people were there
 * before a superuser), otherwise a new one named by the superuser's mail domain. In the claim's transaction.
 */
export const claimOrganization = async (tx: Tx, email: string) => {
  const existing = await installOrganizationId(tx);
  if (existing) {
    // One owner per organization: whoever stood in for the missing superuser hands it over and stays its admin.
    await tx
      .update(user)
      .set({ orgRole: "admin" })
      .where(and(eq(user.organizationId, existing), eq(user.orgRole, "owner")));
    return existing;
  }
  const [made] = await tx
    .insert(organizations)
    .values({ name: organizationNameFor(email) })
    .returning({ id: organizations.id });
  if (!made) {
    throw new Error("the organization was not made");
  }
  return made.id;
};
