import { z } from "zod";

// Who may do what to whom among the install's people (D12, ARCH §17.1, §20.3): one `superuser` (made by the claim), any
// number of `admin`s (the service's settings) and `user`s; in the organization an `owner`, `admin`s and `member`s. The
// rules live here, pure, so the server and the screen read the same.

export const roles = ["superuser", "admin", "user"] as const;
export type Role = (typeof roles)[number];

/** What an invitation may make someone: never a superuser — there is one, and it comes from the claim. */
export const invitableRoles = ["admin", "user"] as const;
export type InvitableRole = (typeof invitableRoles)[number];

export const roleSchema = z.enum(roles);
export const invitableRoleSchema = z.enum(invitableRoles);

export const isRole = (value: unknown): value is Role =>
  typeof value === "string" && (roles as readonly string[]).includes(value);

/**
 * The role in the organization (D48, ARCH §20.3), beside the role in the install above: one `owner`, any number of
 * `admin`s and `member`s. In self-hosted it follows the install's role — the superuser owns the one organization, an
 * admin of the install is its admin (ORGS-PLAN §4) — so the rules below, which read both roles, decide as they did.
 */
export const orgRoles = ["owner", "admin", "member"] as const;
export type OrgRole = (typeof orgRoles)[number];

export const isOrgRole = (value: unknown): value is OrgRole =>
  typeof value === "string" && (orgRoles as readonly string[]).includes(value);

const orgRoleByRole: Record<Role, OrgRole> = {
  admin: "admin",
  superuser: "owner",
  user: "member",
};

/** The role in the organization that goes with a role in the install: what the migration and every new account get. */
export const orgRoleFor = (role: Role): OrgRole => orgRoleByRole[role];

/** Both roles of a person: the one in the install (`user.role`) and the one in the organization (`user.org_role`). */
export interface Roles {
  role: Role;
  orgRole: OrgRole;
}

/** Staff of the platform: the superuser and the install's admins (sources, models, mail, updates, the dump of the base). */
export const isPlatformRole = (role: unknown) =>
  role === "superuser" || role === "admin";

/** The owner and the admins of an organization (its settings, its people). */
export const isOrgManager = (orgRole: unknown) =>
  orgRole === "owner" || orgRole === "admin";

// The table of rights is ORGS-PLAN §4. Every rule below is one of its rows; `sameOrg` says whether the person acts in
// their own organization (always, until there is a second one). Outside it only the superuser acts — on people, never
// on an organization's owner or its settings.

/**
 * What the actor is in the organization acted on: its `owner`, an `admin`, or `none`. The superuser stands in for an
 * admin of every organization (turns people on and off there, invites and removes members), but owns only their own.
 */
const standing = (actor: Roles, sameOrg: boolean) => {
  if (sameOrg) {
    return actor.orgRole === "member" ? "none" : actor.orgRole;
  }
  return actor.role === "superuser" ? "admin" : "none";
};

/** The service itself: sources, models and their prices, proxies, mail, storage, updates, the dump of the base. */
export const canManagePlatform = (actor: Roles) => isPlatformRole(actor.role);

/** Making, turning off and on an organization, turning off a person for the platform; tariffs, rates, invoices, forecast. */
export const canManageOrganizations = (actor: Roles) =>
  actor.role === "superuser";

/** Seats by tariff, now and next month, and a person's tariff. */
export const canManageSeats = (actor: Roles, sameOrg: boolean) =>
  actor.role === "superuser" || (sameOrg && actor.orgRole === "owner");

/** The organization's settings (§9). The superuser has no more of them than an owner or an admin of that organization. */
export const canManageOrgSettings = (actor: Roles, sameOrg: boolean) =>
  sameOrg && isOrgManager(actor.orgRole);

/** The team's use in percent of the limits: who hit them. With money for the superuser; see `canSeeMoney`. */
export const canSeeTeamUsage = (actor: Roles, sameOrg: boolean) =>
  actor.role === "superuser" || canManageOrgSettings(actor, sameOrg);

/**
 * Cost of requests and prices of models: the platform's staff always, everyone else only while their organization has
 * no tariffs (self-hosted, §8) — with tariffs the platform pays for the models and people see percent of the limit.
 */
export const canSeeMoney = (actor: Roles, organizationHasTariffs: boolean) =>
  isPlatformRole(actor.role) || !organizationHasTariffs;

/** An invitation to this role: the owner makes admins and users, an admin only users. */
export const canInvite = (
  actor: Roles,
  role: InvitableRole,
  sameOrg: boolean
) => {
  const as = standing(actor, sameOrg);
  return as === "owner" || (as === "admin" && role === "user");
};

/** Naming admins and handing over ownership: the owner of that organization only, never their own role nor an owner's. */
export const canChangeRole = (actor: Roles, target: Roles, sameOrg: boolean) =>
  standing(actor, sameOrg) === "owner" &&
  target.orgRole !== "owner" &&
  target.role !== "superuser";

/**
 * Removing someone: the owner removes anyone but an owner, an admin only members, the superuser any organization's
 * people but its owner. Removing oneself is the account's own.
 */
export const canRemove = (actor: Roles, target: Roles, sameOrg: boolean) => {
  if (target.orgRole === "owner" || target.role === "superuser") {
    return false;
  }
  if (actor.role === "superuser") {
    return true;
  }
  const as = standing(actor, sameOrg);
  return as === "owner" || (as === "admin" && target.orgRole === "member");
};

/**
 * Turning someone's account off, and handing them a one-time sign-in link, follow the rule for removing them: an admin
 * must never get into the owner's account by a link of their own, and no one acts on an owner. (Never on oneself —
 * callers check that, as for removing.)
 */
export const canManageAccess = canRemove;

/** An invitation lives this long. */
export const INVITATION_TTL_DAYS = 7;

export const inviteFormSchema = z.object({
  email: z.email("email").transform((value) => value.trim().toLowerCase()),
  name: z.string().trim().min(1, "name").max(100),
  token: z.string().min(1),
});
