import "server-only";
import type { RunStatus, SourceKind } from "@metobe/contracts/models";
import { modelRuns } from "@metobe/db/schema/models";
import type { LanguageModelUsage, ModelMessage, ProviderMetadata } from "ai";

import type { ChatModel } from "./chat";
import { getDb } from "./db";
import { costOf } from "./pricing";

// One model call of a chat (ARCH §5.2): tokens with the cache split, the exact cost and time to the first token.
// And prompt caching, so a long chat does not pay for its whole history on every turn.

/**
 * What each source needs to reuse the start of the prompt. OpenAI, Yandex and local servers cache a repeated
 * prefix by themselves; Anthropic only up to a marked message; the Gateway marks it for the models that need it.
 * The history is never rewritten on the way out, so the prefix stays byte for byte the same.
 */
export const withPromptCache = (
  kind: SourceKind,
  messages: ModelMessage[]
): {
  messages: ModelMessage[];
  providerOptions?: Record<string, Record<string, string>>;
} => {
  if (kind === "gateway") {
    return { messages, providerOptions: { gateway: { caching: "auto" } } };
  }
  if (kind !== "anthropic" || messages.length === 0) {
    return { messages };
  }
  // The newest message ends the cached prefix; the next turn reads everything up to it.
  const last = messages.at(-1) as ModelMessage;
  return {
    messages: [
      ...messages.slice(0, -1),
      {
        ...last,
        providerOptions: {
          ...last.providerOptions,
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
      } as ModelMessage,
    ],
  };
};

/** The Gateway reports what the call cost; for everyone else it is tokens × the model's prices. */
const reportedCost = (metadata: ProviderMetadata | undefined) => {
  const cost = metadata?.gateway?.cost;
  return typeof cost === "string" || typeof cost === "number"
    ? String(cost)
    : null;
};

export const recordRun = async (run: {
  chatId: string;
  userId: string;
  model: ChatModel;
  status: RunStatus;
  usage?: LanguageModelUsage;
  providerMetadata?: ProviderMetadata;
  latencyMs: number | null;
}) => {
  const { model, usage } = run;
  const cacheReadTokens = usage?.inputTokenDetails.cacheReadTokens ?? 0;
  const cacheWriteTokens = usage?.inputTokenDetails.cacheWriteTokens ?? 0;
  // Uncached input: said by the provider, or what is left of the input after the cache.
  const inputTokens =
    usage?.inputTokenDetails.noCacheTokens ??
    Math.max(0, (usage?.inputTokens ?? 0) - cacheReadTokens - cacheWriteTokens);
  const outputTokens = usage?.outputTokens ?? 0;
  const reported = reportedCost(run.providerMetadata);
  const priced =
    model.priceUnitTokens === null
      ? null
      : costOf(
          { cacheReadTokens, cacheWriteTokens, inputTokens, outputTokens },
          {
            cacheRead: model.priceCacheRead,
            cacheWrite: model.priceCacheWrite,
            input: model.priceInput,
            output: model.priceOutput,
            unitTokens: model.priceUnitTokens,
          }
        );
  const { db } = getDb();
  await db.insert(modelRuns).values({
    cacheReadTokens,
    cacheWriteTokens,
    chatId: run.chatId,
    cost: reported ?? priced,
    currency: reported ? "USD" : model.priceCurrency,
    inputTokens,
    latencyMs: run.latencyMs,
    modelId: model.id,
    outputTokens,
    status: run.status,
    userId: run.userId,
  });
};
