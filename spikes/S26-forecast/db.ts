import postgres from "postgres";

// Own database of the spike; `purr` and `metobe` are never touched.
export const DATABASE_URL =
  process.env.S26_DATABASE_URL ?? "postgres://purr:purr@127.0.0.1:5432/spike_s26";

export const connect = () => postgres(DATABASE_URL, { max: 4, onnotice: () => {} });
export type Sql = ReturnType<typeof connect>;

/** The part of `model_runs` that the forecast reads, plus `organization_id` as in ARCH §20.15. */
export const schemaSql = (schema: string) => `
create schema if not exists ${schema};
create table if not exists ${schema}.seats (
  id text primary key,
  organization_id text not null,
  tariff int not null,
  since timestamptz not null
);
create table if not exists ${schema}.model_runs (
  id bigint generated always as identity primary key,
  organization_id text not null,
  user_id text not null,
  created_at timestamptz not null,
  purpose text not null,
  cost numeric,
  currency text,
  input_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  output_tokens int not null default 0
);
create index if not exists model_runs_user_time on ${schema}.model_runs (user_id, created_at);
create index if not exists model_runs_org_time on ${schema}.model_runs (organization_id, created_at);
`;
