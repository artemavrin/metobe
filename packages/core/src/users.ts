import "server-only";
import { canChangeRole, isRole } from "@metobe/contracts/members";
import type { InvitableRole, Role } from "@metobe/contracts/members";
import { session, user } from "@metobe/db/schema/auth";
import { asc, eq, max } from "drizzle-orm";

import { getDb } from "./db";

export const findUserByEmail = async (email: string) => {
  const [found] = await getDb()
    .db.select()
    .from(user)
    .where(eq(user.email, email.toLowerCase()))
    .limit(1);
  return found ?? null;
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

/** Everyone in the install for the users screen: role, when they joined and when a session of theirs last moved. */
export const listMembers = async () => {
  const { db } = getDb();
  const rows = await db
    .select({
      createdAt: user.createdAt,
      email: user.email,
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
