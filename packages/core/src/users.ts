import "server-only";
import { user } from "@metobe/db/schema/auth";
import { eq } from "drizzle-orm";

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
