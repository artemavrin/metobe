import type { ModelMessage } from "ai";

// The context budget (M3): what the model is sent of a long chat. Every question sends the whole history again, and a
// chat with tools carries their results — a 1С query is 150 KB — so a chat of a dozen messages weighs half a million
// tokens: seconds before the first word, a fortune per question, and «context rot» (the more there is in the window,
// the worse the model recalls it). Built after Anthropic's own guidance, not our invention:
//
// - Context editing (`clear_tool_uses`): when the context passes a `trigger` (100k input tokens by default), the oldest
//   tool results go — a placeholder says so — keeping the last `keep` (3) uses; the tool calls stay (`clear_tool_inputs`
//   is off); clearing must free at least `clear_at_least`, else it does not apply. The client keeps the whole history,
//   only what the model sees changes. «Tool result clearing is one of the safest, lightest touch forms of compaction.»
// - Prompt caching: clearing invalidates the cache from the change on, so it is done in big batches, not a little
//   with every question.
// - Writing tools for agents: a tool's response is capped (Claude Code: 25,000 tokens by default) and a cut one steers
//   the model to ask for less.
//
// The rule is a pure function of the history: the same history always gives the same prompt, so the prefix — and the
// cache — stays put from one question to the next. Where results are cut depends on the tool results alone (newest
// first, up to a budget), so a new question with no tools changes nothing before it.

/** A guess of tokens by characters: the same for the same text, and on the safe side for Cyrillic and JSON. */
const CHARS_PER_TOKEN = 3;
const tokensOf = (chars: number) => Math.ceil(chars / CHARS_PER_TOKEN);

/** Anthropic's defaults: clearing starts at 100k tokens; a tool's response is cut at 25k; the last 3 results stay. */
const DEFAULT_TRIGGER = 100_000;
const DEFAULT_CAP = 25_000;
const KEEP_LAST = 3;
/** Of a small window: clearing starts at half of it, a response is cut at a quarter. */
const TRIGGER_SHARE = 0.5;
const CAP_SHARE = 0.25;
/** What the results kept after a clearing may weigh together, as a share of the trigger — a big batch at once. */
const KEEP_SHARE = 0.4;
/** A result smaller than this is not worth a placeholder (nor a broken cache). */
const MIN_CLEARABLE_TOKENS = 500;
/** A clearing that would free less than this, or a quarter of the trigger, does not apply (`clear_at_least`). */
const CLEAR_AT_LEAST = 5000;

export interface Budget {
  /** The model's context window in tokens, when known; else Anthropic's defaults stand. */
  window: number | null;
}

export const triggerOf = (window: number | null) =>
  window === null
    ? DEFAULT_TRIGGER
    : Math.min(DEFAULT_TRIGGER, Math.floor(window * TRIGGER_SHARE));
export const capOf = (window: number | null) =>
  window === null
    ? DEFAULT_CAP
    : Math.min(DEFAULT_CAP, Math.floor(window * CAP_SHARE));

interface ToolResult {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  output: { type: string; value?: unknown; reason?: string };
}

const isResult = (part: unknown): part is ToolResult =>
  typeof part === "object" &&
  part !== null &&
  (part as { type?: string }).type === "tool-result";

/** What a result says, as text; null for a kind we leave alone (media). */
const textOfResult = (result: ToolResult) => {
  const { output } = result;
  switch (output.type) {
    case "text":
    case "error-text": {
      return String(output.value ?? "");
    }
    case "json":
    case "error-json": {
      return JSON.stringify(output.value) ?? "";
    }
    default: {
      return null;
    }
  }
};

const isError = (result: ToolResult) => result.output.type.startsWith("error");

/** A result with its output as text — what the model is told in its place. */
const withText = (result: ToolResult, value: string): ToolResult => ({
  ...result,
  output: { type: isError(result) ? "error-text" : "text", value },
});

const cutNote = (shown: number, all: number) =>
  `\n\n[Truncated: the first ${shown} of ${all} characters. Narrow the request — a filter, a shorter period, fewer fields, a page at a time — to get the rest.]`;

const clearedNote = (name: string, tokens: number) =>
  `[The result of ${name} (about ${tokens} tokens) was removed from this conversation to keep the context small. Call ${name} again if the data is needed.]`;

/** Every part of every message, mapped; the same array back when nothing changed. */
const mapParts = (
  messages: ModelMessage[],
  fn: (part: unknown, at: { message: number; part: number }) => unknown
) => {
  let changed = false;
  const next = messages.map((message, mi) => {
    if (!Array.isArray(message.content)) {
      return message;
    }
    let inner = false;
    const content = message.content.map((part, pi) => {
      const out = fn(part, { message: mi, part: pi });
      if (out !== part) {
        inner = true;
      }
      return out;
    });
    if (!inner) {
      return message;
    }
    changed = true;
    return { ...message, content } as ModelMessage;
  });
  return changed ? next : messages;
};

