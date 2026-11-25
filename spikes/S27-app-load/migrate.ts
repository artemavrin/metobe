import { runMigrations } from "../../packages/db/src/migrate.ts";

// Applies the product's migrations to the spike database only.
const url = process.env.DATABASE_URL;
if (!url?.endsWith("/spike_s27")) {
  throw new Error("DATABASE_URL must point at spike_s27");
}
await runMigrations(url);
console.log("migrated");
