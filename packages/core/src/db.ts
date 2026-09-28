import "server-only";
import { createDb } from "@metobe/db/client";

import { getEnv } from "./env";

// One pool per process, on globalThis: the dev server holds several copies of this module (each route handler's
// bundle, every hot reload), and a pool per copy ran Postgres out of connections.
const KEY = Symbol.for("metobe.db");
const global = globalThis as { [KEY]?: ReturnType<typeof createDb> };

export const getDb = () => {
  global[KEY] ??= createDb(getEnv().DATABASE_URL);
  return global[KEY];
};
