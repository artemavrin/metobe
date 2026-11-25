// Part 1b of S22: the same check under load (16 parallel clients, a writer inserting 50 rows/s).
import { writeFileSync } from "node:fs";

import { ANCHOR, WINDOW_MS, ms, sql, stats, weekStart } from "./common.ts";

const wk = weekStart(ANCHOR);
const heavy = ["h_burst", "h_hot"];
const bg = (
  await sql`select user_id from limit_windows where user_id like 'u%' order by random() limit 500`
).map((r) => r.user_id as string);

const check = async (userId: string) => {
  const [w] =
    await sql`select started_at from limit_windows where user_id = ${userId} and kind = '5h'`;
  const open =
    w && ANCHOR.getTime() - w.started_at.getTime() < WINDOW_MS
      ? (w.started_at as Date)
      : ANCHOR;
  const lo = open < wk ? open : wk;
  await sql`
    select coalesce(sum(charge) filter (where created_at >= ${open}), 0) as five,
           coalesce(sum(charge) filter (where created_at >= ${wk}), 0) as week
    from runs where user_id = ${userId} and created_at >= ${lo}`;
};

const index = async (name: "I0" | "I1") => {
  await sql`drop index if exists runs_user_time`;
  if (name === "I0")
    await sql`create index runs_user_time on runs (user_id, created_at)`;
  else
    await sql`create index runs_user_time on runs (user_id, created_at) include (charge)`;
  await sql`vacuum (analyze) runs`;
};

/** Closed loop: `clients` workers pick a user (share of busy ones = `heavyShare`) and check, for `seconds`. */
const load = async (
  clients: number,
  seconds: number,
  heavyShare: number,
  writerPerSec: number
) => {
  const hv: number[] = [];
  const bgx: number[] = [];
  const end = Date.now() + seconds * 1000;
  let writing = true;
  const writer = (async () => {
    if (writerPerSec === 0) return 0;
    let n = 0;
    while (writing) {
      const u = bg[n % bg.length]!;
      await sql`
        insert into runs (user_id, organization_id, status, charge, charge_u, created_at)
        values (${u}, 'bench', 'ok', 0.5, 500000, ${new Date(ANCHOR.getTime() + n)})`;
      n++;
      await new Promise((r) => setTimeout(r, 1000 / writerPerSec));
    }
    return n;
  })();
  await Promise.all(
    Array.from({ length: clients }, async () => {
      while (Date.now() < end) {
        const isHeavy = Math.random() < heavyShare;
        const u = isHeavy
          ? heavy[Math.floor(Math.random() * heavy.length)]!
          : bg[Math.floor(Math.random() * bg.length)]!;
        const t0 = process.hrtime.bigint();
        await check(u);
        (isHeavy ? hv : bgx).push(ms(t0));
      }
    })
  );
  writing = false;
  const written = await writer;
  return {
    heavy: hv.length ? stats(hv) : null,
    others: bgx.length ? stats(bgx) : null,
    checks: hv.length + bgx.length,
    written,
  };
};

const out: Record<string, unknown> = {};
for (const idx of ["I0", "I1"] as const) {
  await index(idx);
  await load(4, 2, 0.1, 0); // warm
  out[`${idx}: 16 clients, 5% busy, writer 50/s`] = await load(
    16,
    15,
    0.05,
    50
  );
  out[`${idx}: 16 clients, only busy (stress)`] = await load(16, 15, 1, 0);
  out[`${idx}: 4 clients, 100% busy (4 people at once)`] = await load(
    4,
    10,
    1,
    0
  );
  await sql`delete from runs where organization_id = 'bench'`;
  await sql`vacuum (analyze) runs`;
  console.log(idx, JSON.stringify(out, null, 0).slice(-600));
}

writeFileSync("results/bench-load.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await sql.end();
