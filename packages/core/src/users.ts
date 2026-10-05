import "server-only";
import {
  canChangeRole,
  canManageAccess,
  isRole,
} from "@metobe/contracts/members";
import type { InvitableRole, Role } from "@metobe/contracts/members";
import { session, user } from "@metobe/db/schema/auth";
import { and, asc, eq, lt, max, ne } from "drizzle-orm";

import { getDb } from "./db";

export const findUserByEmail = async (email: string) => {
  const [found] = await getDb()
    .db.select()
    .from(user)
    .where(eq(user.email, email.toLowerCase()))
    .limit(1);
  return found ?? null;
};

/** Names someone: what a person who signed in by a code for the first time says about themselves. */
export const setUserName = async (userId: string, name: string) => {
  await getDb().db.update(user).set({ name }).where(eq(user.id, userId));
};

export interface UserPrefs {
  locale: string | null;
  timeZone: string | null;
  weekStart: number | null;
  dateFormat: string | null;
}

/** Saves regional preferences (D31); null keeps a value «automatic». Callers validate. */
export const updateUserPrefs = async (userId: string, prefs: UserPrefs) => {
  await getDb().db.update(user).set(prefs).where(eq(user.id, userId));
};

/** Everyone in the install, by name — for picking who may use something (a catalog server's access). */
export const listUsers = () => {
  const { db } = getDb();
  return db
    .select({ email: user.email, id: user.id, name: user.name })
    .from(user)
    .orderBy(asc(user.name));
};

const UNVERIFIED_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Accounts whose mailbox was never checked, a day after they were made: someone took an unaddressed invitation with
 * an address that is not theirs and never got the code. Such an account never had a session, so nothing is lost.
 */
export const staleUnverified = () =>
  and(
    eq(user.emailVerified, false),
    lt(user.createdAt, new Date(Date.now() - UNVERIFIED_DAY_MS)),
    ne(user.role, "superuser")
  );

/** Everyone in the install for the users screen: role, when they joined and when a session of theirs last moved. */
export const listMembers = async () => {
  const { db } = getDb();
  await db.delete(user).where(staleUnverified());
  const rows = await db
    .select({
      createdAt: user.createdAt,
      disabledAt: user.disabledAt,
      email: user.email,
      emailVerified: user.emailVerified,
      id: user.id,
      lastSeenAt: max(session.updatedAt),
      name: user.name,
      role: user.role,
    })
    .from(user)
    .leftJoin(session, eq(session.userId, user.id))
    .groupBy(user.id)
    .orderBy(asc(user.name));
  return rows.map((r) => ({
    ...r,
    role: isRole(r.role) ? r.role : ("user" as Role),
  }));
};

export type Member = Awaited<ReturnType<typeof listMembers>>[number];

export const getMember = async (id: string) => {
  const all = await listMembers();
  return all.find((m) => m.id === id) ?? null;
};

/** Gives someone another role, when the actor may (the owner only, never to or from an owner). */
export const setMemberRole = async (
  actor: { id: string; role: Role },
  id: string,
  role: InvitableRole
) => {
  const target = await getMember(id);
  if (
    !target ||
    target.id === actor.id ||
    !canChangeRole(actor.role, target.role)
  ) {
    return false;
  }
  await getDb().db.update(user).set({ role }).where(eq(user.id, id));
  return true;
};

/**
 * Turns an account off or on, when the actor may (the rule for removing, never one's own). Turning it off ends the
 * sessions it has; while it is off no code goes to it and no sign-in makes a session.
 */
export const setMemberDisabled = async (
  actor: { id: string; role: Role },
  id: string,
  disabled: boolean
) => {
  const target = await getMember(id);
  if (
    !target ||
    target.id === actor.id ||
    !canManageAccess(actor.role, target.role)
  ) {
    return false;
  }
  const { db } = getDb();
  await db
    .update(user)
    .set({ disabledAt: disabled ? new Date() : null })
    .where(eq(user.id, id));
  if (disabled) {
    await db.delete(session).where(eq(session.userId, id));
  }
  return true;
};

/** Whether an account may have a session: it is not turned off. Someone who is not there is not turned off either. */
export const isSignInAllowed = async (userId: string) => {
  const [found] = await getDb()
    .db.select({ disabledAt: user.disabledAt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return !found?.disabledAt;
};
