// S28: the update of an installation of a given size to organizations — time, what waits on the locks, rollback.
// Usage: tsx measure.ts <live|year|stress>; prints JSON and writes results/<profile>.json.
import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  BUILD,
  buildFolder,
  connect,
  HERE,
  ms,
  runMigrations,
  statementsOf,
  STEPS,
  URL,
} from "./lib";
import { seed } from "./seed";

const exec = promisify(execFile);
const profile = process.argv[2] ?? "live";
const out: Record<string, unknown> = { profile };

/** What the running app (or an old `worker`) does all the time: a run written in the old shape, a session read. */
const probe = (kind: "write" | "read") => {
  const sql = connect();
  const lat: { at: number; ms: number }[] = [];
  const errors: string[] = [];
  let stop = false;
  const t0 = performance.now();
  const loop = (async () => {
    while (!stop) {
      const t = performance.now();
      try {
        // oxlint-disable-next-line no-await-in-loop -- one request at a time, like a client
        await (kind === "write"
          ? sql`insert into model_runs (user_id, status, purpose, input_tokens) values ('u2', 'ok', 'chat', 1)`
          : sql`select u.id, u.role from session s join "user" u on u.id = s.user_id where s.token = 'tok1'`);
      } catch (error) {
        errors.push((error as Error).message);
      }
      lat.push({ at: Math.round(t - t0), ms: ms(t) });
      // oxlint-disable-next-line no-await-in-loop -- a request every 2 ms
      await new Promise((r) => setTimeout(r, 2));
    }
  })();
  return {
    finish: async () => {
      stop = true;
      await loop;
      await sql.end();
      const sorted = lat.map((l) => l.ms).sort((a, b) => a - b);
      return {
        errors: [...new Set(errors)],
        errorCount: errors.length,
        max: sorted.at(-1) ?? 0,
        p50: sorted[Math.floor(sorted.length / 2)] ?? 0,
        requests: lat.length,
      };
    },
  };
};

const pgDump = async (file: string, schemaOnly = false) => {
  const t0 = performance.now();
  await exec("pg_dump", [
    schemaOnly ? "--schema-only" : "--format=custom",
    `--file=${file}`,
    `--dbname=${URL}`,
  ]);
  return { bytes: (await stat(file)).size, ms: ms(t0) };
};

/**
 * The updater's rollback (apps/worker/src/updater.ts restoreBase): drop the schemas, pg_restore the copy. As written
 * there it fails on PG 15+: the copy has no CREATE SCHEMA public (pg_dump leaves out the default public schema), so
 * it is tried as is first, then with `create schema public` added.
 */
const restore = async (file: string) => {
  const dropSchemas = async (recreatePublic: boolean) => {
    const sql = connect();
    await sql.unsafe("set client_min_messages = warning");
    await sql.unsafe("drop schema if exists drizzle cascade");
    await sql.unsafe("drop schema if exists public cascade");
    if (recreatePublic) {
      await sql.unsafe("create schema public");
    }
    await sql.end();
  };
  const pgRestore = () =>
    exec("pg_restore", [
      "--no-owner",
      "--exit-on-error",
      `--dbname=${URL}`,
      file,
    ]);
  let asInUpdater: string;
  try {
    await dropSchemas(false);
    await pgRestore();
    asInUpdater = "ok";
  } catch (error) {
    asInUpdater =
      String((error as { stderr?: string }).stderr ?? error).split("\n")[0] ??
      "failed";
  }
  const t0 = performance.now();
  await dropSchemas(true);
  await pgRestore();
  return { asInUpdater, withCreateSchemaMs: ms(t0) };
};

const checks = async () => {
  const sql = connect();
  try {
    const [r] = await sql`
      select
        (select count(*)::int from organizations) as orgs,
        (select count(*)::int from "user" where organization_id is null or org_role is null) as users_unset,
        (select count(*)::int from "user" where org_role = 'owner') as owners,
        (select string_agg(role || '→' || org_role || ':' || n, ', ' order by role)
           from (select role, org_role, count(*) n from "user" group by 1, 2) x) as roles,
        (select count(*)::int from model_runs where organization_id is null) as runs_unset,
        (select count(*)::int from catalog_items where organization_id is null) as catalog_unset,
        (select count(*)::int from skills where organization_id is null) as skills_unset,
        (select count(*)::int from invitations where organization_id is null or org_role is null) as inv_unset,
        (select settings::text from organizations limit 1) as settings,
        (select name from organizations limit 1) as name`;
    return r;
  } finally {
    await sql.end();
  }
};

