import type {
  LanguageModelUsage,
  ModelMessage,
  ProviderMetadata,
  StopCondition,
  ToolSet,
} from "ai";

import { ANSWER_NOW, ANSWER_NOW_TURN } from "../../apps/web/lib/steps";
import { addCosts, costOf } from "../../packages/core/src/pricing";
import type { Prices } from "../../packages/core/src/pricing";

// The answer's money budget (ARCH §20.8): what is left of the person's limit, fixed when the answer starts; each
// finished step costs what the Gateway reported, or its tokens × the model's prices. The answer stops on the step
// that reaches the budget — that step is already paid, so the overshoot is at most one step.

/** A finished step as the budget reads it: `StepResult` has both, so does the `onStepEnd` event. */
export interface CostedStep {
  usage: LanguageModelUsage;
  providerMetadata?: ProviderMetadata;
}

/** A plain decimal from what a provider reported: a string as is, a number without the exponent form. */
const plain = (value: string | number) =>
  typeof value === "string"
    ? value
    : value.toFixed(18).replace(/\.?0+$/u, "") || "0";

/**
 * What one step cost: the Gateway's own figure, else its tokens × the model's prices; null when neither is known.
 * The token split is the one `recordRun` (core/chat-run.ts) uses.
 */
export const stepCost = (
  step: CostedStep,
  prices: Prices | null
): string | null => {
  const reported = step.providerMetadata?.gateway?.cost;
  if (typeof reported === "string" || typeof reported === "number") {
    return plain(reported);
  }
  if (!prices) {
    return null;
  }
  const { usage } = step;
  const cacheReadTokens = usage.inputTokenDetails.cacheReadTokens ?? 0;
  const cacheWriteTokens = usage.inputTokenDetails.cacheWriteTokens ?? 0;
  const inputTokens =
    usage.inputTokenDetails.noCacheTokens ??
    Math.max(0, (usage.inputTokens ?? 0) - cacheReadTokens - cacheWriteTokens);
  return costOf(
    {
      cacheReadTokens,
      cacheWriteTokens,
      inputTokens,
      outputTokens: usage.outputTokens ?? 0,
    },
    prices
  );
};

const SCALE = 18;
const units = (value: string) => {
  const [whole = "0", frac = ""] = value.split(".");
  return BigInt(`${whole}${frac.padEnd(SCALE, "0").slice(0, SCALE)}`);
};

/** a ≥ b for plain decimal strings, exactly. */
export const atLeast = (a: string, b: string) => units(a) >= units(b);

/** The sum of the steps' costs; a step of unknown cost counts as 0 and is told apart in `unknown`. */
export const costOfSteps = (
  steps: readonly CostedStep[],
  prices: Prices | null
) => {
  const known: string[] = [];
  let unknown = 0;
  for (const step of steps) {
    const cost = stepCost(step, prices);
    if (cost === null) {
      unknown += 1;
    } else {
      known.push(cost);
    }
  }
  return { total: addCosts(known.length ? known : ["0"]), unknown };
};

/**
 * The budget of one answer. `stop` goes into `stopWhen` (it reads the steps it is given); `onStepEnd` keeps the
 * same sum for the record, so an answer that fails or is stopped halfway still writes what its finished steps cost
 * — `streamText`'s `onError` gets only the error, no steps.
 */
export const createBudget = ({
  remaining,
  prices,
}: {
  /** min(5 h limit − used, week limit − used), in the tariff's currency, at the answer's start. */
  remaining: string;
  prices: Prices | null;
}) => {
  const finished: CostedStep[] = [];
  const state = { stopped: false };
  const spentOf = (steps: readonly CostedStep[]) =>
    costOfSteps(steps, prices).total;
  return {
    remaining,
    /** `onStepEnd`: every finished step, including one that ended on a provider's `error` chunk. */
    onStepEnd: (step: CostedStep) => {
      finished.push({
        providerMetadata: step.providerMetadata,
        usage: step.usage,
      });
    },
    /** What the finished steps cost so far. */
    spent: () => spentOf(finished),
    steps: () => finished.length,
    unknown: () => costOfSteps(finished, prices).unknown,
    /** `stopWhen`: the answer's cost reached what was left. */
    stop: (({ steps }) => {
      const over = atLeast(spentOf(steps), remaining);
      if (over) {
        state.stopped = true;
      }
      return over;
    }) as StopCondition<ToolSet>,
    /** The budget cut the answer short (the hard stop, or the soft last step below). */
    stopped: () => state.stopped,
    /** The finished steps reached what was left — also when no stop condition was asked (a step that waits on approval). */
    over: () => atLeast(spentOf(finished), remaining),
    /** What is left after the finished steps; "0" when nothing is. */
    left: () => {
      const spent = spentOf(finished);
      if (atLeast(spent, remaining)) {
        return "0";
      }
      // remaining − spent, exactly
      const diff = units(remaining) - units(spent);
      const text = diff.toString().padStart(SCALE + 1, "0");
      const frac = text.slice(-SCALE).replace(/0+$/u, "");
      return frac ? `${text.slice(0, -SCALE)}.${frac}` : text.slice(0, -SCALE);
    },
    /**
     * `prepareStep`, the soft way: when the next step would likely reach the budget (it costs at least what the last
     * one did — the history only grows), it is the last one: no tools, «answer now». The answer ends in words in the
     * same pass, with no sum-up call after it.
     */
    lastStepIfShort: ({
      steps,
      instructions,
      messages,
    }: {
      steps: readonly CostedStep[];
      instructions: unknown;
      messages: ModelMessage[];
    }) => {
      const last = steps.at(-1);
      if (!last) {
        return;
      }
      const lastCost = stepCost(last, prices) ?? "0";
      if (!atLeast(addCosts([spentOf(steps), lastCost]), remaining)) {
        return;
      }
      state.stopped = true;
      const said = typeof instructions === "string" ? instructions : "";
      return {
        activeTools: [] as never[],
        instructions: said ? `${said}\n\n${ANSWER_NOW}` : ANSWER_NOW,
        messages: [
          ...messages,
          { content: ANSWER_NOW_TURN, role: "user" as const },
        ],
        toolChoice: "none" as const,
      };
    },
  };
};

export type Budget = ReturnType<typeof createBudget>;
