// The same forecast as aggregates in SQL, no rows leave the database. An approximation by construction:
// - the 5-hour window is a fixed bucket of 5 hours (the real one opens at the person's first request);
// - a person's spend in a bucket is capped by the 5-hour limit, then the capped buckets of a week by the weekly one;
// - rejected requests, stopped answers and service runs after a rejection need the order of rows within a
//   person (a running state), which aggregates cannot give, so they are not computed.
// It does everything the scenario knobs need: re-pricing, rate, VAT, growth, limits.
import type { Sql } from "./db.ts";
import { DAY, H5, MONTH_DAYS, WEEK, usdRate, type Options, type Tariff } from "./forecast.ts";

export type SqlTariffResult = {
  id: string;
  seats: number;
  /** Per seat per month. */
  models: number;
  /** Person-weeks that hit the weekly limit / person-weeks with a request. */
  shareWeeksHit: number;
  usersHit5: number;
};

export async function sqlForecast(
  sql: Sql,
  schema: string,
  org: string,
  tariffs: readonly Tariff[],
  o: Options,
): Promise<SqlTariffResult[]> {
  const rate = usdRate(o);
  const rv = o.platformVat === 22 ? 1 / 1.22 : 1;
  const m = o.model;
  const limits = tariffs.map((t, i) => ({ tariff: i, l5: t.limit5h, lw: t.limitWeek }));
  const from = new Date(o.windowStart).toISOString();
  const to = new Date(o.windowEnd).toISOString();
  const rows = await sql<
    {
      tariff: number;
      seats: number;
      spent: number;
      seat_days: number;
      weeks: number;
      hit_w: number;
      hit5: number;
    }[]
  >`
    with lim as (
      select * from jsonb_to_recordset(${sql.json(limits)}) as x(tariff int, l5 float8, lw float8)
    ),
    runs as (
      select s.id, s.tariff,
        round(date_part('epoch', r.created_at) * 1000) as ms,
        (r.purpose in ('chat', 'task')) as req,
        (case
          when ${m === null} or r.purpose not in ('chat', 'task') then
            (case r.currency when 'USD' then (r.cost * 1000000000000)::bigint::float8 / 1e12 * ${rate} when 'RUB' then (r.cost * 1000000000000)::bigint::float8 / 1e12 * ${rv} else 0 end)
          else (r.input_tokens * ${m?.write ?? m?.in ?? 0}::float8 + r.cache_read_tokens * ${m?.cache ?? m?.in ?? 0}::float8
                + r.output_tokens * ${m?.out ?? 0}::float8) / 1e6 * ${m?.rub ? rv : rate}
         end
         + (case when r.purpose in ('chat', 'task') then ${o.memoryUsdPerRequest * rate}::float8 else 0 end)) * ${o.growth}::float8 as c
      from ${sql(schema)}.model_runs r
      join ${sql(schema)}.seats s on s.id = r.user_id
      where r.organization_id = ${org} and r.created_at >= ${from}::timestamptz and r.created_at < ${to}::timestamptz
    ),
    buckets as (
      select id, tariff,
        floor((ms + ${o.tzOffset}::float8 + ${3 * DAY}::float8) / ${WEEK}::float8) as wk,
        floor(ms / ${H5}::float8) as b5,
        sum(c) as demand, count(*) filter (where req) as reqs
      from runs group by 1, 2, 3, 4
    ),
    capped as (
      select b.id, b.tariff, b.wk, b.reqs, least(b.demand, coalesce(l.l5, 'infinity'::float8)) as d5,
        (b.demand > coalesce(l.l5, 'infinity'::float8) and b.reqs > 0) as over5, l.lw
      from buckets b join lim l using (tariff)
    ),
    weekly as (
      select id, tariff, wk, sum(d5) as d, sum(reqs) as reqs, bool_or(over5) as over5, min(lw) as lw
      from capped group by 1, 2, 3
    ),
    person as (
      select id, tariff, sum(least(d, coalesce(lw, 'infinity'::float8))) as spent,
        count(*) filter (where reqs > 0) as weeks,
        count(*) filter (where reqs > 0 and lw is not null and d >= lw) as hit_w,
        bool_or(over5) as hit5
      from weekly group by 1, 2
    ),
    seats_t as (
      select tariff, count(*) as seats,
        sum(greatest(1, (${o.windowEnd}::float8 - greatest(extract(epoch from since) * 1000, ${o.windowStart}::float8)) / ${DAY}::float8)) as seat_days
      from ${sql(schema)}.seats where organization_id = ${org} group by 1
    )
    select t.tariff, t.seats::int, coalesce(sum(p.spent), 0)::float8 as spent, t.seat_days::float8,
      coalesce(sum(p.weeks), 0)::float8 as weeks, coalesce(sum(p.hit_w), 0)::float8 as hit_w,
      count(*) filter (where p.hit5)::float8 as hit5
    from seats_t t left join person p using (tariff)
    group by t.tariff, t.seats, t.seat_days order by t.tariff`;
  return rows.map((r) => ({
    id: tariffs[r.tariff]!.id,
    seats: r.seats,
    models: r.spent / (r.seat_days / MONTH_DAYS),
    shareWeeksHit: r.weeks ? r.hit_w / r.weeks : 0,
    usersHit5: r.hit5,
  }));
}
