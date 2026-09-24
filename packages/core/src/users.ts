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
