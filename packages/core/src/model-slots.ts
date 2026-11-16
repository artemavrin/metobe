import "server-only";
import { slotModelType } from "@metobe/contracts/models";
import type { ModelSlot } from "@metobe/contracts/models";
import { modelSlots, models, sources } from "@metobe/db/schema/models";
import { eq, sql } from "drizzle-orm";

import { getDb } from "./db";

// Service models (ARCH §7): a model per job outside the chat — chat titles first. Any model of a source that is on
// and working may take a job, in the chat or not: a cheap, fast one is often best for it.

const working = sql`${sources.enabled} and coalesce(${sources.health}->>'state', '') <> 'error'`;

export const getSlotAssignments = async () => {
  const { db } = getDb();
  const rows = await db.select().from(modelSlots);
  return Object.fromEntries(rows.map((r) => [r.slot, r.modelId])) as Partial<
    Record<ModelSlot, string | null>
  >;
};

/**
 * Gives a job to a model, or takes it away (null). A job takes its own kind of model (`slotModelType`): a decision
 * model only «Решения», a language model every other; false for a model of the wrong kind or none at all.
 */
export const setSlotModel = async (slot: ModelSlot, modelId: string | null) => {
  const { db } = getDb();
  if (modelId) {
    const [model] = await db
      .select({ type: models.type })
      .from(models)
      .where(eq(models.id, modelId))
      .limit(1);
    if (model?.type !== slotModelType(slot)) {
      return false;
    }
  }
  await db
    .insert(modelSlots)
    .values({ modelId, slot })
    .onConflictDoUpdate({
      set: { modelId, updatedAt: new Date() },
      target: modelSlots.slot,
    });
  return true;
};

/** The model of a job with what is needed to call it — only while its source is on and working; else null. */
export const getSlotModel = async (slot: ModelSlot) => {
  const { db } = getDb();
  const [model] = await db
    .select({
      capabilities: models.capabilities,
      contextWindow: models.contextWindow,
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
    .where(
      sql`${modelSlots.slot} = ${slot} and ${models.type} = ${slotModelType(slot)} and ${working}`
    )
    .limit(1);
  return model ?? null;
};
