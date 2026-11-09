import { describe, expect, it } from "vitest";

import {
  localMidnight,
  memoryInstructions,
  memoryPrompt,
  mentionsUser,
  planWrite,
} from "./memory-extract";
import type { Extraction, KnownCard, OpenCommitment } from "./memory-extract";

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
  important: false,
  interval_days: null,
  kind: "fact",
  role: null,
  rule_kind: null,
  text: "текст",
  when: null,
  working_days: null,
  ...over,
});

const OPEN: OpenCommitment[] = [
  {
    due: null,
    id: "00000000-0000-4000-8000-0000000000d1",
    ref: "k1",
    status: "open",
    text: "Андрей Смирнов пришлёт отчёт",
  },
  {
    due: null,
    id: "00000000-0000-4000-8000-0000000000d2",
    ref: "k2",
    status: "unconfirmed",
    text: "Ольга Ли подготовит API",
  },
];

const plan = (extraction: Partial<Extraction>, selfId: string | null = SELF) =>
  planWrite(
    {
      asks: [],
      items: [],
      leaves: [],
      new_entities: [],
      updates: [],
      ...extraction,
    },
    { cards, commitments: OPEN, selfId, timeZone: ZONE }
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
    expect(text).toContain("Open commitments (ref: text):\n- none");
  });

  it("lists open commitments with their deadline and whether someone said they are done", () => {
    const text = memoryInstructions({
      cards,
      commitments: [
        { ...OPEN[0], due: new Date("2026-11-16T21:00:00Z") } as OpenCommitment,
        OPEN[1] as OpenCommitment,
      ],
      sentAt: new Date("2026-11-09T09:00:00Z"),
      timeZone: ZONE,
    });
    expect(text).toContain(
      "- k1: Андрей Смирнов пришлёт отчёт (due 2026-11-17)"
    );
    expect(text).toContain(
      "- k2: Ольга Ли подготовит API (said to be done, not confirmed)"
    );
  });
});

