import "server-only";
import {
  favoriteModels,
  modelRuns,
  models,
  providers,
  sources,
} from "@metobe/db/schema/models";
import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";

import { getDb } from "./db";

// What the model picker shows (P3): only what sources and our own runs really say — maker, source, context,
// capabilities, prices, the median time to the first token in Metobe — and the user's favorites and recent models.

/** Models that are in chat right now, newest first, with everything the picker compares. */
export const listModelChoices = () => {
  const { db } = getDb();
  return db
    .select({
      capabilities: models.capabilities,
      contextWindow: models.contextWindow,
      id: models.id,
      priceCacheRead: models.priceCacheRead,
      priceCurrency: models.priceCurrency,
      priceInput: models.priceInput,
      priceOutput: models.priceOutput,
      priceUnitTokens: models.priceUnitTokens,
      providerLogo: providers.logo,
      providerSlug: providers.slug,
      providerTitle: providers.title,
      releasedAt: models.releasedAt,
      sourceTitle: sources.title,
      title: models.title,
    })
    .from(models)
    .innerJoin(sources, eq(sources.id, models.sourceId))
    .leftJoin(providers, eq(providers.id, models.providerId))
    .where(
      sql`${models.enabled} and ${sources.enabled} and coalesce(${sources.health}->>'state', '') <> 'error'`
    )
    .orderBy(
      sql`${models.releasedAt} desc nulls last`,
      desc(models.createdAt),
      asc(models.title)
    );
};
export type ModelChoiceRow = Awaited<
  ReturnType<typeof listModelChoices>
>[number];

/** The median time to the first token per model over the last 30 days of successful runs, in ms. */
export const getFirstTokenMedians = async () => {
  const { db } = getDb();
  const rows = await db
    .select({
      median: sql<number>`percentile_cont(0.5) within group (order by ${modelRuns.latencyMs})`,
      modelId: modelRuns.modelId,
    })
    .from(modelRuns)
    .where(
      and(
        eq(modelRuns.status, "ok"),
        isNotNull(modelRuns.latencyMs),
        isNotNull(modelRuns.modelId),
        gte(modelRuns.createdAt, sql`now() - interval '30 days'`)
      )
    )
    .groupBy(modelRuns.modelId);
  return new Map(
    rows.flatMap((r) =>
      r.modelId ? [[r.modelId, Math.round(Number(r.median))] as const] : []
    )
  );
};

/** The models a user ran last, most recent first, each once. */
export const getRecentModelIds = async (userId: string, limit = 3) => {
  const { db } = getDb();
  const rows = await db
    .select({
      last: sql<Date>`max(${modelRuns.createdAt})`,
      modelId: modelRuns.modelId,
    })
    .from(modelRuns)
    .where(and(eq(modelRuns.userId, userId), isNotNull(modelRuns.modelId)))
    .groupBy(modelRuns.modelId)
    .orderBy(sql`max(${modelRuns.createdAt}) desc`)
    .limit(limit);
  return rows.flatMap((r) => (r.modelId ? [r.modelId] : []));
};

export const getFavoriteModelIds = async (userId: string) => {
  const { db } = getDb();
  const rows = await db
    .select({ modelId: favoriteModels.modelId })
    .from(favoriteModels)
    .where(eq(favoriteModels.userId, userId))
    .orderBy(asc(favoriteModels.position));
  return rows.map((r) => r.modelId);
};

/** Replaces a user's favorites with this list, in this order; ids of models that no longer exist are dropped. */
export const setFavoriteModels = async (userId: string, ids: string[]) => {
  const { db } = getDb();
  const unique = [...new Set(ids)];
  await db.transaction(async (tx) => {
    const existing = unique.length
      ? await tx
          .select({ id: models.id })
          .from(models)
          .where(inArray(models.id, unique))
      : [];
    const known = new Set(existing.map((m) => m.id));
    await tx.delete(favoriteModels).where(eq(favoriteModels.userId, userId));
    const rows = unique
      .filter((id) => known.has(id))
      .map((modelId, position) => ({ modelId, position, userId }));
    if (rows.length > 0) {
      await tx.insert(favoriteModels).values(rows);
    }
  });
};
