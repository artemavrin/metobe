// Part 1c of S22: the alternative to the sum — one counter row per person, updated in the writer's transaction.
// First version had a row per (person, kind) and `update … where kind in (...)`: two writers of one person deadlocked
// (40P01). One row with two columns, or fixed update order, removes it.
import { writeFileSync } from "node:fs";

import { ANCHOR, ms, sql, stats, weekStart } from "./common.ts";

const wk = weekStart(ANCHOR);
const out: Record<string, unknown> = {};
await sql`drop table if exists limit_usage`;
await sql`
  create table limit_usage (
    user_id text primary key,
    five_start timestamptz not null,
    five_used numeric not null default 0,
    week_start timestamptz not null,
    week_used numeric not null default 0
  )`;
await sql`
  insert into limit_usage
  select w.user_id, w.started_at,
         (select coalesce(sum(charge), 0) from runs r where r.user_id = w.user_id and r.created_at >= w.started_at),
         ${wk}::timestamptz,
         (select coalesce(sum(charge), 0) from runs r where r.user_id = w.user_id and r.created_at >= ${wk})
  from limit_windows w where w.user_id like 'h_%'`;

const read = async (u: string) => {
  await sql`select five_start, five_used, week_start, week_used from limit_usage where user_id = ${u}`;
};
const xs: number[] = [];
for (let i = 0; i < 1500; i++) {
  const t0 = process.hrtime.bigint();
  await read(["h_burst", "h_hot", "h_spread"][i % 3]!);
  xs.push(ms(t0));
}
out["counter read by pk (busy people)"] = stats(xs);

/** A writer: the run row and the counter in one transaction; a window that moved restarts the counter. */
const writeOne = async (u: string, withCounter: boolean, n: number) => {
  const at = new Date(ANCHOR.getTime() + n);
  const t0 = process.hrtime.bigint();
  if (!withCounter) {
    await sql`insert into runs (user_id, organization_id, status, charge, charge_u, created_at) values (${u}, 'bench', 'ok', 0.5, 500000, ${at})`;
  } else {
    await sql.begin(async (tx) => {
      await tx`insert into runs (user_id, organization_id, status, charge, charge_u, created_at) values (${u}, 'bench', 'ok', 0.5, 500000, ${at})`;
      await tx`update limit_usage set five_used = five_used + 0.5, week_used = week_used + 0.5 where user_id = ${u}`;
    });
  }
  return ms(t0);
};
const run = async (
  workers: number,
  withCounter: boolean,
  n: number,
  user = "h_burst"
) => {
  const xs: number[] = [];
  const t0 = process.hrtime.bigint();
  await Promise.all(
    Array.from({ length: workers }, async (_, w) => {
      for (let i = 0; i < n; i++)
        xs.push(await writeOne(user, withCounter, w * 100000 + i));
    })
  );
  return { ...stats(xs), wallMs: Math.round(ms(t0)) };
};
await run(1, false, 200);
out["write: insert only, 1 client, 2000"] = await run(1, false, 2000);
out["write: insert + counter row in a tx, 1 client, 2000"] = await run(
  1,
  true,
  2000
);
out["write: insert only, 2 clients on one person, 2x1000"] = await run(
  2,
  false,
  1000
);
out["write: insert + counter, 2 clients on one person, 2x1000"] = await run(
  2,
  true,
  1000
);
out[
  "write: insert + counter, 8 clients on one person, 8x250 (more than the limit allows)"
] = await run(8, true, 250);

// drift: the counter equals the sum after the writes above
const [d] = await sql`
  select u.week_used as counter, (select sum(charge) from runs r where r.user_id = u.user_id and r.created_at >= ${wk}) as sum
  from limit_usage u where user_id = 'h_burst'`;
out["counter vs sum after writes (h_burst, week)"] = d;
await sql`delete from runs where organization_id = 'bench'`;
await sql`drop table limit_usage`;
await sql`vacuum (analyze) runs`;
writeFileSync("results/bench-counters.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await sql.end();
