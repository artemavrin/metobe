import "server-only";
import type { ModelSlot } from "@metobe/contracts/models";
import {
  modelSlots,
  models,
  providers,
  sources,
} from "@metobe/db/schema/models";
import { asc, eq, sql } from "drizzle-orm";

import { getDb } from "./db";

// Service models (ARCH §7): a model per job outside the chat — chat titles first. Any model of a source that is on
// and working may take a job, in the chat or not: a cheap, fast one is often best for it.

const working = sql`${sources.enabled} and coalesce(${sources.health}->>'state', '') <> 'error'`;

/** Models that may take a service job, by maker and title. */
export const listSlotCandidates = () => {
  const { db } = getDb();
  return db
    .select({
      id: models.id,
      inChat: models.enabled,
      providerLogo: providers.logo,
      providerTitle: providers.title,
      sourceTitle: sources.title,
      title: models.title,
    })
    .from(models)
    .innerJoin(sources, eq(sources.id, models.sourceId))
    .leftJoin(providers, eq(providers.id, models.providerId))
    .where(working)
    .orderBy(asc(providers.title), asc(models.title));
};

export const getSlotAssignments = async () => {
  const { db } = getDb();
  const rows = await db.select().from(modelSlots);
  return Object.fromEntries(rows.map((r) => [r.slot, r.modelId])) as Partial<
    Record<ModelSlot, string | null>
  >;
};

export const setSlotModel = async (slot: ModelSlot, modelId: string | null) => {
  const { db } = getDb();
  await db
    .insert(modelSlots)
    .values({ modelId, slot })
    .onConflictDoUpdate({
      set: { modelId, updatedAt: new Date() },
      target: modelSlots.slot,
    });
};

/** The model of a job with what is needed to call it — only while its source is on and working; else null. */
export const getSlotModel = async (slot: ModelSlot) => {
  const { db } = getDb();
  const [model] = await db
    .select({
      capabilities: models.capabilities,
      id: models.id,
      kind: sources.kind,
      modelId: models.modelId,
      priceCacheRead: models.priceCacheRead,
      priceCacheWrite: models.priceCacheWrite,
      priceCurrency: models.priceCurrency,
      priceInput: models.priceInput,
      priceOutput: models.priceOutput,
      priceUnitTokens: models.priceUnitTokens,
      sourceId: models.sourceId,
      title: models.title,
    })
    .from(modelSlots)
    .innerJoin(models, eq(models.id, modelSlots.modelId))
    .innerJoin(sources, eq(sources.id, models.sourceId))
    .where(sql`${modelSlots.slot} = ${slot} and ${working}`)
    .limit(1);
  return model ?? null;
};