describe("memoryPrompt", () => {
  it("is the message alone when nothing came before", () => {
    expect(memoryPrompt("андрей передумал")).toBe(
      "<message>\nандрей передумал\n</message>"
    );
  });

  it("puts the exchange before the message, cut short", () => {
    const prompt = memoryPrompt("Ланьшин, встречи не будет", {
      assistant: `Какой Андрей передумал?${" ещё".repeat(1000)}`,
      user: "андрей передумал",
    });
    expect(
      prompt.startsWith(
        "<context>\nUser: андрей передумал\nAssistant: Какой Андрей передумал?"
      )
    ).toBe(true);
    expect(
      prompt.endsWith(
        "</context>\n<message>\nЛаньшин, встречи не будет\n</message>"
      )
    ).toBe(true);
    expect(prompt.length).toBeLessThan(2200);
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

  it("settles open commitments by ref, once each, and only when the status changes", () => {
    const { statuses } = plan({
      updates: [
        { ref: "k1", status: "done" },
        { ref: "k1", status: "cancelled" },
        { ref: "k2", status: "unconfirmed" },
        { ref: "k9", status: "done" },
      ],
    });
    expect(statuses).toEqual([
      { recordId: "00000000-0000-4000-8000-0000000000d1", status: "done" },
    ]);
  });

  it("keeps a fact's role — who the card is now — and nothing else's", () => {
    const { records } = plan({
      items: [
        item({
          about: ["c1"],
          role: "тимлид бэкенда",
          text: "Андрей Смирнов теперь тимлид бэкенда",
        }),
        item({ about: ["c1"], kind: "event", role: "ещё", text: "Встреча" }),
      ],
    });
    expect(records[0]?.role).toBe("тимлид бэкенда");
    expect(records[1]).not.toHaveProperty("role");
  });

  it("keeps «важно» on a commitment only", () => {
    const { records } = plan({
      items: [
        item({
          creditor: "c1",
          debtor: "user",
          important: true,
          kind: "commitment",
          text: "Отправить Андрею Смирнову смету — горит",
        }),
        item({
          about: ["c1"],
          important: true,
          text: "Андрей Смирнов в отпуске",
        }),
      ],
    });
    expect(records[0]?.important).toBe(true);
    expect(records[1]).not.toHaveProperty("important");
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

  it("keeps a rule's period when «Не упустить» can count by it (ARCH §19.6)", () => {
    const { records } = plan({
      items: [
        item({
          about: ["c1"],
          interval_days: 14,
          kind: "rule",
          rule_kind: "rhythm",
          text: "Один на один с Андреем Смирновым раз в две недели",
        }),
        item({
          interval_days: 5,
          kind: "rule",
          rule_kind: "wait",
          text: "Ответа от контрагентов ждём пять рабочих дней",
          working_days: true,
        }),
        item({
          interval_days: 7,
          kind: "rule",
          rule_kind: "other",
          text: "Каждую неделю присылай сводку",
        }),
        item({
          interval_days: 0,
          kind: "rule",
          rule_kind: "rhythm",
          text: "Видеться почаще",
        }),
        // A period on what is not a rule is not kept.
        item({
          interval_days: 3,
          kind: "fact",
          rule_kind: "wait",
          text: "факт",
        }),
      ],
    });
    expect(records.map((r) => r.rule ?? null)).toEqual([
      { days: 14, kind: "rhythm", workingDays: false },
      { days: 5, kind: "wait", workingDays: true },
      null,
      null,
      null,
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

describe("planWrite: groups (ARCH §19)", () => {
  const TEAM = "33333333-3333-4333-8333-333333333333";
  const groupCards: KnownCard[] = [
    ...cards,
    {
      aliases: [],
      id: TEAM,
      kind: "group",
      members: ["c1"],
      name: "Моя команда",
      ref: "g1",
      role: null,
    },
  ];
  const membership = {
    closedByWrite: null,
    deletedAt: null,
    doneAt: null,
    dueAt: null,
    entities: [
      { entityId: ANDREY, role: "about" as const },
      { entityId: TEAM, role: "group" as const },
    ],
    givenAt: null,
    id: "00000000-0000-4000-8000-0000000000f1",
    important: false,
    kind: "fact" as const,
    occurredAt: null,
    occurredPrecision: null,
    recordedAt: new Date("2026-11-01T00:00:00Z"),
    role: null,
    rule: null,
    status: null,
    supersededAt: null,
    text: "Андрей Смирнов в моей команде",
    validFrom: null,
    validTo: null,
    writeId: null,
  };
  const groupPlan = (extraction: Partial<Extraction>) =>
    planWrite(
      {
        asks: [],
        items: [],
        leaves: [],
        new_entities: [],
        updates: [],
        ...extraction,
      },
      { cards: groupCards, facts: [membership], selfId: SELF, timeZone: ZONE }
    );

  it("puts a person in a known group, and in a new one", () => {
    const known = groupPlan({
      items: [
        item({ about: ["new_pavel", "g1"], text: "Павел в моей команде" }),
      ],
      new_entities: [
        { about: "", id: "new_pavel", kind: "person", name: "Павел" },
      ],
    });
    expect(known.records[0]?.entities).toEqual([
      { newRef: "new_pavel", role: "about" },
      { entityId: TEAM, role: "group" },
    ]);
    const fresh = groupPlan({
      items: [
        item({
          about: ["c1", "new_sales"],
          text: "Андрей Смирнов в отделе продаж",
        }),
      ],
      new_entities: [
        { about: "", id: "new_sales", kind: "group", name: "Отдел продаж" },
      ],
    });
    expect(fresh.entities).toEqual([
      { kind: "group", name: "Отдел продаж", ref: "new_sales", role: null },
    ]);
    expect(fresh.records[0]?.entities).toEqual([
      { entityId: ANDREY, role: "about" },
      { newRef: "new_sales", role: "group" },
    ]);
  });

  it("keeps a group as a rule's subject, not its people", () => {
    const { records } = groupPlan({
      items: [
        item({
          about: ["g1"],
          interval_days: 14,
          kind: "rule",
          rule_kind: "rhythm",
          text: "С каждым из моей команды раз в две недели",
        }),
      ],
    });
    expect(records[0]?.entities).toEqual([{ entityId: TEAM, role: "subject" }]);
  });

  it("ends the membership of who left, and nothing for a ref to nothing", () => {
    expect(groupPlan({ leaves: [{ group: "g1", person: "c1" }] }).ends).toEqual(
      [membership.id]
    );
    expect(groupPlan({ leaves: [{ group: "g1", person: "c2" }] }).ends).toEqual(
      []
    );
    expect(groupPlan({ leaves: [{ group: "c2", person: "c1" }] }).ends).toEqual(
      []
    );
  });
});

describe("mentionsUser", () => {
  it("sees the user in any ref", () => {
    expect(
      mentionsUser({
        asks: [],
        items: [item({ about: ["c1"] })],
        leaves: [],
        new_entities: [],
        updates: [],
      })
    ).toBe(false);
    expect(
      mentionsUser({
        asks: [],
        items: [item({ debtor: "user" })],
        leaves: [],
        new_entities: [],
        updates: [],
      })
    ).toBe(true);
  });
});
