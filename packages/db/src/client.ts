import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as auth from "./schema/auth";
import { claimTokens } from "./schema/claim";
import { systemSettings } from "./schema/system";

// Every table is listed explicitly: drizzle's relational API and the Better Auth adapter need one schema object.
const schema = { ...auth, claimTokens, systemSettings };

export const createDb = (url: string) => {
  const sql = postgres(url, { max: 10 });
  return { db: drizzle(sql, { schema }), sql };
};

export type Db = ReturnType<typeof createDb>["db"];
