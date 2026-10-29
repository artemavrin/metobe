import "server-only";
import type { Currency, RunPurpose } from "@metobe/contracts/models";
import { user } from "@metobe/db/schema/auth";
import { modelRuns, models, sources } from "@metobe/db/schema/models";
import {
  and,
  count,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  min,
  sql,
} from "drizzle-orm";

import { getDb } from "./db";

// «Расходы» (P10): `model_runs` grouped by day — or hour, for a single day — person, model and purpose, in the
// viewer's own time zone, so «сегодня» ends at their midnight, not UTC's. A person sees only their own runs; an admin
// sees the whole team. Cost stays in each model's currency: rubles and dollars are never added.

/** One bucket of one person on one model for one purpose. */
export interface UsageBucket {
  /** The local day `2026-10-29`, or its hour `2026-10-29T09`. */
  at: string;
  /** Null — the account was deleted; its runs stay (SET NULL). */
  userId: string | null;
  /** Null — the model was deleted. */
  modelId: string | null;
  purpose: RunPurpose;
  requests: number;
  errors: number;
  input: number;
  output: number;
  cacheRead: number;
  /** Null — none of these runs had a price (a local server's model): unknown, not zero. */
  cost: number | null;
  currency: Currency | null;
  /** Requests without a price: they count, but are not in the money. */
  unpriced: number;
}

export interface UsageQuery {
  /** Only this person's runs; none — everyone's (an admin's view). */
  userId?: string;
  /** Local days, both included. */
  from: string;
  to: string;
  timeZone: string;
  hourly: boolean;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const plusDays = (day: string, by: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d;
};

export const usageBuckets = async (q: UsageQuery): Promise<UsageBucket[]> => {
  if (!DAY.test(q.from) || !DAY.test(q.to)) {
    throw new Error("A usage period is two days, YYYY-MM-DD");
  }
  const local = sql`(${modelRuns.createdAt} at time zone ${q.timeZone})`;
  const at = q.hourly
    ? sql<string>`to_char(${local}, 'YYYY-MM-DD"T"HH24')`
    : sql<string>`to_char(${local}, 'YYYY-MM-DD')`;
  const rows = await getDb()
    .db.select({
      at,
      cacheRead: sql<number>`coalesce(sum(${modelRuns.cacheReadTokens}), 0)::float8`,
      cost: sql<string | null>`sum(${modelRuns.cost})`,
      currency: modelRuns.currency,
      errors: sql<number>`(count(*) filter (where ${modelRuns.status} = 'error'))::int`,
      input: sql<number>`coalesce(sum(${modelRuns.inputTokens}), 0)::float8`,
      modelId: modelRuns.modelId,
      output: sql<number>`coalesce(sum(${modelRuns.outputTokens}), 0)::float8`,
      purpose: modelRuns.purpose,
      requests: sql<number>`count(*)::int`,
      unpriced: sql<number>`(count(*) filter (where ${modelRuns.cost} is null))::int`,
      userId: modelRuns.userId,
    })
    .from(modelRuns)
    .where(
      and(
        q.userId === undefined ? undefined : eq(modelRuns.userId, q.userId),
        // A day either side in UTC keeps the index on `created_at`; the local days are the exact bound.
        gte(modelRuns.createdAt, plusDays(q.from, -1)),
        lt(modelRuns.createdAt, plusDays(q.to, 2)),
        sql`${local}::date between ${q.from}::date and ${q.to}::date`
      )
    )
    // By its place: the same expression twice would carry the zone as two parameters, and Postgres would not see
    // them as one. `at` is the select's first column.
    .groupBy(
      sql`1`,
      modelRuns.userId,
      modelRuns.modelId,
      modelRuns.purpose,
      modelRuns.currency
    );
  return rows.map((r) => ({
    ...r,
    cost: r.cost === null ? null : Number(r.cost),
    currency: r.cost === null ? null : r.currency,
  }));
};

/** What the buckets point at, by id: a model's name and source, a person's name and email. */
export const usageLabels = async (buckets: UsageBucket[]) => {
  const modelIds = [
    ...new Set(buckets.flatMap((b) => (b.modelId ? [b.modelId] : []))),
  ];
  const userIds = [
    ...new Set(buckets.flatMap((b) => (b.userId ? [b.userId] : []))),
  ];
  const { db } = getDb();
  const [modelRows, people] = await Promise.all([
    modelIds.length === 0
      ? []
      : db
          .select({ id: models.id, source: sources.title, title: models.title })
          .from(models)
          .leftJoin(sources, eq(sources.id, models.sourceId))
          .where(inArray(models.id, modelIds)),
    userIds.length === 0
      ? []
      : db
          .select({ email: user.email, id: user.id, name: user.name })
          .from(user)
          .where(inArray(user.id, userIds)),
  ]);
  return {
    models: Object.fromEntries(
      modelRows.map((m) => [m.id, { source: m.source ?? "", title: m.title }])
    ),
    people: Object.fromEntries(
      people.map((p) => [p.id, { email: p.email, name: p.name || p.email }])
    ),
  };
};

/** How many can use the service now: the «из N» beside the people who did. */
export const activeUserCount = async () => {
  const [row] = await getDb()
    .db.select({ n: count() })
    .from(user)
    .where(isNull(user.disabledAt));
  return row?.n ?? 0;
};

/** The first run there is — the calendar offers nothing before it; none — nothing was ever spent. */
export const firstRunAt = async (userId?: string) => {
  const [row] = await getDb()
    .db.select({ at: min(modelRuns.createdAt) })
    .from(modelRuns)
    .where(userId === undefined ? undefined : eq(modelRuns.userId, userId));
  return row?.at ?? null;
};
