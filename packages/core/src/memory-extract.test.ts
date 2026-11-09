import { describe, expect, it } from "vitest";

import {
  localMidnight,
  memoryInstructions,
  mentionsUser,
  planWrite,
} from "./memory-extract";
import type { Extraction, KnownCard } from "./memory-extract";

const ZONE = "Europe/Moscow";
const ANDREY = "11111111-1111-4111-8111-111111111111";
const SELF = "99999999-9999-4999-8999-999999999999";
const KOVALEV = "22222222-2222-4222-8222-222222222222";
const cards: KnownCard[] = [
  {
    aliases: ["Андрюша"],
    id: ANDREY,
    kind: "person",
    name: "Андрей Смирнов",
    ref: "c1",
    role: "руководитель отдела продаж",
  },
  {
    aliases: [],
    id: KOVALEV,
    kind: "person",
    name: "Андрей Ковалёв",
    ref: "c2",
    role: "закупки",
  },
];

const item = (
  over: Partial<Extraction["items"][number]>
): Extraction["items"][number] => ({
  about: [],
  creditor: null,
  debtor: null,
  due: null,
  interval_days: null,
  kind: "fact",
  text: "текст",
  when: null,
  ...over,
});

const plan = (extraction: Partial<Extraction>, selfId: string | null = SELF) =>
  planWrite(
    { asks: [], items: [], new_entities: [], ...extraction },
    { cards, selfId, timeZone: ZONE }
  );

describe("localMidnight", () => {
  it("is the day's midnight in the zone", () => {
    expect(localMidnight("2026-11-09", ZONE)?.toISOString()).toBe(
      "2026-11-08T21:00:00.000Z"
    );
    expect(localMidnight("2026-11-09", "UTC")?.toISOString()).toBe(
      "2026-11-09T00:00:00.000Z"
    );
  });

  it("holds across a clock change", () => {
    // Berlin goes to summer time on 29 March 2026: the day before is +1, the day after +2.
    expect(localMidnight("2026-03-28", "Europe/Berlin")?.toISOString()).toBe(
      "2026-03-27T23:00:00.000Z"
    );
    expect(localMidnight("2026-03-30", "Europe/Berlin")?.toISOString()).toBe(
      "2026-03-29T22:00:00.000Z"
    );
  });

  it("refuses what is not a real day", () => {
    expect(localMidnight("2026-02-30", ZONE)).toBeNull();
    expect(localMidnight("9 ноября", ZONE)).toBeNull();
    expect(localMidnight("2026-11-9", ZONE)).toBeNull();
  });
});

describe("memoryInstructions", () => {
  it("counts today from the message, in the person's zone", () => {
    // 22:30 UTC on Sunday is already Monday in Moscow.
    const text = memoryInstructions({
      cards,
      sentAt: new Date("2026-11-08T22:30:00Z"),
      timeZone: ZONE,
    });
    expect(text).toContain("Today is Monday, 9 November 2026 (2026-11-09)");
    expect(text).toContain(
      "- c1: Андрей Смирнов (person; руководитель отдела продаж; also: Андрюша)"
    );
    expect(text).toContain("- user: the user themselves");
  });
});

