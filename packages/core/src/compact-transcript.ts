import type { ChatMessage } from "@metobe/contracts/chat";

// What the service model reads to compact a chat (D37): the conversation as plain text — the user's words, the
// answers, every tool call with its arguments and a short head of its result — without the reasoning. The summary of
// an earlier compaction goes first, then what came after it. Pure: `chat-compact.ts` calls the model.

/** A tool call's arguments and its result, shown this much at most: enough to keep the query, not the data dump. */
const ARGS_CHARS = 800;
const RESULT_CHARS = 1500;
/** A guess of tokens by characters, as the context budget makes it (Cyrillic and JSON on the safe side). */
export const CHARS_PER_TOKEN = 3;

const clip = (text: string, max: number) =>
  text.length <= max
    ? text
    : `${text.slice(0, max)} […${text.length - max} more characters]`;

const json = (value: unknown) => {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
};

type Part = ChatMessage["parts"][number];

/** A tool part's name: `tool-show_table` → `show_table`, a dynamic (MCP) tool by its own name. */
const toolNameOf = (part: Part) => {
  if (part.type === "dynamic-tool") {
    return part.toolName;
  }
  return part.type.startsWith("tool-") ? part.type.slice(5) : null;
};

const partText = (part: Part): string | null => {
  if (part.type === "text") {
    return part.text.trim() || null;
  }
  if (part.type === "file") {
    return `[file: ${part.filename ?? part.mediaType}]`;
  }
  const name = toolNameOf(part);
  if (!name || !("state" in part)) {
    return null;
  }
  const call = `[${name}(${clip(json("input" in part ? part.input : undefined), ARGS_CHARS)})`;
  if (part.state === "output-available") {
    return `${call} → ${clip(json(part.output), RESULT_CHARS)}]`;
  }
  if (part.state === "output-error") {
    return `${call} → error: ${clip(part.errorText ?? "", RESULT_CHARS)}]`;
  }
  return `${call}]`;
};

/** The summary a compaction message carries; none for any other message. */
export const summaryOf = (message: ChatMessage): string | null => {
  for (const part of message.parts) {
    if (part.type === "data-compaction") {
      return part.data.summary;
    }
  }
  return null;
};

/** Where the last compaction stands in the history; -1 when there is none. */
export const lastCompaction = (messages: ChatMessage[]) => {
  let at = -1;
  for (const [i, m] of messages.entries()) {
    if (summaryOf(m) !== null) {
      at = i;
    }
  }
  return at;
};

/** One message as text; null for one with nothing to say (only reasoning, an empty step). */
const messageText = (message: ChatMessage) => {
  const lines = message.parts.flatMap((p) => {
    const text = partText(p);
    return text === null ? [] : [text];
  });
  if (lines.length === 0) {
    return null;
  }
  const who = message.role === "user" ? "User" : "Assistant";
  return `${who}:\n${lines.join("\n")}`;
};

/**
 * The conversation to compact, as text blocks — the earlier summary (if any) first, then a block per message after
 * it — and how many messages it covers.
 */
export const transcriptOf = (messages: ChatMessage[]) => {
  const from = lastCompaction(messages);
  const earlier = from === -1 ? null : summaryOf(messages[from] as ChatMessage);
  const blocks = messages.slice(from + 1).flatMap((m) => {
    if (m.role === "system") {
      return [];
    }
    const text = messageText(m);
    return text === null ? [] : [text];
  });
  return { blocks, earlier };
};

/**
 * The blocks in parts that each fit `maxChars` (a block bigger than that goes alone, clipped): the service model
 * reads a long chat a part at a time, carrying the summary so far into the next part.
 */
export const chunksOf = (blocks: string[], maxChars: number) => {
  const chunks: string[] = [];
  let current: string[] = [];
  let size = 0;
  for (const block of blocks) {
    const text = clip(block, maxChars);
    if (size + text.length > maxChars && current.length > 0) {
      chunks.push(current.join("\n\n"));
      current = [];
      size = 0;
    }
    current.push(text);
    size += text.length + 2;
  }
  if (current.length > 0) {
    chunks.push(current.join("\n\n"));
  }
  return chunks;
};

/**
 * The summary's sections by name in the user's language: the card shows the summary as it is, and a model told
 * «a heading in the same language» copied the English names it was given.
 */
const SECTIONS = {
  en: [
    "Goal",
    "What was found",
    "What worked",
    "Agreed",
    "How to answer",
    "The user's messages",
    "Open",
  ],
  ru: [
    "Цель",
    "Что нашли",
    "Что сработало",
    "Договорились",
    "Как отвечать",
    "Сообщения пользователя",
    "Что осталось",
  ],
} as const;

const languageOf = (locale: string) => {
  try {
    return (
      new Intl.DisplayNames(["en"], { type: "language" }).of(locale) ?? locale
    );
  } catch {
    return locale;
  }
};

/**
 * The service model's task, after Claude Code's compaction prompt, for a work chat: the assistant goes on from this
 * summary alone, so nothing it needs may be lost and nothing may be made up.
 */
export const compactInstructions = (locale: string) => {
  const titles = SECTIONS[locale === "ru" ? "ru" : "en"];
  const [goal, found, worked, agreed, answer, messages, open] = titles;
  return [
    "You compact a long work conversation between a user and an AI assistant. The assistant will continue the conversation from your summary alone — it will not see the messages you summarize.",
    `Write in ${languageOf(locale)}. Be specific and complete: keep every number, date, period, amount, unit, name and source exactly as it appears; keep the exact queries, tool names and parameters that produced data; never invent or round anything.`,
    "Use these sections, each as a `## ` heading with exactly the title given, followed by short bullet points; leave out a section with nothing to say:",
    `1. ${goal} — what the user is trying to achieve.`,
    `2. ${found} — facts and data with their numbers, periods and units, and where each came from (which service or tool).`,
    `3. ${worked} — the exact queries, tools and parameters that gave the data; what failed and why, in a few words.`,
    `4. ${agreed} — decisions, choices and constraints the user set.`,
    `5. ${answer} — the user's preferences on format, tone, units and length.`,
    `6. ${messages} — every message of the user, one line each, in order.`,
    `7. ${open} — what is unfinished, or was asked last and not yet done.`,
    "Answer with the summary only, in markdown, at most about 1200 words. Do not call tools.",
  ].join("\n");
};

/** The user turn the service model gets: the summary so far (if any) and the next part of the conversation. */
export const compactPrompt = (part: string, earlier: string | null) =>
  earlier
    ? `<summary-so-far>\n${earlier}\n</summary-so-far>\n\n<conversation-continues>\n${part}\n</conversation-continues>\n\nWrite the updated summary of the whole conversation.`
    : `<conversation>\n${part}\n</conversation>\n\nWrite the summary.`;

/** What the chat model is told in place of everything up to the compaction. */
export const summaryForModel = (summary: string) =>
  `<conversation-summary>\nThe earlier part of this conversation was compacted. This is its summary; continue from it — the details it keeps are reliable, and anything it leaves out can be asked for or fetched again.\n\n${summary}\n</conversation-summary>`;
