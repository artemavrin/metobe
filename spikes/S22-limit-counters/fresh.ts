// Part 1d of S22: the covering index needs the visibility map. 100k fresh rows of one person, no VACUUM since:
// how many heap fetches and how slow, before and after vacuum. (Index at this point: I2, include (charge_u) — set by bench.ts.)
import { writeFileSync } from "node:fs";

import { ANCHOR, ms, sql, stats, weekStart } from "./common.ts";

const wk = weekStart(ANCHOR);
await sql`drop index if exists runs_user_time`;
await sql`create index runs_user_time on runs (user_id, created_at) include (charge)`;
await sql`vacuum (analyze) runs`;
await sql`delete from runs where user_id = 'h_fresh'`;
await sql`
  insert into runs (user_id, organization_id, status, charge, charge_u, created_at)
  select 'h_fresh', 'org1', 'ok', 0.5, 500000, ${wk}::timestamptz + random() * (${ANCHOR}::timestamptz - ${wk}::timestamptz)
  from generate_series(1, 100000)`;
await sql`analyze runs`;
const q = () =>
  sql`select coalesce(sum(charge) filter (where created_at >= ${ANCHOR}::timestamptz - interval '5 hours'), 0) five,
             coalesce(sum(charge), 0) week from runs where user_id = 'h_fresh' and created_at >= ${wk}`;
const plan = async () =>
  (
    await sql`explain (analyze, buffers, costs off, timing off) select sum(charge) from runs where user_id = 'h_fresh' and created_at >= ${wk}`
  )
    .map((r) => r["QUERY PLAN"] as string)
    .filter((l) => /Scan|Heap Fetches|Execution/.test(l))
    .map((l) => l.trim());
const timeIt = async () => {
  const xs: number[] = [];
  for (let i = 0; i < 200; i++) {
    const t0 = process.hrtime.bigint();
    await q();
    xs.push(ms(t0));
  }
  return stats(xs);
};
const out: Record<string, unknown> = {};
out["fresh rows, before vacuum"] = { plan: await plan(), ...(await timeIt()) };
await sql`vacuum (analyze) runs`;
out["after vacuum"] = { plan: await plan(), ...(await timeIt()) };
await sql`delete from runs where user_id = 'h_fresh'`;
await sql`vacuum (analyze) runs`;
writeFileSync("results/bench-fresh.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await sql.end();
