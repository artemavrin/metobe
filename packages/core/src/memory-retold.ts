import { z } from "zod";

import type { OpenCommitment } from "./memory-extract";

// An assistant's answer that retells what a tool read (Г1.6а, MEMORY-PLAN §7.1): «Ольга прислала договор — письмо
// пришло вчера». What it may do is the «пересказ ассистента» row of the table of voices (§5.2): settle an open
// commitment as «ждёт проверки», nothing else — no new record, no «выполнено», no «отменено». It is read by a call of
// its own, after the person's message: the writer's prompt stays word for word as S13 measured it, and the call can
// only answer which open commitments the answer shows done. No database here.

/** Longer answers are cut: what a tool showed is said in the first lines. */
export const RETOLD_MAX = 2000;

/** The chat's tools that read something outside: the mail, the web. Every MCP tool is a reading one too. */
const READING_TOOLS = new Set([
  "email_search",
  "email_read",
  "web_search",
  "web_fetch",
]);

/** What of a message part this needs: its type, the text, a tool's name and state. */
export interface AnswerPart {
  type: string;
  text?: string;
  toolName?: string;
  state?: string;
}

const readsOutside = (part: AnswerPart) => {
  if (part.state !== "output-available") {
    return false;
  }
  if (part.type === "dynamic-tool") {
    return true;
  }
  return part.type.startsWith("tool-") && READING_TOOLS.has(part.type.slice(5));
};

/**
 * The answer's words, when it retells what a reading tool returned: the text after the first such result, cut at
 * `RETOLD_MAX`. Null — no tool read anything, or nothing was said after it (advice, a plan, the memory's own tools
 * and the widgets do not count).
 */
export const retoldOf = (parts: AnswerPart[]) => {
  const first = parts.findIndex(readsOutside);
  if (first === -1) {
    return null;
  }
  const text = parts
    .slice(first + 1)
    .flatMap((p) =>
      p.type === "text" && p.text?.trim() ? [p.text.trim()] : []
    )
    .join("\n")
    .trim();
  return text ? text.slice(0, RETOLD_MAX) : null;
};

export const retoldSchema = z.object({
  settled: z
    .array(
      z.object({
        evidence: z
          .string()
          .describe(
            "The words of the answer that say it is done, as written there"
          ),
        ref: z.string().describe("An open commitment's ref: «k2»"),
      })
    )
    .describe(
      "Open commitments the answer shows done by the one who owes them; empty for almost every answer"
    ),
});
export type Retold = z.infer<typeof retoldSchema>;

export const RETOLD_INSTRUCTIONS = `You check one answer of a work assistant against a list of open commitments. The assistant looked something up with a tool — the user's mail, a business system, the web — and <answer> retells what it found.
Put a commitment in settled only when the answer states, as something the tool showed, that the one who owes it has done exactly that: the letter with the signed contract came, the invoice is paid, the report is in the system. Copy the words that say so into evidence.
Leave it out when the answer only plans, advises, guesses or asks («стоит напомнить», «наверное, ещё не прислала», «могу проверить»), when it found something partial, something else or nothing («договор ещё на согласовании», «писем от Ольги нет»), or when it is not clear which commitment it is. When in doubt, leave it out — the user can always say it is done.`;

/** What the call reads: the open commitments, the person's request and the answer. */
export const retoldPrompt = ({
  commitments,
  message,
  retold,
  today,
}: {
  commitments: OpenCommitment[];
  message: string;
  retold: string;
  /** «14 November 2026 (2026-11-14)». */
  today: string;
}) =>
  [
    `Today is ${today}.`,
    "",
    "Open commitments (ref: text):",
    ...commitments.map((c) => `- ${c.ref}: ${c.text}`),
    "",
    `<request>\n${message}\n</request>`,
    `<answer>\n${retold}\n</answer>`,
  ].join("\n");

/**
 * The statuses the answer may set: «ждёт проверки», only on a commitment still open — one already said to be done
 * stays as it is, and so does one the person's own words settle (`taken`). Unknown refs are dropped.
 */
export const retoldStatuses = (
  answer: Retold,
  commitments: OpenCommitment[],
  taken: ReadonlySet<string> = new Set()
) => {
  const byRef = new Map(commitments.map((c) => [c.ref, c]));
  const out = new Map<string, { recordId: string; status: "unconfirmed" }>();
  for (const s of answer.settled) {
    const c = byRef.get(s.ref.trim());
    if (c && c.status === "open" && !taken.has(c.id) && s.evidence.trim()) {
      out.set(c.id, { recordId: c.id, status: "unconfirmed" });
    }
  }
  return [...out.values()];
};
