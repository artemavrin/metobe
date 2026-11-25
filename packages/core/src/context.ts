import "server-only";
import { isOrgRole, isRole, orgRoleFor } from "@metobe/contracts/members";
import type { OrgRole, Role, Roles } from "@metobe/contracts/members";
import { user } from "@metobe/db/schema/auth";
import { organizations } from "@metobe/db/schema/organizations";
import { and, eq, exists, isNull, ne, sql } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "./db";

// The context of a request (D48, ARCH §20.2): who acts, in which organization, as what — read from the base every time,
// so turning an organization or a person off acts at once. Routes, server actions and pages ask the web's `getContext`;
// the worker and the Telegram bot ask `userCanAct` before they act for a person.

/** Why the person gets the «disabled» screen (pages) or a 403 `org-disabled` (API) instead of the app. */
export type Gate = "org-disabled" | "blocked";

export interface RequestContext {
  userId: string;
  orgId: string;
  orgName: string;
  /** Role in the install (`user.role`). */
  platformRole: Role;
  /** Role in the organization (`user.org_role`). */
  orgRole: OrgRole;
  orgStatus: "trial" | "active" | "disabled";
  orgDisabledReason: "unpaid" | "manual" | null;
  /** Set while the person's organization is off or the platform turned the person off; null — the app works. */
  gate: Gate | null;
}

/** Whoever acts in the core's functions that check rights: who, where, and both roles for the rules of `contracts/members`. */
export interface Actor extends Roles {
  id: string;
  orgId: string;
}

export const actorOf = (ctx: RequestContext): Actor => ({
  id: ctx.userId,
  orgId: ctx.orgId,
  orgRole: ctx.orgRole,
  role: ctx.platformRole,
});

/**
 * The gate for the organization's status and the person's `blocked_at`. The person's own `disabled_at` is no gate: it
 * ends their sessions and sign-in, so a request never gets here with it.
 */
export const gateFor = (input: {
  orgStatus: string;
  blockedAt: Date | null;
}): Gate | null => {
  if (input.orgStatus === "disabled") {
    return "org-disabled";
  }
  return input.blockedAt ? "blocked" : null;
};

/**
 * The context of a signed-in person, or null when there is no such account. Between expand and contract (ARCH §20.4) a
 * row the previous release wrote has no organization role yet — it reads as the one its install role gives.
 */
export const loadContext = async (
  userId: string
): Promise<RequestContext | null> => {
  const [row] = await getDb()
    .db.select({
      blockedAt: user.blockedAt,
      orgDisabledReason: organizations.disabledReason,
      orgId: organizations.id,
      orgName: organizations.name,
      orgRole: user.orgRole,
      orgStatus: organizations.status,
      platformRole: user.role,
    })
    .from(user)
    .innerJoin(organizations, eq(organizations.id, user.organizationId))
    .where(eq(user.id, userId));
  if (!row) {
    return null;
  }
  const platformRole: Role = isRole(row.platformRole)
    ? row.platformRole
    : "user";
  return {
    gate: gateFor(row),
    orgDisabledReason: row.orgDisabledReason,
    orgId: row.orgId,
    orgName: row.orgName,
    orgRole: isOrgRole(row.orgRole) ? row.orgRole : orgRoleFor(platformRole),
    orgStatus: row.orgStatus,
    platformRole,
    userId,
  };
};

const actor = alias(user, "ctx_user");
const actorOrg = alias(organizations, "ctx_org");

const canActWhere = and(
  isNull(actor.disabledAt),
  isNull(actor.blockedAt),
  ne(actorOrg.status, "disabled")
);

/** SQL: the person (this `user.id` column) can act — see `userCanAct`; for the worker's queries over many people. */
export const userCanActSql = (userId: AnyColumn) =>
  exists(
    getDb()
      .db.select({ one: sql`1` })
      .from(actor)
      .innerJoin(actorOrg, eq(actorOrg.id, actor.organizationId))
      .where(and(eq(actor.id, userId), canActWhere))
  );

/**
 * Whether work done for the person may go on: they exist, are not turned off by their organization (`disabled_at`) or
 * the platform (`blocked_at`), and their organization is not off. Chats, tasks, memory and notices stop otherwise;
 * the data stays (ORGS-PLAN §6).
 */
export const userCanAct = async (userId: string) => {
  const [row] = await getDb()
    .db.select({ one: sql`1` })
    .from(actor)
    .innerJoin(actorOrg, eq(actorOrg.id, actor.organizationId))
    .where(and(eq(actor.id, userId), canActWhere));
  return Boolean(row);
};
