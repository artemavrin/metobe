import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { systemSettings } from "./schema/system";

// Every table is listed explicitly: drizzle's relational API needs one schema object.
const schema = { systemSettings };

export const createDb = (url: string) => {
  const sql = postgres(url, { max: 10 });
  return { db: drizzle(sql, { schema }), sql };
};

export type Db = ReturnType<typeof createDb>["db"];