describe("planWrite", () => {
  it("gives a commitment its sides, its day given and its deadline", () => {
    const { records } = plan({
      items: [
        item({
          about: ["c1", "user"],
          creditor: "user",
          debtor: "c1",
          due: { date: "2026-11-17", precision: "day" },
          kind: "commitment",
          text: "Андрей Смирнов пришлёт отчёт к 17 ноября",
          when: { date: "2026-11-03", precision: "day" },
        }),
      ],
    });
    expect(records).toEqual([
      {
        dueAt: new Date("2026-11-16T21:00:00Z"),
        entities: [
          { entityId: ANDREY, role: "debtor" },
          { entityId: SELF, role: "creditor" },
        ],
        givenAt: new Date("2026-11-02T21:00:00Z"),
        kind: "commitment",
        text: "Андрей Смирнов пришлёт отчёт к 17 ноября",
      },
    ]);
  });

  it("dates an event with its precision, and a fact by when it became true", () => {
    const { records } = plan({
      items: [
        item({
          about: ["c1", "user"],
          kind: "event",
          text: "Встреча с Андреем Смирновым на неделе 2 ноября",
          when: { date: "2026-11-04", precision: "week" },
        }),
        item({
          about: ["c1"],
          kind: "fact",
          text: "Андрей Смирнов руководит отделом продаж",
          when: { date: "2026-10-01", precision: "month" },
        }),
      ],
    });
    expect(records[0]).toMatchObject({
      entities: [
        { entityId: ANDREY, role: "participant" },
        { entityId: SELF, role: "participant" },
      ],
      occurred: { at: new Date("2026-11-03T21:00:00Z"), precision: "week" },
    });
    expect(records[1]).toMatchObject({
      entities: [{ entityId: ANDREY, role: "about" }],
      validFrom: new Date("2026-09-30T21:00:00Z"),
    });
    expect(records[1]).not.toHaveProperty("occurred");
  });

  it("makes new cards only for what a record points at", () => {
    const result = plan({
      items: [
        item({
          about: ["new:romashka"],
          kind: "fact",
          text: "ООО Ромашка — поставщик упаковки",
        }),
      ],
      new_entities: [
        {
          about: "поставщик упаковки",
          id: "new:romashka",
          kind: "organization",
          name: "ООО Ромашка",
        },
        {
          about: "упомянут мимоходом",
          id: "new:nobody",
          kind: "person",
          name: "Никто",
        },
      ],
    });
    expect(result.entities).toEqual([
      {
        kind: "org",
        name: "ООО Ромашка",
        ref: "new:romashka",
        role: "поставщик упаковки",
      },
    ]);
    expect(result.records[0]?.entities).toEqual([
      { newRef: "new:romashka", role: "about" },
    ]);
  });

  it("takes a «new» card named like a known one for the known one", () => {
    const result = plan({
      items: [item({ about: ["new:andrey"], text: "Андрюша в отпуске" })],
      new_entities: [
        { about: "", id: "new:andrey", kind: "person", name: "андрюша" },
      ],
    });
    expect(result.entities).toEqual([]);
    expect(result.records[0]?.entities).toEqual([
      { entityId: ANDREY, role: "about" },
    ]);
  });

  it("drops refs to nothing, empty texts and the user without a card", () => {
    const result = plan(
      {
        items: [
          item({ about: ["c7", "user"], text: "Ссылки в никуда" }),
          item({ text: "   " }),
        ],
      },
      null
    );
    expect(result.records).toEqual([
      { entities: [], kind: "fact", text: "Ссылки в никуда" },
    ]);
  });

  it("points a rule at its subject", () => {
    const { records } = plan({
      items: [
        item({
          about: ["c1"],
          interval_days: 14,
          kind: "rule",
          text: "Встреча один на один с Андреем Смирновым раз в две недели",
        }),
      ],
    });
    expect(records[0]?.entities).toEqual([
      { entityId: ANDREY, role: "subject" },
    ]);
  });
});

describe("planWrite: questions (P18)", () => {
  const ask = {
    candidates: ["c1", "c2"],
    id: "ask:andrey",
    name: "Андрей",
    question: "Какой Андрей уходит в отпуск 10 ноября?",
  };

  it("keeps what points at an unclear card for the person to answer", () => {
    const result = plan({
      asks: [ask],
      items: [
        item({
          about: ["ask:andrey"],
          kind: "fact",
          text: "Андрей в отпуске с 10 ноября",
        }),
        item({ about: ["c1"], kind: "fact", text: "Андрей Смирнов любит бег" }),
      ],
    });
    expect(result.records.map((r) => r.text)).toEqual([
      "Андрей Смирнов любит бег",
    ]);
    expect(result.drafts).toEqual([
      {
        candidates: [ANDREY, KOVALEV],
        name: "Андрей",
        question: "Какой Андрей уходит в отпуск 10 ноября?",
        records: [
          {
            entities: [{ ask: "ask:andrey", role: "about" }],
            kind: "fact",
            text: "Андрей в отпуске с 10 ноября",
          },
        ],
      },
    ]);
  });

  it("takes a question with one known card for that card, and drops one with none", () => {
    const one = plan({
      asks: [{ ...ask, candidates: ["c1", "c9"] }],
      items: [item({ about: ["ask:andrey"], text: "Андрей в отпуске" })],
    });
    expect(one.drafts).toEqual([]);
    expect(one.records[0]?.entities).toEqual([
      { entityId: ANDREY, role: "about" },
    ]);
    const none = plan({
      asks: [{ ...ask, candidates: ["c8", "c9"] }],
      items: [item({ about: ["ask:andrey"], text: "Андрей в отпуске" })],
    });
    expect(none.drafts).toEqual([]);
    expect(none.records[0]?.entities).toEqual([]);
  });

  it("makes the new cards a waiting record needs, and takes any id for a new card", () => {
    const result = plan({
      asks: [ask],
      items: [
        item({
          about: [],
          creditor: "new_natalya",
          debtor: "ask:andrey",
          kind: "commitment",
          text: "Андрей пришлёт Наталье акт",
        }),
      ],
      new_entities: [
        {
          about: "бухгалтерия",
          id: "new_natalya",
          kind: "person",
          name: "Наталья",
        },
      ],
    });
    expect(result.entities.map((e) => e.ref)).toEqual(["new_natalya"]);
    expect(result.drafts[0]?.records[0]?.entities).toEqual([
      { ask: "ask:andrey", role: "debtor" },
      { newRef: "new_natalya", role: "creditor" },
    ]);
  });
});

describe("mentionsUser", () => {
  it("sees the user in any ref", () => {
    expect(
      mentionsUser({
        asks: [],
        items: [item({ about: ["c1"] })],
        new_entities: [],
      })
    ).toBe(false);
    expect(
      mentionsUser({
        asks: [],
        items: [item({ debtor: "user" })],
        new_entities: [],
      })
    ).toBe(true);
  });
});