/** Our statements in one transaction, as drizzle runs them, with the time of each and the locks held at the end. */
const perStatement = async () => {
  const sql = connect();
  const rows: { step: string; ms: number; sql: string }[] = [];
  let locks: unknown[] = [];
  try {
    await sql.begin(async (tx) => {
      for (const step of STEPS) {
        // oxlint-disable-next-line no-await-in-loop -- in order, like the migrator
        for (const stmt of await statementsOf(`${step.tag}.sql`)) {
          const t0 = performance.now();
          // oxlint-disable-next-line no-await-in-loop -- in order
          await tx.unsafe(stmt);
          rows.push({
            ms: ms(t0),
            sql: stmt
              .replaceAll(/\s+/gu, " ")
              .replace(/^(-- [^;]*?)(INSERT|UPDATE|ALTER|CREATE|DROP)/u, "$2")
              .slice(0, 110),
            step: step.tag.slice(5),
          });
        }
      }
      locks = await tx`
        select c.relname as table, string_agg(distinct l.mode, ', ') as modes
        from pg_locks l join pg_class c on c.oid = l.relation
        where l.pid = pg_backend_pid() and c.relkind in ('r', 'p')
        group by c.relname order by c.relname`;
      // Leave the base as it was: this run is only for the numbers.
      throw new Error("rollback");
    });
  } catch (error) {
    if ((error as Error).message !== "rollback") {
      throw error;
    }
  } finally {
    await sql.end();
  }
  const total = rows.reduce((a, r) => a + r.ms, 0);
  return {
    locks,
    slowest: [...rows].sort((a, b) => b.ms - a.ms).slice(0, 6),
    total: Math.round(total * 10) / 10,
  };
};

await mkdir(BUILD, { recursive: true });
await mkdir(path.join(HERE, "results"), { recursive: true });

// 1. The installation, at the schema of the current release.
out.seed = await seed(profile);
const dumpFile = path.join(BUILD, `${profile}.dump`);
const baseSchema = path.join(BUILD, `${profile}-schema-before.sql`);
// 2. The updater's «backup» step: pg_dump of the whole base before anything changes.
out.backup = await pgDump(dumpFile);
await pgDump(baseSchema, true);

// 3. Per statement, with the locks (rolled back).
out.perStatement = await perStatement();

// 4. The update itself: `metobe migrate` = runMigrations, all three steps pending, while «old code» keeps working.
const folder = await buildFolder(3);
const writer = probe("write");
const reader = probe("read");
await new Promise((r) => setTimeout(r, 200));
const t0 = performance.now();
await runMigrations(URL, folder);
const migrateMs = ms(t0);
await new Promise((r) => setTimeout(r, 300));
out.migrate = {
  ms: migrateMs,
  reader: await reader.finish(),
  writer: await writer.finish(),
};
out.checks = await checks();

// 5. Rerun: nothing pending, nothing changes.
const t1 = performance.now();
await runMigrations(URL, folder);
out.rerunMs = ms(t1);

// 6. Rollback by SQL: down_contract, down_expand, and drizzle's rows of the three steps.
{
  const sql = connect();
  const t2 = performance.now();
  await sql.begin(async (tx) => {
    await tx
      .unsafe(await readFile(path.join(HERE, "sql/down_contract.sql"), "utf8"))
      .simple();
    await tx
      .unsafe(await readFile(path.join(HERE, "sql/down_expand.sql"), "utf8"))
      .simple();
    await tx`delete from drizzle.__drizzle_migrations where created_at >= ${STEPS[0].when}`;
  });
  const downMs = ms(t2);
  await sql.end();
  const after = path.join(BUILD, `${profile}-schema-after-down.sql`);
  await pgDump(after, true);
  const strip = (s: string) =>
    s
      .split("\n")
      .filter((l) => !l.startsWith("--") && !l.startsWith("\\"))
      .join("\n");
  const same =
    strip(await readFile(baseSchema, "utf8")) ===
    strip(await readFile(after, "utf8"));
  out.downSql = { ms: downMs, schemaSameAsBefore: same };
  if (!same) {
    const { stdout } = await exec("diff", [baseSchema, after]).catch(
      (e: { stdout: string }) => e
    );
    out.downSql = { ...(out.downSql as object), diff: stdout.slice(0, 2000) };
  }
  // …and the update applies again after the down.
  const t3 = performance.now();
  await runMigrations(URL, folder);
  out.reapplyAfterDownMs = ms(t3);
}

// 7. Rollback the way the updater does it after a failed update: drop the schemas, pg_restore the copy.
out.restore = await restore(dumpFile);

console.log(JSON.stringify(out, null, 2));
await writeFile(
  path.join(
    HERE,
    "results",
    process.env.S28_SQL ? "variant-a" : "",
    `${profile}.json`
  ),
  `${JSON.stringify(out, null, 2)}\n`
);
