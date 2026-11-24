// S28: how often the update deadlocks against a concurrent writer of model_runs, with and without LOCK TABLE first.
// Usage: tsx deadlock.ts [runs=10]
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { BUILD, buildFolder, connect, runMigrations, URL } from "./lib";
import { seed } from "./seed";

const exec = promisify(execFile);
const runs = Number(process.argv[2] ?? 10);

await seed("live");
const dump = path.join(BUILD, "deadlock-live.dump");
await exec("pg_dump", ["--format=custom", `--file=${dump}`, `--dbname=${URL}`]);

const restore = async () => {
  const sql = connect();
  await sql.unsafe("set client_min_messages = warning");
  await sql.unsafe("drop schema if exists drizzle cascade");
  await sql.unsafe("drop schema if exists public cascade");
  // Not in the updater's restoreBase, and pg_restore fails without it (see README).
  await sql.unsafe("create schema public");
  await sql.end();
  await exec("pg_restore", [
    "--no-owner",
    "--exit-on-error",
    `--dbname=${URL}`,
    dump,
  ]);
};

/** Several «old worker» connections writing runs (FK to "user") as fast as they can. */
const writers = (n: number, seen: { deadlocks: number }) => {
  let stop = false;
  const conns = Array.from({ length: n }, () => connect());
  const loops = conns.map(async (sql) => {
    while (!stop) {
      // oxlint-disable-next-line no-await-in-loop -- a busy writer
      await sql`insert into model_runs (user_id, status, purpose) values ('u2', 'ok', 'chat')`.catch(
        (error: { code?: string }) => {
          if (error.code === "40P01") {
            seen.deadlocks++;
          }
        }
      );
    }
  });
  return async () => {
    stop = true;
    await Promise.all(loops);
    await Promise.all(conns.map((c) => c.end()));
  };
};

const result: Record<
  string,
  {
    ok: number;
    deadlock: number;
    writerDeadlocks: number;
    maxMs: number;
    other: string[];
  }
> = {};
for (const noLock of [true, false]) {
  const key = noLock ? "without LOCK TABLE" : "with LOCK TABLE";
  result[key] = { deadlock: 0, maxMs: 0, ok: 0, other: [], writerDeadlocks: 0 };
  const folder = await buildFolder(3, noLock);
  for (let i = 0; i < runs; i++) {
    // oxlint-disable-next-line no-await-in-loop -- one run at a time
    await restore();
    const seen = { deadlocks: 0 };
    const stop = writers(3, seen);
    // oxlint-disable-next-line no-await-in-loop -- let the writers start
    await new Promise((r) => setTimeout(r, 100));
    const t0 = performance.now();
    try {
      // oxlint-disable-next-line no-await-in-loop -- one run at a time
      await runMigrations(URL, folder);
      result[key].ok++;
    } catch (error) {
      const code = (error as { cause?: { code?: string } }).cause?.code;
      if (code === "40P01") {
        result[key].deadlock++;
      } else {
        result[key].other.push(String((error as Error).message).slice(0, 120));
      }
    }
    result[key].maxMs = Math.max(
      result[key].maxMs,
      Math.round(performance.now() - t0)
    );
    // oxlint-disable-next-line no-await-in-loop -- one run at a time
    await stop();
    result[key].writerDeadlocks += seen.deadlocks;
  }
}
console.log(JSON.stringify(result, null, 2));
