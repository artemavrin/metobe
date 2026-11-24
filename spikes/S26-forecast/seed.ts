import { generate, paramsFromArgv } from "./generate.ts";
import { connect, schemaSql, type Sql } from "./db.ts";

export async function insertRuns(
  sql: Sql,
  schema: string,
  org: string,
  seats: { id: string; tariff: number; since: number }[],
  runs: {
    user: number;
    t: number;
    purpose: string;
    usd: number;
    rub?: number;
    tin: number;
    tc: number;
    tout: number;
  }[],
) {
  await sql.unsafe(schemaSql(schema));
  await sql.unsafe(`truncate ${schema}.model_runs, ${schema}.seats restart identity`);
  for (let i = 0; i < seats.length; i += 5000) {
    const c = seats.slice(i, i + 5000);
    await sql`insert into ${sql(schema)}.seats (id, organization_id, tariff, since)
      select * from unnest(${c.map((s) => s.id)}::text[], ${c.map(() => org)}::text[], ${c.map((s) => s.tariff)}::int[],
        ${c.map((s) => new Date(s.since).toISOString())}::timestamptz[])`;
  }
  const CH = 20000;
  for (let i = 0; i < runs.length; i += CH) {
    const c = runs.slice(i, i + CH);
    // Exact milliseconds: integer arithmetic on the epoch, not `to_timestamp(float)`.
    await sql`insert into ${sql(schema)}.model_runs
      (organization_id, user_id, created_at, purpose, cost, currency, input_tokens, cache_read_tokens, output_tokens)
      select ${org}, u, timestamptz 'epoch' + t * interval '1 millisecond', p, cost, cur, a, b, d
      from unnest(${c.map((r) => seats[r.user]!.id)}::text[], ${c.map((r) => r.t)}::float8[],
        ${c.map((r) => r.purpose)}::text[], ${c.map((r) => String(r.rub ? r.rub : r.usd))}::numeric[],
        ${c.map((r) => (r.rub ? "RUB" : "USD"))}::text[], ${c.map((r) => r.tin)}::int[],
        ${c.map((r) => r.tc)}::int[], ${c.map((r) => r.tout)}::int[]) as x(u, t, p, cost, cur, a, b, d)
      `;
  }
  await sql.unsafe(`analyze ${schema}.model_runs`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const params = paramsFromArgv(process.argv.slice(2));
  const schema = process.env.S26_SCHEMA ?? "public";
  const t0 = performance.now();
  const { seats, runs } = generate(params);
  console.log(
    `generated ${seats.length} seats, ${runs.length} runs in ${(performance.now() - t0).toFixed(0)} ms`,
  );
  const sql = connect();
  await insertRuns(sql, schema, "org1", seats, runs);
  const [row] = await sql<{ n: number }[]>`select count(*)::int n from ${sql(schema)}.model_runs`;
  console.log(
    `inserted into ${schema}: ${row?.n} rows in ${(performance.now() - t0).toFixed(0)} ms`,
  );
  await sql.end();
}
