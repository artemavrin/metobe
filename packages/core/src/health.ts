import "server-only";
import type { HealthResponse } from "@metobe/contracts/health";

import { getDb } from "./db";
import { sandboxConfigured, sandboxReady } from "./sandbox";
import { checkStorage } from "./storage";
import { APP_VERSION } from "./version";

// Only what is installed counts: S3 is optional (D34), so «off» is healthy and «down» is not.
export const checkHealth = async (): Promise<HealthResponse> => {
  const [db, s3, sandbox] = await Promise.all([
    getDb().sql`select 1`
      .then(() => "ok" as const)
      .catch(() => "down" as const),
    checkStorage(),
    sandboxConfigured()
      ? sandboxReady().then((ready) =>
          ready ? ("ok" as const) : ("down" as const)
        )
      : Promise.resolve("off" as const),
  ]);
  return {
    // A sandbox not ready is said, not a failure: the chat goes on without the code tools.
    services: { db, s3, sandbox },
    status: db === "ok" && s3 !== "down" ? "ok" : "down",
    version: APP_VERSION,
  };
};
