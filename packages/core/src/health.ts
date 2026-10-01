import "server-only";
import type { HealthResponse } from "@metobe/contracts/health";

import { getDb } from "./db";
import { checkStorage } from "./storage";

// Only what is installed counts: S3 is optional (D34), so «off» is healthy and «down» is not.
export const checkHealth = async (): Promise<HealthResponse> => {
  const [db, s3] = await Promise.all([
    getDb().sql`select 1`
      .then(() => "ok" as const)
      .catch(() => "down" as const),
    checkStorage(),
  ]);
  return {
    services: { db, s3 },
    status: db === "ok" && s3 !== "down" ? "ok" : "down",
  };
};
