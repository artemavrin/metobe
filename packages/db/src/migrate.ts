import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Arbitrary constant shared by every process that migrates this database.
const MIGRATION_LOCK_KEY = 7_272_701;

export const defaultMigrationsFolder = fileURLToPath(
  new URL("../migrations", import.meta.url)
);

// Applies pending migrations under a Postgres advisory lock so concurrent starts never race.
export const runMigrations = async (
  url: string,
  migrationsFolder = defaultMigrationsFolder
) => {
  const sql = postgres(url, {
    max: 2,
    // "already exists, skipping" notices on every run are noise; surface only warnings and above.
    onnotice: (notice) => {
      if (notice.severity !== "NOTICE") {
        console.warn(notice.message);
      }
    },
  });
  const lock = await sql.reserve();
  try {
    await lock`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`;
    await migrate(drizzle(sql), { migrationsFolder });
  } finally {
    await lock`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`;
    lock.release();
    await sql.end();
  }
};
