// Fills spike_s22: a `runs` table shaped like model_runs (+ organization_id, charge), ~1.7M rows.
// 3 busy people with 100k rows each (spread over a year / all within the week / half in the last 5 h),
// 1500 other people with ~1.5M rows between them over 90 days. Rows are inserted in time order, as in life.
import { ANCHOR, ORG_TZ, sql, weekStart } from "./common.ts";

const BG_ROWS = Number(process.env.BG_ROWS ?? 1_500_000);
const BG_USERS = 1500;
const anchor = ANCHOR.toISOString();
const wk = weekStart(ANCHOR).toISOString();
console.log({ anchor, weekStart: wk, tz: ORG_TZ, BG_ROWS });

await sql`drop table if exists runs, limit_windows, limit_usage cascade`;
await sql`
  create table runs (
    id uuid primary key default gen_random_uuid(),
    user_id text not null,
    organization_id text not null,
    chat_id uuid,
    model_id uuid,
    purpose text not null default 'chat',
    status text not null,
    input_tokens integer not null default 0,
    output_tokens integer not null default 0,
    cache_read_tokens integer not null default 0,
    cache_write_tokens integer not null default 0,
    cost numeric,
    currency text,
    charge numeric(14,6),
    charge_u bigint,
    charge_currency text,
    latency_ms integer,
    created_at timestamptz not null default now()
  )`;
// The window row of ARCH §20.8: limit_windows (user_id, kind, started_at).
await sql`
  create table limit_windows (
    user_id text not null,
    kind text not null,
    started_at timestamptz not null,
    primary key (user_id, kind)
  )`;

const t0 = Date.now();
await sql.unsafe(`
  insert into runs (user_id, organization_id, chat_id, model_id, status, input_tokens, output_tokens, cache_read_tokens,
                    cost, currency, charge, charge_u, charge_currency, latency_ms, created_at)
  select u, 'org' || (abs(hashtext(u)) % 60), gen_random_uuid(), gen_random_uuid(),
         case when r < 0.03 then 'error' else 'ok' end,
         (r * 20000)::int, (r * 900)::int, (r * 90000)::int,
         c, 'USD', case when r2 < 0.02 then null else round(c * 95, 6) end,
         case when r2 < 0.02 then null else round(c * 95 * 1e6)::bigint end,
         case when r2 < 0.02 then null else 'RUB' end,
         (r * 8000)::int, ts
  from (
    select u, ts, random() as r, random() as r2, round((0.0005 + (-ln(1 - random())) * 0.004)::numeric, 8) as c from (
      select 'u' || floor(${BG_USERS} * power(random(), 1.6))::int as u,
             '${anchor}'::timestamptz - random() * interval '90 days' as ts
      from generate_series(1, ${BG_ROWS})
      union all
      select 'h_spread', '${anchor}'::timestamptz - random() * interval '365 days' from generate_series(1, 100000)
      union all
      select 'h_burst', '${wk}'::timestamptz + random() * ('${anchor}'::timestamptz - '${wk}'::timestamptz)
      from generate_series(1, 100000)
      union all
      select 'h_hot', '${anchor}'::timestamptz - random() * interval '5 hours' from generate_series(1, 50000)
      union all
      select 'h_hot', '${wk}'::timestamptz + random() * ('${anchor}'::timestamptz - interval '5 hours' - '${wk}'::timestamptz)
      from generate_series(1, 50000)
    ) g
  ) x
  order by ts`);
console.log("inserted in", (Date.now() - t0) / 1000, "s");

// limit_windows: heavy people opened the 5 h window 2 h ago (burst: 4 h — worst case); others — somewhere in the last 5 h.
await sql`
  insert into limit_windows (user_id, kind, started_at)
  values ('h_spread', '5h', ${anchor}::timestamptz - interval '2 hours'),
         ('h_burst', '5h', ${anchor}::timestamptz - interval '4 hours'),
         ('h_hot', '5h', ${anchor}::timestamptz - interval '5 hours' + interval '1 second')`;
await sql`
  insert into limit_windows
  select u, '5h', ${anchor}::timestamptz - random() * interval '4 hours'
  from (select distinct user_id u from runs where user_id like 'u%') d`;

await sql`analyze runs`;
const [{ n }] = await sql`select count(*)::int n from runs`;
const per =
  await sql`select user_id, count(*)::int n from runs where user_id like 'h_%' group by 1 order by 1`;
const [size] =
  await sql`select pg_size_pretty(pg_table_size('runs')) heap, pg_size_pretty(pg_indexes_size('runs')) idx`;
console.log({ total: n, heavy: per, size });
await sql.end();
