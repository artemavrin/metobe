import "server-only";
import { createDb } from "@purr/db/client";

import { getEnv } from "./env";

let instance: ReturnType<typeof createDb> | undefined;

export const getDb = () => {
  instance ??= createDb(getEnv().DATABASE_URL);
  return instance;
};
