import { z } from "zod";

// Who may do what to whom among the install's people (D12, ARCH §17.1): one `superuser` (made by the claim), any number
// of `admin`s (the service's settings) and `user`s. The rules live here, pure, so the server and the screen read the same.

export const roles = ["superuser", "admin", "user"] as const;
export type Role = (typeof roles)[number];

/** What an invitation may make someone: never a superuser — there is one, and it comes from the claim. */
export const invitableRoles = ["admin", "user"] as const;
export type InvitableRole = (typeof invitableRoles)[number];

export const roleSchema = z.enum(roles);
export const invitableRoleSchema = z.enum(invitableRoles);

export const isRole = (value: unknown): value is Role =>
  typeof value === "string" && (roles as readonly string[]).includes(value);

/** An invitation to this role: the owner makes admins and users, an admin only users. */
export const canInvite = (actor: Role, role: InvitableRole) =>
  actor === "superuser" || (actor === "admin" && role === "user");

/** Changing someone's role: the owner only, never their own and never another owner's. */
export const canChangeRole = (actor: Role, target: Role) =>
  actor === "superuser" && target !== "superuser";

/** Removing someone: the owner removes anyone but an owner, an admin only users. Removing oneself is the account's own. */
export const canRemove = (actor: Role, target: Role) =>
  target !== "superuser" &&
  (actor === "superuser" || (actor === "admin" && target === "user"));

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
