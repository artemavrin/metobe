import "server-only";
import type { HealthResponse } from "@purr/contracts/health";

import { getDb } from "./db";

export const checkHealth = async (): Promise<HealthResponse> => {
  let db: HealthResponse["services"]["db"] = "ok";
  try {
    await getDb().sql`select 1`;
  } catch {
    db = "down";
  }
  return { services: { db }, status: db };
};
