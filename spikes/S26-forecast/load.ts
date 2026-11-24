// Reading recorded runs of one organisation into columns for `replayLimits`.
import type { Runs, Seat } from "./forecast.ts";
import type { Sql } from "./db.ts";

// `cost` is numeric; `numeric::float8` costs ~1 µs a row (through a string), `numeric::bigint` almost nothing.
// Costs are read as integer units of 1e-12 (12 decimals; an assumption about the scale of `model_runs.cost`).
const SCALE = 1e12;

export type Loaded = { seats: Seat[]; runs: Runs };

export async function loadSeats(sql: Sql, schema: string, org: string): Promise<Seat[]> {
  const rows = await sql<{ id: string; tariff: number; since: number }[]>`
    select id, tariff, (extract(epoch from since) * 1000)::float8 as since
    from ${sql(schema)}.seats where organization_id = ${org} order by id`;
  return rows.map((r) => ({ id: r.id, tariff: r.tariff, since: r.since }));
}

/**
 * Runs of the organisation in `[from, to)`, ordered by (person, time, id). `request` — the person's own request
 * (chat or task), the rest is service work. Cost comes in its own currency: the rate and VAT knobs need it, a
 * `charge` already converted to rubles would not allow them.
 */
export async function loadRuns(
  sql: Sql,
  schema: string,
  org: string,
  seats: readonly Seat[],
  from: number,
  to: number,
): Promise<Runs> {
  const index = new Map(seats.map((s, i) => [s.id, i]));
  const rows = await sql`
    select user_id, round(date_part('epoch', created_at) * 1000) as t,
      (purpose in ('chat', 'task'))::int as request,
      case when currency = 'USD' then (cost * 1000000000000)::bigint::float8 else 0::float8 end as usd,
      case when currency = 'RUB' then (cost * 1000000000000)::bigint::float8 else 0::float8 end as rub,
      input_tokens, cache_read_tokens, output_tokens
    from ${sql(schema)}.model_runs
    where organization_id = ${org}
      and created_at >= timestamptz 'epoch' + ${from}::float8 * interval '1 millisecond'
      and created_at < timestamptz 'epoch' + ${to}::float8 * interval '1 millisecond'
    order by user_id, created_at, id`.values();
  // Straight into the columns: a row array per run would double the time of the read.
  const n = rows.length;
  const runs: Runs = {
    length: n,
    user: new Uint32Array(n),
    t: new Float64Array(n),
    request: new Uint8Array(n),
    usd: new Float64Array(n),
    rub: new Float64Array(n),
    tin: new Float64Array(n),
    tc: new Float64Array(n),
    tout: new Float64Array(n),
  };
  for (let i = 0; i < n; i++) {
    const r = rows[i] as unknown as [
      string,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    runs.user[i] = index.get(r[0]) ?? -1;
    runs.t[i] = r[1];
    runs.request[i] = r[2];
    runs.usd[i] = r[3] / SCALE;
    runs.rub[i] = r[4] / SCALE;
    runs.tin[i] = r[5];
    runs.tc[i] = r[6];
    runs.tout[i] = r[7];
  }
  return runs;
}
