import type { Experimental_EvaluationQuestion } from "ai";

import type { MemoryEntity, MemoryWritePlan } from "./memory";

// Cards of the person's own types (D42, ARCH §19.9.9): a bus, a contract, a pet. The writer names a mention that is no
// person, organization, project or group — a thing — and says what kind of thing it is in the person's word. Before a
// card is made, a decision model sorts it: a built-in kind after all, a type the person already has (by other words
// too: «машина 305» is a bus), a new type, or nothing worth a card («ноутбук», «отчёт»). The questions are those
// S15 part 6 measured (`pnpm types`: «карточка или нет» 153/153, built-in kinds 21/21, a new thing beside a type the
// person has 21–30 of 30). Free of the DB: S15 runs it.

type Plan = MemoryWritePlan;
type Fresh = Plan["entities"][number];

/** A type the person has: its word, and a few of its cards for the model to tell what it is by. */
export interface OwnType {
  word: string;
  cards: string[];
}

/** Cards shown to the decision model for each type. */
const SHOWN = 3;
/** Types shown at all: the person's most used. */
const MAX_TYPES = 12;

/** The person's own types, the most used first, each with up to three of its newest cards. */
export const ownTypes = (entities: MemoryEntity[]): OwnType[] => {
  const by = new Map<string, MemoryEntity[]>();
  for (const e of entities) {
    if (e.kind === "custom" && e.type) {
      by.set(e.type, [...(by.get(e.type) ?? []), e]);
    }
  }
  return (
    [...by]
      // oxlint-disable-next-line unicorn/no-array-sort -- sorts its own array
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, MAX_TYPES)
      .map(([word, cards]) => ({
        cards: cards
          // oxlint-disable-next-line unicorn/no-array-sort -- sorts its own copy
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, SHOWN)
          .map((c) => c.name),
        word,
      }))
  );
};

/** The answers' names for the person's types, in the order given: `own1`, `own2`… */
const ownKey = (i: number) => `own${i + 1}`;

/** The question for a mention: its type, with the person's types among the choices. */
export const typeQuestions = (own: OwnType[]) =>
  ({
    type: {
      // oxlint-disable-next-line eslint/sort-keys -- in the order S15 part 6 measured the question
      criteria: {
        person: "A person, by name or by what they are to the user",
        org: "A company, an institution, a sole trader — another organization",
        project: "A project: work with a goal and an end, named",
        group: "A group of people: a team, a department",
        ...Object.fromEntries(
          own.map((t, i) => [
            ownKey(i),
            `${t.word} — карточки: ${t.cards.map((c) => `«${c}»`).join(", ")}`,
          ])
        ),
        new: "A particular named or numbered thing the user will come back to, of a kind that is none of the above: a new type of card",
        none: "Not worth a card: a thing mentioned in passing, without a name or number of its own, or a kind in general, not a particular one",
      },
      instructions:
        "What type of card is the mention? A type the user already has fits only when the mention is one more thing of exactly that kind, whatever word the message uses for it. A thing that is merely related to a type (a route is not a bus, a licence is not a contract, a shop or a flat is not a building site) is a new type. An animal is not a person.",
      type: "choice",
    },
  }) as const satisfies Record<string, Experimental_EvaluationQuestion>;

/** What the decision model reads about a mention. */
export const typeState = (message: string, mention: string) => ({
  mention,
  message,
});

/** What a decision model answers: the choice of type with the probability of each. */
export interface TypeAnswers {
  type?: { choice?: string; probabilities?: Record<string, number> };
}

/** What becomes of a new thing: dropped (no card), another built-in kind, or a card of a type (the person's or new). */
export type TypeVerdict =
  | { drop: true }
  | { kind: "person" | "org" | "project" | "group" }
  | { type: string };

const BUILT_IN = new Set(["person", "org", "project", "group"]);

/** The verdict for one thing from the answers; null — no answer to go by (the writer's word stands). */
export const verdictOf = (
  thing: Fresh,
  answers: TypeAnswers | undefined,
  own: OwnType[]
): TypeVerdict | null => {
  const choice = answers?.type?.choice;
  if (!(answers && choice)) {
    return null;
  }
  // «Not a card» is a choice among the types — the way it was measured (0 mistakes of 153); a separate yes/no asked
  // beside it was wrong 11 times of 153 and is not asked.
  if (choice === "none") {
    return { drop: true };
  }
  if (BUILT_IN.has(choice)) {
    return { kind: choice as "person" };
  }
  const index = own.findIndex((_, i) => ownKey(i) === choice);
  if (index !== -1) {
    return { type: own[index]?.word ?? "" };
  }
  // A new type is the writer's word; none given — the card is of no known type, and lies among «Другое».
  return { type: thing.type ?? "" };
};

/** The things of a plan the decision model has to sort: new cards of kind `custom`. */
export const thingsOf = (entities: Fresh[]) =>
  entities.filter((e) => e.kind === "custom");

/**
 * The plan with the verdicts in it: a thing sorted as a built-in kind takes it; a dropped one is not made, its links
 * are taken off the records and a record left with no card at all goes with it — «ноутбук» never had a card; a type
 * is set on the card. A thing with no verdict stays as the writer named it.
 */
export const withTypes = (
  plan: Plan,
  verdicts: Map<string, TypeVerdict | null>
): Plan => {
  const dropped = new Set(
    [...verdicts].flatMap(([ref, v]) => (v && "drop" in v ? [ref] : []))
  );
  const strip = (records: Plan["records"]) =>
    records.flatMap((r) => {
      const entities = r.entities.filter(
        (l) => !("newRef" in l && dropped.has(l.newRef))
      );
      // It had cards and has none now: a record about nothing.
      return entities.length === 0 && r.entities.length > 0
        ? []
        : [{ ...r, entities }];
    });
  return {
    ...plan,
    drafts: plan.drafts.map((d) => ({ ...d, records: strip(d.records) })),
    entities: plan.entities.flatMap((e) => {
      const v = verdicts.get(e.ref);
      if (!v) {
        return [e];
      }
      if ("drop" in v) {
        return [];
      }
      if ("kind" in v) {
        const { type: _gone, ...rest } = e;
        return [{ ...rest, kind: v.kind, role: e.type ?? e.role ?? null }];
      }
      return [{ ...e, type: v.type || null }];
    }),
    records: strip(plan.records),
  };
};
