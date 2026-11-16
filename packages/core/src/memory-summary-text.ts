import type {
  MemorySummary,
  MemorySummaryLine,
} from "@metobe/contracts/memory";
import { z } from "zod";

import type { MemoryEntity, MemoryRecord } from "./memory";
import { day, lineOf } from "./memory-lines";

// A card's «Кратко» (Г2.1, MEMORY-PLAN §11): who they are, how to talk to them, what matters now — three short lists the
// «Память» model writes from the card's records. The model is trusted with wording and nothing else: every sentence
// names the records it stands on, and the code throws away a sentence that names none that exist. What can be counted
// (open promises, the last contact, «Надёжность») is counted by the page, not written here.

/** The least records of a card worth an account. */
export const MIN_RECORDS = 5;
/** Records the model is shown: the open and the current first. */
const MAX_RECORDS = 80;

const sentence = z.object({
  refs: z
    .array(z.string())
    .describe("The refs of the records the sentence rests on («r1», «r3»)"),
  text: z.string().describe("One short sentence"),
});

export const summarySchema = z.object({
  how: z
    .array(sentence)
    .describe(
      "Up to three sentences on how the user likes to work with them, only from the user's own views and what the records say about it. Empty if none do"
    ),
  now: z
    .array(sentence)
    .describe(
      "Up to three sentences on what matters now: what changed lately and what is coming — news, meetings, a change of role or stage. An open promise only when it is important or past its day: the page lists the open ones itself"
    ),
  who: z
    .array(sentence)
    .describe(
      "One or two sentences: who they are to the user — role, company, what they do. Empty if the records do not say"
    ),
});
export type SummaryOutput = z.infer<typeof summarySchema>;

export const SUMMARY_INSTRUCTIONS = `You write a short account of one person, organization or project the user works with — for the user to read before a conversation with them. You are given the records kept about them, each under a ref (r1, r2…).

Fill three lists: who (one or two sentences — who they are to the user), how (up to three — how the user likes to work with them), now (up to three — what matters now).

Rules:
- Every sentence names, in refs, the records it rests on. A sentence with no refs is thrown away, so do not write one.
- Say only what the records say. Add no judgement, guess, advice or reason of your own. «how» only from the user's own views and what the records say about working with them — if there are none, leave it empty.
- Write as a person who works with the user and knows these things: «Ольга обещала договор к пятнице», «вы ждёте от неё смету», «Андрей — разработчик бэкенда». Never name records, a memory, a list or refs in a sentence, and do not call a promise a «commitment» or «обязательство».
- Keep names and numbers exactly as the records have them. Write a date the way a person says it — «12 ноября», «в четверг» — never 2026-11-12, and leave the year out for this year. «the user» in a record is the person you write for: say «вы».
- A meeting or a deadline dated after <today> is ahead of the user, not past: «будет», «до», never «была». Write in the language of the records. A list the records give nothing for stays empty.`;

const order = (r: MemoryRecord) => {
  const open =
    r.kind === "commitment" &&
    (r.status === "open" || r.status === "unconfirmed");
  if (open) {
    return 0;
  }
  if (r.validTo || r.supersededAt || r.kind === "commitment") {
    return 4;
  }
  return r.kind === "event" ? 2 : 1;
};

/** The records the model is shown, in the order it reads them, each under its ref. */
export const summaryRecords = (records: MemoryRecord[]) =>
  records
    .filter((r) => !r.deletedAt && !r.supersededAt)
    // oxlint-disable-next-line unicorn/no-array-sort -- sorts the filter's own copy; toSorted is past the ES2022 target
    .sort(
      (a, b) =>
        order(a) - order(b) ||
        Number(b.important) - Number(a.important) ||
        b.recordedAt.getTime() - a.recordedAt.getTime()
    )
    .slice(0, MAX_RECORDS);

/** What the model is sent: the card and its records under refs; and the refs' meaning, for reading the answer. */
export const summaryPrompt = (
  card: MemoryEntity,
  records: MemoryRecord[],
  entities: MemoryEntity[],
  timeZone: string,
  now = new Date()
) => {
  const shown = summaryRecords(records);
  const names = new Map(entities.map((e) => [e.id, e]));
  const refs = new Map(shown.map((r, i) => [`r${i + 1}`, r.id]));
  const lines = shown.map((r, i) => `r${i + 1}: ${lineOf(r, names, timeZone)}`);
  const about = [card.kind === "org" ? "organization" : card.kind, card.role]
    .filter(Boolean)
    .join("; ");
  return {
    prompt: `<today>${day(now, timeZone)}</today>\n<card>${card.name} (${about})</card>\n<records>\n${lines.join("\n")}\n</records>`,
    refs,
  };
};

const MAX_SENTENCES = { how: 3, now: 3, who: 2 } as const;
const MAX_LENGTH = 320;

/**
 * What stands: a sentence keeps only the refs that are in the records shown (as their ids), and goes if none is left —
 * the account cannot say what no record says. A list is cut to its length.
 */
export const supported = (
  out: SummaryOutput,
  refs: ReadonlyMap<string, string>
) => {
  const keep = (
    list: SummaryOutput["who"],
    limit: number
  ): MemorySummaryLine[] =>
    list
      .flatMap((s) => {
        const ids = [
          ...new Set(
            s.refs.flatMap((ref) => {
              const id = refs.get(ref.trim().toLowerCase());
              return id ? [id] : [];
            })
          ),
        ];
        const text = s.text.trim();
        return ids.length > 0 && text && text.length <= MAX_LENGTH
          ? [{ records: ids, text }]
          : [];
      })
      .slice(0, limit);
  return {
    how: keep(out.how, MAX_SENTENCES.how),
    now: keep(out.now, MAX_SENTENCES.now),
    who: keep(out.who, MAX_SENTENCES.who),
  };
};

/** What an account says, still: a sentence whose records are gone (deleted, replaced) goes; a list can end up empty. */
export const stillTrue = (
  summary: Pick<MemorySummary, "how" | "now" | "who">,
  live: ReadonlySet<string>
) => {
  const keep = (list: MemorySummaryLine[]) =>
    list
      .map((s) => ({ ...s, records: s.records.filter((id) => live.has(id)) }))
      .filter((s) => s.records.length > 0);
  return {
    how: keep(summary.how),
    now: keep(summary.now),
    who: keep(summary.who),
  };
};

/** Newer records than the account covers, or a different number of them: it is out of date. */
export const isStale = (
  stored: { coversAt: Date; count: number },
  records: MemoryRecord[]
) => {
  const live = records.filter((r) => !r.deletedAt && !r.supersededAt);
  const newest = Math.max(0, ...live.map((r) => r.recordedAt.getTime()));
  return newest > stored.coversAt.getTime() || live.length !== stored.count;
};
