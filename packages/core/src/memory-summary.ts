import "server-only";
import type { MemorySummary } from "@metobe/contracts/memory";
import { generateText, Output } from "ai";

import { getLanguageModel } from "./ai";
import { recordRun } from "./chat-run";
import { listEntities, listRecords, loadSummary, saveSummary } from "./memory";
import type { MemoryEntity, MemoryRecord } from "./memory";
import {
  MIN_RECORDS,
  SUMMARY_INSTRUCTIONS,
  isStale,
  stillTrue,
  summaryPrompt,
  summarySchema,
  supported,
} from "./memory-summary-text";
import { getSlotModel } from "./model-slots";

// A card's «Кратко» (Г2.1): written in the background by the «Память» model, kept sealed, shown with the card. The text
// of the account and its checks are in `memory-summary-text` (no base, so the spikes can use them).

/** A card whose account was tried is not tried again for this long, whatever came of it. */
const RETRY_MS = 10 * 60_000;
const BUILD_TIMEOUT_MS = 60_000;

const writing = new Map<string, Promise<void>>();
const tried = new Map<string, number>();

/** Writes a card's account and keeps it. Quiet where there is nothing to do: no «Память» model, too few records. */
const build = async (ownerId: string, card: MemoryEntity, timeZone: string) => {
  const model = await getSlotModel("memory");
  if (!model) {
    return;
  }
  const [entities, records] = await Promise.all([
    listEntities(ownerId),
    listRecords(ownerId, { entityId: card.id }),
  ]);
  const live = records.filter((r) => !r.deletedAt && !r.supersededAt);
  if (live.length < MIN_RECORDS) {
    return;
  }
  const { prompt, refs } = summaryPrompt(
    card,
    live,
    entities,
    timeZone,
    new Date()
  );
  const started = Date.now();
  try {
    const result = await generateText({
      abortSignal: AbortSignal.timeout(BUILD_TIMEOUT_MS),
      instructions: SUMMARY_INSTRUCTIONS,
      maxRetries: 1,
      model: await getLanguageModel(model.sourceId, model.modelId),
      output: Output.object({ schema: summarySchema }),
      prompt,
      // A person's memory is not left with the provider behind the Gateway (D39).
      providerOptions:
        model.kind === "gateway"
          ? { gateway: { zeroDataRetention: true } }
          : undefined,
      reasoning: "low",
    });
    await recordRun({
      chatId: null,
      latencyMs: Date.now() - started,
      model,
      providerMetadata: result.providerMetadata,
      purpose: "memory",
      status: "ok",
      usage: result.totalUsage,
      userId: ownerId,
    });
    const body = supported(result.output, refs);
    await saveSummary(
      ownerId,
      card.id,
      { ...body, count: live.length },
      new Date(Math.max(...live.map((r) => r.recordedAt.getTime())))
    );
  } catch (error) {
    await recordRun({
      chatId: null,
      latencyMs: null,
      model,
      purpose: "memory",
      status: "error",
      userId: ownerId,
    }).catch((recordError: unknown) =>
      console.error("memory: could not record the run", recordError)
    );
    console.error("memory: could not write a card's account", error);
  }
};

/**
 * A card's account for the page, and whether one is being written. What is kept comes back at once (cut to what still
 * stands); when it is missing or out of date, and the card has records enough, it is written in the background — once in
 * ten minutes per card — and the page looks again in a few seconds.
 */
export const summaryFor = async (
  ownerId: string,
  card: MemoryEntity,
  records: MemoryRecord[],
  timeZone: string
): Promise<{ building: boolean; summary: MemorySummary | null }> => {
  const stored = await loadSummary(ownerId, card.id);
  const live = records.filter((r) => !r.deletedAt && !r.supersededAt);
  const stale = !stored || isStale(stored, records);
  let building = writing.has(card.id);
  if (
    stale &&
    !building &&
    live.length >= MIN_RECORDS &&
    Date.now() - (tried.get(card.id) ?? 0) > RETRY_MS &&
    (await getSlotModel("memory"))
  ) {
    tried.set(card.id, Date.now());
    const run = (async () => {
      try {
        await build(ownerId, card, timeZone);
      } finally {
        writing.delete(card.id);
      }
    })();
    writing.set(card.id, run);
    building = true;
  }
  if (!stored) {
    return { building, summary: null };
  }
  const shown = stillTrue(stored, new Set(live.map((r) => r.id)));
  const empty = shown.who.length + shown.how.length + shown.now.length === 0;
  return {
    building,
    summary: empty ? null : { ...shown, builtAt: stored.builtAt.toISOString() },
  };
};
