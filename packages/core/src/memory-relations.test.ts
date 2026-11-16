import { describe, expect, it } from "vitest";

import type { MemoryWritePlan } from "./memory";
import type { KnownRecord } from "./memory-extract";
import {
  REPLACE_MIN,
  claimedPairs,
  pairDays,
  relationState,
  withConfirmed,
} from "./memory-relations";
import type { RelationAnswer } from "./memory-relations";

type Planned = MemoryWritePlan["records"][number];

const old = (
  id: string,
  kind: KnownRecord["kind"],
  entityIds: string[],
  text = id
): KnownRecord => ({ entityIds, id, kind, on: null, ref: id, text });

const fresh = (
  kind: Planned["kind"],
  text: string,
  cards: string[]
): Planned => ({
  entities: cards.map((entityId) => ({ entityId, role: "about" as const })),
  kind,
  text,
});

const KNOWN = [
  old("stage", "fact", ["sklad"], "«Склад 2.0» на этапе разработки"),
  old("role", "fact", ["andrey"], "Андрей — разработчик"),
  old("meeting", "event", ["vector"], "Встреча с «Вектором» в среду"),
  old("call", "event", ["olga"], "Созвон с Ольгой во вторник"),
];

const says = (
  replaces: number,
  rest: Record<string, number> = {}
): RelationAnswer => ({
  choice: "replaces",
  probabilities: { adds: 0, replaces, restates: 0, unrelated: 0, ...rest },
});

describe("the pairs the decision model is asked about (ARCH §19.9.3)", () => {
  it("pairs a new record with the old one it says it replaces — and no other", () => {
    const records = [
      {
        ...fresh("fact", "«Склад 2.0» в тестировании", ["sklad"]),
        replaces: "stage",
      },
      fresh("fact", "Андрей знает Go", ["andrey"]),
      {
        ...fresh("event", "Встреча с «Вектором» в четверг", ["vector"]),
        replaces: "meeting",
      },
      // Not among the old records shown: nothing to ask about.
      { ...fresh("event", "Созвон", ["olga"]), replaces: "gone" },
    ];
    expect(
      claimedPairs(records, KNOWN).map((p) => [p.index, p.old.id])
    ).toEqual([
      [0, "stage"],
      [2, "meeting"],
    ]);
  });

  it("gives the decision model the message and both statements, with their days when they have them", () => {
    expect(relationState("перенесли", "в четверг", "в среду")).toEqual({
      message: "перенесли",
      new: "в четверг",
      old: "в среду",
    });
    expect(
      relationState("перенесли", "Встреча", "Встреча", {
        next: "2026-11-20",
        old: "2026-11-18",
      })
    ).toEqual({
      message: "перенесли",
      new: "Встреча",
      newDay: "2026-11-20",
      old: "Встреча",
      oldDay: "2026-11-18",
    });
  });

  it("takes a record's day in the person's zone: the midnights are theirs", () => {
    const meeting: Planned = {
      ...fresh("event", "Встреча", ["vector"]),
      occurred: { at: new Date("2026-11-19T21:00:00Z"), precision: "day" },
    };
    const was = {
      ...KNOWN[2],
      on: new Date("2026-11-17T21:00:00Z"),
    } as KnownRecord;
    expect(pairDays(meeting, was, "Europe/Moscow")).toEqual({
      next: "2026-11-20",
      old: "2026-11-18",
    });
    // A fact has its start; a record with no day gives none.
    expect(
      pairDays(
        {
          ...fresh("fact", "Роль", ["andrey"]),
          validFrom: new Date("2026-11-10T00:00:00Z"),
        },
        KNOWN[1] as KnownRecord,
        "UTC"
      )
    ).toEqual({ next: "2026-11-10", old: undefined });
  });
});

describe("the replacements that stand (ARCH §19.9.3)", () => {
  const records: Planned[] = [
    {
      ...fresh("fact", "«Склад 2.0» в тестировании", ["sklad"]),
      replaces: "stage",
    },
    {
      ...fresh("event", "Встреча с «Вектором» в четверг", ["vector"]),
      replaces: "meeting",
    },
    fresh("fact", "Андрей знает Go", ["andrey"]),
  ];
  const pairs = claimedPairs(records, KNOWN);
  const replaces = (r: Planned[]) => r.map((x) => x.replaces);

  it("keeps a replacement only on a sure «replaces» — the threshold is the decision models' confident answers", () => {
    expect(REPLACE_MIN).toBe(0.9);
    expect(
      replaces(withConfirmed(records, pairs, [says(0.95), says(0.91)]))
    ).toEqual(["stage", "meeting", undefined]);
    // Not sure enough; sure, but of something else: the new record lies beside the old.
    expect(
      replaces(withConfirmed(records, pairs, [says(0.89), says(0.95)]))
    ).toEqual([undefined, "meeting", undefined]);
    expect(
      replaces(
        withConfirmed(records, pairs, [
          { choice: "adds", probabilities: { adds: 0.97, replaces: 0.02 } },
          { choice: "replaces" },
        ])
      )
    ).toEqual([undefined, undefined, undefined]);
  });

  it("leaves the writer's word where the decision model gave none, and the records that claim nothing", () => {
    expect(
      replaces(withConfirmed(records, pairs, [undefined, says(0.5)]))
    ).toEqual(["stage", undefined, undefined]);
    // The refused record keeps everything but the claim.
    const out = withConfirmed(records, pairs, [says(0.1), says(0.95)]);
    expect(out[0]).toEqual(
      fresh("fact", "«Склад 2.0» в тестировании", ["sklad"])
    );
    expect(out[2]).toBe(records[2]);
  });
});
