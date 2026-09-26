import "server-only";
import { user } from "@metobe/db/schema/auth";
import { asc, eq } from "drizzle-orm";

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
