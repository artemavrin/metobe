import type { Extraction } from "./memory-extract";

// What words may change, by who says them (И1, MEMORY-PLAN §5.2) — one table for every source, kept by the code on the
// writer's answer, so a slip of the model is not written. Each item and each update says whose words it comes from
// (`from`); the code trusts that only as far as the material allows it — a label of a voice that is not in the
// material falls back to the voice that is.
//
//   the person's own words (`user`)      — everything;
//   someone else's (`other`: a letter, a meeting's line, a forward or a paste) — their promises and requests, facts
//                                          about themselves; settling a commitment — only «ждёт проверки»; no
//                                          assessment and no rule: those are the person's alone;
//   the assistant's retelling (`answer`) — only «ждёт проверки» on an open commitment; no records.
//
// No database here.

export type Voice = "user" | "other" | "answer";

/** Which voices the material has. */
export interface Voices {
  /** The person's own words. */
  owner: boolean;
  /** Someone else's: a quote, a forward, a letter, a meeting's line. */
  others: boolean;
  /** The assistant's answer that retells what a tool found. */
  answer: boolean;
}

/** Kinds only the person sets: their own judgement of someone, and their standing rules. */
const OWNER_ONLY = new Set(["assessment", "rule"]);

/** The voice to go by: the model's label when the material has that voice, else the material's own. */
export const voiceOf = (from: Voice | undefined, voices: Voices): Voice => {
  if (from === "answer" && voices.answer) {
    return "answer";
  }
  if (from === "other" && voices.others) {
    return "other";
  }
  if (from === "user" && voices.owner) {
    return "user";
  }
  return voices.owner ? "user" : "other";
};

/** The writer's answer as the voices of the material allow it. */
export const limitByVoice = (
  extraction: Extraction,
  voices: Voices
): Extraction => ({
  ...extraction,
  items: extraction.items.filter((item) => {
    const voice = voiceOf(item.from, voices);
    return (
      voice === "user" || (voice === "other" && !OWNER_ONLY.has(item.kind))
    );
  }),
  updates: extraction.updates.flatMap((u) => {
    const voice = voiceOf(u.from, voices);
    if (voice === "user") {
      return [u];
    }
    if (voice === "answer" && u.status === "cancelled") {
      return [];
    }
    return [{ ...u, status: u.status === "done" ? "unconfirmed" : u.status }];
  }),
});
