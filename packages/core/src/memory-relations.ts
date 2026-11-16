import type { Experimental_EvaluationQuestion } from "ai";

import type { MemoryWritePlan } from "./memory";
import type { KnownRecord } from "./memory-extract";

// «Заменяет ли новое старое» (ARCH §19.9.3): the «Память» model names what a new fact or event replaces (`replaces`,
// checked by `planWrite`). Before it stands, a decision model is asked about that pair — replaces, adds, restates,
// unrelated — and only a sure «replaces» keeps it; anything else leaves the new record beside the old. It is the
// check of a model that is cheap, quick and calibrated on a model that is not any of these: a weaker writer puts the
// card's first fact into `replaces` for a message that only adds (S15, part 3). Free of the DB: S15 runs it.

type Planned = MemoryWritePlan["records"][number];

/** The question, English like the gate's: the message is Russian, the language of the question did not matter (S13). */
export const RELATION_QUESTIONS = {
  relation: {
    criteria: {
      adds: "Both are true: the new statement adds something beside the old one.",
      replaces:
        "The new statement says the old one is no longer true or has changed: a new stage, a new position, a meeting moved or cancelled, a correction.",
      restates: "The new statement says the same as the old one.",
      unrelated: "They are about different things.",
    },
    instructions:
      "How does the new statement stand to the old record? Read the message the new statement comes from.",
    type: "choice",
  },
} as const satisfies Record<string, Experimental_EvaluationQuestion>;

/**
 * How sure «replaces» has to be. In S13 the answers at 0.9 and over of the decision models were not wrong once;
 * a wrong replacement ends a true fact or sets aside a true event, a missed one only leaves a double.
 */
export const REPLACE_MIN = 0.9;

/** A new record of the plan (by its place in `plan.records`) and an old one it may take the place of. */
export interface RelationPair {
  index: number;
  old: KnownRecord;
}

/** What a decision model answers to the question above: the choice and the probability of each. */
export interface RelationAnswer {
  choice?: string;
  probabilities?: Record<string, number>;
}

/**
 * The pairs to ask about: each new record that says it replaces an old one, with that old one. A `replaces` that is not
 * one of the old records shown has been dropped by `planWrite` already, so every pair here is a claim of the writer.
 */
export const claimedPairs = (
  records: Planned[],
  known: KnownRecord[]
): RelationPair[] =>
  records.flatMap((r, index) => {
    const old = r.replaces ? known.find((k) => k.id === r.replaces) : undefined;
    return old ? [{ index, old }] : [];
  });

/** A day as the person has it: `2026-11-20`, in their zone — the midnights of the records are theirs. */
const dayOf = (at: Date | null | undefined, timeZone: string) =>
  at ? new Intl.DateTimeFormat("en-CA", { timeZone }).format(at) : undefined;

/**
 * The days of a pair, when the records have them: a fact — since when, an event — when. A writer that says «Встреча
 * с «Вектором»» and puts 20 November in the field, not the words, gives the decision model nothing to tell a moved
 * meeting from a second one without them (live check: 0.85 «replaces» without, 1.0 with).
 */
export const pairDays = (
  record: Planned,
  old: KnownRecord,
  timeZone: string
) => ({
  next: dayOf(record.occurred?.at ?? record.validFrom, timeZone),
  old: dayOf(old.on, timeZone),
});

/** What the decision model reads about a pair: the message, the new statement, the old record, and their days. */
export const relationState = (
  message: string,
  next: string,
  old: string,
  days: { next?: string; old?: string } = {}
) => ({
  message,
  new: next,
  ...(days.next ? { newDay: days.next } : {}),
  old,
  ...(days.old ? { oldDay: days.old } : {}),
});

/**
 * The plan's records with the replacements the decision model did not confirm taken off: a record keeps `replaces` only
 * on a sure «replaces» — then it ends or sets aside the old one — and lies beside the old one otherwise. A pair with no
 * answer (no decision model, or the call failed) is the writer's word, as before.
 */
export const withConfirmed = (
  records: Planned[],
  pairs: RelationPair[],
  answers: (RelationAnswer | undefined)[]
): Planned[] => {
  const refused = new Set(
    pairs.flatMap((pair, i) => {
      const answer = answers[i];
      if (!answer) {
        return [];
      }
      const p =
        answer.choice === "replaces"
          ? (answer.probabilities?.replaces ?? 0)
          : 0;
      return p >= REPLACE_MIN ? [] : [pair.index];
    })
  );
  return records.map((r, i) => {
    if (!refused.has(i)) {
      return r;
    }
    const { replaces: _refused, ...rest } = r;
    return rest;
  });
};