/** A tool's response over the cap is cut, and the model told how to get the rest. */
const capResults = (messages: ModelMessage[], capChars: number) =>
  mapParts(messages, (part) => {
    if (!isResult(part)) {
      return part;
    }
    const text = textOfResult(part);
    if (text === null || text.length <= capChars) {
      return part;
    }
    return withText(
      part,
      text.slice(0, capChars) + cutNote(capChars, text.length)
    );
  });

/** What the history weighs, by the guess: its words, its reasoning, what the tools were asked and what they said. */
export const estimateTokens = (messages: ModelMessage[]) => {
  let chars = 0;
  for (const message of messages) {
    if (typeof message.content === "string") {
      chars += message.content.length;
      continue;
    }
    for (const part of message.content as unknown[]) {
      const p = part as { type?: string; text?: string; input?: unknown };
      if (p.type === "text" || p.type === "reasoning") {
        chars += p.text?.length ?? 0;
      } else if (p.type === "tool-call") {
        chars += JSON.stringify(p.input ?? "").length;
      } else if (isResult(part)) {
        chars +=
          textOfResult(part)?.length ?? JSON.stringify(part.output).length;
      }
    }
  }
  return tokensOf(chars);
};

/**
 * What the model is sent: every tool response cut at the cap; and, once the history passes the trigger, the results of
 * the oldest tool uses replaced with a note — keeping the newest ones up to a budget (and the last three whatever they
 * weigh), leaving every call as it was. Same array back when there is nothing to do.
 */
export const budgetMessages = (
  messages: ModelMessage[],
  { window }: Budget
): ModelMessage[] => {
  const capped = capResults(messages, capOf(window) * CHARS_PER_TOKEN);
  const trigger = triggerOf(window);
  if (estimateTokens(capped) <= trigger) {
    return capped;
  }
  // The results, newest first.
  const results: {
    at: { message: number; part: number };
    name: string;
    tokens: number;
  }[] = [];
  mapParts(capped, (part, at) => {
    if (isResult(part)) {
      const text = textOfResult(part);
      if (text !== null) {
        results.unshift({
          at,
          name: part.toolName,
          tokens: tokensOf(text.length),
        });
      }
    }
    return part;
  });
  const keepBudget = Math.floor(trigger * KEEP_SHARE);
  const cleared = new Map<string, { name: string; tokens: number }>();
  let kept = 0;
  let cut = false;
  for (const [i, r] of results.entries()) {
    const key = `${r.at.message}:${r.at.part}`;
    if (i < KEEP_LAST) {
      kept += r.tokens;
    } else if (!cut && kept + r.tokens <= keepBudget) {
      kept += r.tokens;
    } else {
      // From here back in time everything goes: a contiguous cut, oldest first — as the API does.
      cut = true;
      if (r.tokens >= MIN_CLEARABLE_TOKENS) {
        cleared.set(key, { name: r.name, tokens: r.tokens });
      }
    }
  }
  let freed = 0;
  for (const c of cleared.values()) {
    freed += c.tokens;
  }
  // Too little to be worth breaking the cache for: it does not apply.
  if (freed < Math.min(CLEAR_AT_LEAST, Math.floor(trigger / 4))) {
    return capped;
  }
  return mapParts(capped, (part, at) => {
    const hit = cleared.get(`${at.message}:${at.part}`);
    return hit && isResult(part)
      ? withText(part, clearedNote(hit.name, hit.tokens))
      : part;
  });
};

/**
 * Whether a provider's error says the request did not fit the model's window — the words differ (OpenAI «context
 * length», Anthropic «prompt is too long», llama.cpp «exceeds the available context size»), the meaning does not.
 */
export const isContextOverflow = (error: unknown) => {
  const parts: string[] = [];
  let current: unknown = error;
  for (let i = 0; i < 6 && current instanceof Error; i += 1) {
    parts.push(current.message);
    const body = (current as { responseBody?: unknown }).responseBody;
    if (typeof body === "string") {
      parts.push(body);
    }
    current = current.cause ?? (current as { lastError?: unknown }).lastError;
  }
  return /context[ _-]?(?:length|window|size)|exceeds? the (?:available )?context|prompt is too long|too many tokens|maximum context|exceed_context_size|input is too long/iu.test(
    parts.join(" ")
  );
};
