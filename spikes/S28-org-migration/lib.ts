// S28: shared helpers — the spike's own database, migration folders built the way the repo ships them.
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDb } from "../../packages/db/src/client";
import {
  defaultMigrationsFolder,
  runMigrations,
} from "../../packages/db/src/migrate";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Our SQL: `sql` — the recommended variant; S28_SQL=sql/variant-a — the plain UPDATE backfill, for comparison. */
export const SQL_DIR = path.join(HERE, process.env.S28_SQL ?? "sql");
export const BUILD = path.join(HERE, ".build");

const PG = process.env.SPIKE_PG ?? "postgres://purr:purr@127.0.0.1:5432";
export const DB_NAME = "spike_s28";
export const URL = `${PG}/${DB_NAME}`;
const ADMIN_URL = `${PG}/postgres`;

export { runMigrations };

/** Our three migrations, in order; `when` must be newer than every migration of the base folder. */
export const STEPS = [
  { tag: "0070_orgs_expand", when: 1_795_000_000_000 },
  { tag: "0071_orgs_backfill", when: 1_795_000_000_001 },
  { tag: "0072_orgs_contract", when: 1_795_000_000_002 },
] as const;

export const connect = (url = URL) => createDb(url).sql;

/** Drops and creates `spike_s28` — never any other database. */
export const recreateDb = async () => {
  const sql = connect(ADMIN_URL);
  try {
    const [found] =
      await sql`select 1 from pg_database where datname = ${DB_NAME}`;
    if (found) {
      await sql.unsafe(`drop database ${DB_NAME} with (force)`);
    }
    await sql.unsafe(`create database ${DB_NAME}`);
  } finally {
    await sql.end();
  }
};

/**
 * A migrations folder as `metobe migrate` reads it (MIGRATIONS_DIR): the repo's migrations plus the first `upTo`
 * of ours, with their entries appended to meta/_journal.json.
 */
export const buildFolder = async (upTo: 0 | 1 | 2 | 3, noLock = false) => {
  const dir = path.join(BUILD, `migrations-${upTo}${noLock ? "-nolock" : ""}`);
  await rm(dir, { force: true, recursive: true });
  await mkdir(path.join(dir, "meta"), { recursive: true });
  for (const name of await readdir(defaultMigrationsFolder)) {
    if (name.endsWith(".sql")) {
      // oxlint-disable-next-line no-await-in-loop -- a few dozen small files, once
      await cp(path.join(defaultMigrationsFolder, name), path.join(dir, name));
    }
  }
  const journal = JSON.parse(
    await readFile(
      path.join(defaultMigrationsFolder, "meta/_journal.json"),
      "utf8"
    )
  ) as { entries: { idx: number; tag: string; when: number }[] };
  for (const step of STEPS.slice(0, upTo)) {
    // oxlint-disable-next-line no-await-in-loop -- three files
    const text = await readFile(path.join(SQL_DIR, `${step.tag}.sql`), "utf8");
    // oxlint-disable-next-line no-await-in-loop -- three files
    await writeFile(
      path.join(dir, `${step.tag}.sql`),
      // The variant without the LOCK TABLE statement: to reproduce the deadlock it prevents.
      noLock
        ? text.replace(/^LOCK TABLE [^\n]*\n--> statement-breakpoint\n/mu, "")
        : text
    );
    journal.entries.push({
      breakpoints: true,
      idx: journal.entries.length,
      tag: step.tag,
      version: "7",
      when: step.when,
    } as never);
  }
  await writeFile(
    path.join(dir, "meta/_journal.json"),
    JSON.stringify(journal, null, 2)
  );
  return dir;
};

/** The statements of one of our files, split the way drizzle splits them. */
export const statementsOf = async (file: string) =>
  (await readFile(path.join(SQL_DIR, file), "utf8"))
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.replaceAll(/^--.*$/gmu, "").trim().length > 0);

export const ms = (t0: number) =>
  Math.round((performance.now() - t0) * 10) / 10;
