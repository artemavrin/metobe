// S28: a base of the given size at the given step, to run anything against it.
// Usage: tsx stage.ts <live|year|stress> <0|1|2|3>   (0 — the current release, 1 — expand, 2 — + backfill, 3 — + contract)
import { buildFolder, runMigrations, URL } from "./lib";
import { seed } from "./seed";

const [profile = "live", step = "2"] = process.argv.slice(2);
await seed(profile);
await runMigrations(URL, await buildFolder(Number(step) as 0 | 1 | 2 | 3));
console.log(`${URL}: ${profile} at step ${step}`);
