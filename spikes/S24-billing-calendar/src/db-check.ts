// Idempotent commit in Postgres: claim the action's key and write its effect in ONE transaction, under the organization's lock.
// Runs in its own database `spike_s24`; creates it on the maintenance database `postgres`, never touches `purr` or `metobe`.
import postgres from "postgres";

const base = "postgres://purr:purr@127.0.0.1:5432";
const admin = postgres(`${base}/postgres`, { max: 1 });
const exists =
  await admin`select 1 from pg_database where datname = 'spike_s24'`;
if (exists.length === 0) {
  await admin.unsafe("create database spike_s24");
}
await admin.end();

const sql = postgres(`${base}/spike_s24`, { max: 10, onnotice: () => {} });
await sql`drop table if exists billing_actions, invoices, orgs`;
await sql`create table orgs (id text primary key, status text not null default 'active')`;
await sql`create table billing_actions (key text primary key, org_id text not null, at timestamptz not null default now())`;
await sql`create table invoices (id serial primary key, org_id text not null, period text not null, unique (org_id, period))`;
await sql`insert into orgs (id) values ('o1'), ('o2')`;

type Tx = postgres.TransactionSql;

/** The executor's commit: lock → claim → effect, one transaction. */
const commit = (
  orgId: string,
  key: string,
  effect: (tx: Tx) => Promise<void>
) =>
  sql.begin(async (tx) => {
    await tx`select id from orgs where id = ${orgId} for update`;
    const claimed =
      await tx`insert into billing_actions (key, org_id) values (${key}, ${orgId}) on conflict (key) do nothing returning key`;
    if (claimed.length === 0) {
      return "duplicate" as const;
    }
    await effect(tx);
    return "applied" as const;
  });

const issue = (period: string) => async (tx: Tx) => {
  await tx`insert into invoices (org_id, period) values ('o1', ${period})`;
};

const results: Record<string, unknown> = {};

// A. 50 concurrent runs of the same action: one applies.
let t0 = performance.now();
const a = await Promise.all(
  Array.from({ length: 50 }, () =>
    commit("o1", "invoice:o1:2026-12", issue("2026-12"))
  )
);
results.A = {
  applied: a.filter((x) => x === "applied").length,
  duplicate: a.filter((x) => x === "duplicate").length,
  invoices: (
    await sql`select count(*)::int as n from invoices where period = '2026-12'`
  )[0]!.n,
  ms: Math.round(performance.now() - t0),
};

// B. Second defense: keys lost (table emptied), the unique (org, period) still stops a second invoice.
await sql`delete from billing_actions`;
const b = await Promise.allSettled(
  Array.from({ length: 20 }, () =>
    commit("o1", "invoice:o1:2026-12", issue("2026-12"))
  )
);
results.B = {
  rejectedByUnique: b.filter((x) => x.status === "rejected").length,
  applied: b.filter((x) => x.status === "fulfilled" && x.value === "applied")
    .length,
  invoices: (
    await sql`select count(*)::int as n from invoices where period = '2026-12'`
  )[0]!.n,
};

// C. Crash between the claim and the effect: the claim rolls back with the effect, the next run does the job.
await sql`delete from billing_actions`;
await sql`delete from invoices`;
const crashed = await commit("o1", "invoice:o1:2027-01", async () => {
  throw new Error("worker killed");
}).catch((e: Error) => e.message);
const keyLeft = (
  await sql`select count(*)::int as n from billing_actions where key = 'invoice:o1:2027-01'`
)[0]!.n;
const retry = await commit("o1", "invoice:o1:2027-01", issue("2027-01"));
results.C = { crashed, keyLeftAfterCrash: keyLeft, retry };

// D. 1000 actions for 200 organizations' keys, 10 connections: cost of the claim.
await sql`insert into orgs select 'x' || g from generate_series(1, 200) g`;
t0 = performance.now();
await Promise.all(
  Array.from({ length: 1000 }, (_, i) =>
    commit(`x${(i % 200) + 1}`, `notify:x${(i % 200) + 1}:${i}`, async () => {})
  )
);
const ms = performance.now() - t0;
results.D = {
  actions: 1000,
  ms: Math.round(ms),
  perActionMs: +(ms / 1000).toFixed(2),
};

console.log(JSON.stringify(results, null, 2));
await sql.end();
