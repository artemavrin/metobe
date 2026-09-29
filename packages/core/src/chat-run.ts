import "server-only";
import type {
  RunPurpose,
  RunStatus,
  SourceKind,
} from "@metobe/contracts/models";
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

/**
 * What an answer cost as the Gateway reported it: the sum over ALL its steps. An answer with tools is several
 * requests to the model — the history goes again after every tool result — and each is billed; the final step's
 * metadata alone (what the SDK's `providerMetadata` is) is only the last of them. Null when no step reported.
 */
export const reportedCostOf = (steps: (ProviderMetadata | undefined)[]) => {
  const costs = steps.flatMap((metadata) => {
    const cost = reportedCost(metadata);
    return cost === null ? [] : [Number(cost)];
  });
  return costs.length === 0 ? null : String(costs.reduce((a, b) => a + b, 0));
};

/** The tokens of several steps as one usage — what an answer stopped halfway used up to its last finished step. */
export const sumUsage = (usages: LanguageModelUsage[]): LanguageModelUsage => {
  const add = (pick: (u: LanguageModelUsage) => number | undefined) => {
    const known = usages.flatMap((u) => {
      const value = pick(u);
      return value === undefined ? [] : [value];
    });
    return known.length === 0 ? undefined : known.reduce((a, b) => a + b, 0);
  };
  const inputTokens = add((u) => u.inputTokens);
  const outputTokens = add((u) => u.outputTokens);
  return {
    inputTokenDetails: {
      cacheReadTokens: add((u) => u.inputTokenDetails.cacheReadTokens),
      cacheWriteTokens: add((u) => u.inputTokenDetails.cacheWriteTokens),
      noCacheTokens: add((u) => u.inputTokenDetails.noCacheTokens),
    },
    inputTokens,
    outputTokenDetails: {
      reasoningTokens: add((u) => u.outputTokenDetails.reasoningTokens),
      textTokens: add((u) => u.outputTokenDetails.textTokens),
    },
    outputTokens,
    raw: undefined,
    totalTokens: add((u) => u.totalTokens),
  } as LanguageModelUsage;
};

export const recordRun = async (run: {
  chatId: string;
  userId: string;
  model: ChatModel;
  status: RunStatus;
  usage?: LanguageModelUsage;
  /** The metadata of every step of the answer, for the Gateway's cost; else the one of its last step. */
  stepsMetadata?: (ProviderMetadata | undefined)[];
  providerMetadata?: ProviderMetadata;
  latencyMs: number | null;
  /** A chat's answer by default; service jobs say which. */
  purpose?: RunPurpose;
}) => {
  const { model, usage } = run;
  const cacheReadTokens = usage?.inputTokenDetails.cacheReadTokens ?? 0;
  const cacheWriteTokens = usage?.inputTokenDetails.cacheWriteTokens ?? 0;
  // Uncached input: said by the provider, or what is left of the input after the cache.
  const inputTokens =
    usage?.inputTokenDetails.noCacheTokens ??
    Math.max(0, (usage?.inputTokens ?? 0) - cacheReadTokens - cacheWriteTokens);
  const outputTokens = usage?.outputTokens ?? 0;
  const reported =
    reportedCostOf(run.stepsMetadata ?? []) ??
    reportedCost(run.providerMetadata);
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
    purpose: run.purpose ?? "chat",
    status: run.status,
    userId: run.userId,
  });
};
