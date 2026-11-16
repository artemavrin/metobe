import { describe, expect, it } from "vitest";

import {
  chatContext,
  localMidnight,
  memoryInstructions,
  memoryPrompt,
  mentionsUser,
  noteTurn,
  onCard,
  asksReminder,
  planWrite,
  repeatsDate,
  splitQuoted,
} from "./memory-extract";
import type {
  ChatTurn,
  Extraction,
  KnownCard,
  KnownRecord,
  OpenCommitment,
} from "./memory-extract";

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

/** «No time», as the model says it. */
const NO_TIME = { date: "", precision: "none" } as const;

const item = (
  over: Partial<Extraction["items"][number]>
): Extraction["items"][number] => ({
  about: [],
  creditor: null,
  debtor: null,
  due: NO_TIME,
  from: "user",
  important: false,
  interval_days: 0,
  kind: "fact",
  remind: "none",
  repeat: "none",
  repeat_on: [],
  replaces: "",
  role: null,
  rule_kind: null,
  text: "текст",
  when: NO_TIME,
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

const plan = (
  extraction: Partial<Extraction>,
  selfId: string | null = SELF,
  knownRecords: KnownRecord[] = []
) =>
  planWrite(
    {
      asks: [],
      items: [],
      leaves: [],
      moves: [],
      new_entities: [],
      updates: [],
      ...extraction,
    },
    { cards, commitments: OPEN, knownRecords, selfId, timeZone: ZONE }
  );

/** The facts and events shown to the model: Андрей's stage and a meeting with him, Ковалёв's role. */
const KNOWN: KnownRecord[] = [
  {
    entityIds: [ANDREY],
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    kind: "fact",
    on: new Date("2026-10-02T00:00:00Z"),
    ref: "f1",
    text: "Андрей Смирнов на испытательном сроке",
  },
  {
    entityIds: [KOVALEV],
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    kind: "fact",
    on: null,
    ref: "f2",
    text: "Андрей Ковалёв — менеджер по закупкам",
  },
  {
    entityIds: [ANDREY],
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    kind: "event",
    on: new Date("2026-11-11T00:00:00Z"),
    ref: "e1",
    text: "Встреча с Андреем Смирновым в среду",
  },
];

/** The deadlines a message moves, as the plan has them. */
const moveOf = (moves: Extraction["moves"], extra: Partial<Extraction> = {}) =>
  plan({ moves, ...extra }).dues;

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

describe("the block of what a new item may replace (ARCH §19.9.3)", () => {
  const at = new Date("2026-11-09T09:00:00Z");
  const base = { cards, sentAt: at, timeZone: ZONE };

  it("is not in the prompt without facts or events, nor the rules for it — S13 was measured without them", () => {
    const text = memoryInstructions(base);
    expect(text).not.toContain("Current facts and coming events");
    expect(text).not.toContain("replaces");
    expect(text).not.toContain("moves");
  });

  it("lists each fact and event with its day and the cards it is about, and adds the rule", () => {
    const text = memoryInstructions({ ...base, known: KNOWN });
    expect(text).toContain(
      "- f1: Андрей Смирнов на испытательном сроке (since 2026-10-02; about c1)"
    );
    expect(text).toContain(
      "- e1: Встреча с Андреем Смирновым в среду (on 2026-11-11; about c1)"
    );
    // A record about no shown card says no card.
    expect(
      memoryInstructions({
        ...base,
        known: [{ ...(KNOWN[1] as KnownRecord), entityIds: ["somebody"] }],
      })
    ).toContain("- f2: Андрей Ковалёв — менеджер по закупкам\n");
    expect(text).toContain("`replaces` is «none» for almost every item");
    expect(text).toContain("points at the same cards (about)");
  });

  it("adds the rule on deadlines only with open commitments listed", () => {
    expect(memoryInstructions(base)).not.toContain("moves");
    expect(memoryInstructions({ ...base, commitments: OPEN })).toContain(
      "put it in moves"
    );
  });
});

describe("memoryPrompt", () => {
  it("is the message alone when nothing came before", () => {
    expect(memoryPrompt("андрей передумал")).toBe(
      "<message>\nандрей передумал\n</message>"
    );
  });

  it("puts the chat before the message, the nearest last", () => {
    const prompt = memoryPrompt("он уже прислал", [
      { role: "user", text: "Созвонился с Павлом Гуровым" },
      { role: "assistant", text: "Как прошло?" },
      { role: "user", text: "Павел обещал прайс к пятнице" },
      { role: "assistant", text: "Понял." },
    ]);
    expect(prompt).toBe(
      "<context>\nUser: Созвонился с Павлом Гуровым\nAssistant: Как прошло?\nUser: Павел обещал прайс к пятнице\nAssistant: Понял.\n</context>\n<message>\nон уже прислал\n</message>"
    );
  });
});

const turn = (role: ChatTurn["role"], text: string): ChatTurn => ({
  role,
  text,
});

describe("splitQuoted", () => {
  it("leaves a message without quotes as it is", () => {
    expect(splitQuoted("Тема простая: созвонились с Ольгой")).toEqual({
      own: "Тема простая: созвонились с Ольгой",
      quoted: "",
    });
    expect(memoryPrompt("Ольга прислала договор")).toBe(
      "<message>\nОльга прислала договор\n</message>"
    );
  });

  it("takes lines with «>» out, the reply stays the person's", () => {
    expect(
      splitQuoted("> Мы подготовим договор к пятнице\n> Ольга\nОк, жду.")
    ).toEqual({
      own: "Ок, жду.",
      quoted: "Мы подготовим договор к пятнице\nОльга",
    });
  });

  it("takes everything from a forwarding line on", () => {
    const { own, quoted } = splitQuoted(
      "Глянь, что пишут\n---------- Пересланное сообщение ----------\nМы отгрузим до 20-го."
    );
    expect(own).toBe("Глянь, что пишут");
    expect(quoted).toBe(
      "---------- Пересланное сообщение ----------\nМы отгрузим до 20-го."
    );
    expect(splitQuoted("-----Original Message-----\nWe will send it").own).toBe(
      ""
    );
  });

  it("starts a letter at two headers in a row, not at one", () => {
    const { own, quoted } = splitQuoted(
      "Письмо от Вектора\n\nОт: Андрей Ковалёв\nТема: Поставка\n\nМы обязуемся отгрузить."
    );
    expect(own).toBe("Письмо от Вектора");
    expect(quoted.startsWith("От: Андрей Ковалёв")).toBe(true);
    expect(splitQuoted("Тема: перенос встречи на четверг").quoted).toBe("");
  });

  it("adds the rule on someone else's text only for a message with a quote", () => {
    const args = {
      cards: [],
      sentAt: new Date("2026-11-09T09:00:00Z"),
      timeZone: "Europe/Moscow",
    };
    expect(memoryInstructions(args)).not.toContain("<quoted>");
    expect(memoryInstructions({ ...args, quoted: true })).toContain(
      "someone else's text inside <quoted>"
    );
  });

  it("gives the model the person's words and the quote apart", () => {
    expect(memoryPrompt("> Я сделаю API к среде\nОк")).toBe(
      "<message>\n<user>\nОк\n</user>\n<quoted>\nЯ сделаю API к среде\n</quoted>\n</message>"
    );
  });
});

describe("chatContext", () => {
  it("keeps the last six messages", () => {
    const turns = Array.from({ length: 9 }, (_, i) =>
      turn(i % 2 ? "assistant" : "user", `m${i}`)
    );
    expect(chatContext(turns).map((t) => t.text)).toEqual([
      "m3",
      "m4",
      "m5",
      "m6",
      "m7",
      "m8",
    ]);
  });

  it("cuts an answer to 800 characters and the person's message not at all", () => {
    const [user, answer] = chatContext([
      turn("user", "у".repeat(1200)),
      turn("assistant", "а".repeat(3000)),
    ]);
    expect(user?.text).toHaveLength(1200);
    expect(answer?.text).toHaveLength(800);
  });

  it("stops at 4000 characters, the far end dropped first, the nearest cut to fit", () => {
    const kept = chatContext([
      turn("user", "старое"),
      turn("user", "п".repeat(3500)),
      turn("assistant", "о".repeat(300)),
      turn("user", "н".repeat(300)),
    ]);
    expect(kept.map((t) => t.text.length)).toEqual([3400, 300, 300]);
    expect(kept.map((t) => t.text[0])).toEqual(["п", "о", "н"]);
    expect(chatContext([turn("user", "д".repeat(9000))])[0]?.text).toHaveLength(
      4000
    );
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
        { from: "user", ref: "k1", status: "done" },
        { from: "user", ref: "k1", status: "cancelled" },
        { from: "user", ref: "k2", status: "unconfirmed" },
        { from: "user", ref: "k9", status: "done" },
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

  it("lets a new fact or event replace a shown one, and checks it in code (ARCH §19.9.3)", () => {
    const { records } = plan(
      {
        items: [
          item({
            about: ["c1"],
            replaces: "f1",
            text: "Андрей Смирнов прошёл испытательный срок",
          }),
          item({
            about: ["c1"],
            kind: "event",
            replaces: "e1",
            text: "Встреча с Андреем Смирновым в четверг",
          }),
        ],
      },
      SELF,
      KNOWN
    );
    expect(records.map((r) => r.replaces)).toEqual([
      KNOWN[0]?.id,
      KNOWN[2]?.id,
    ]);
  });

  it("drops a replacement the code cannot vouch for — the record stays beside the old one", () => {
    const refused = (items: Parameters<typeof plan>[0]["items"]) =>
      plan({ items }, SELF, KNOWN).records.map((r) => r.replaces);
    // «none» — the model's way to say it replaces nothing; a ref that was not shown, a fact asked to replace an
    // event, a card the two do not share.
    expect(refused([item({ about: ["c1"], replaces: "none" })])).toEqual([
      undefined,
    ]);
    expect(refused([item({ about: ["c1"], replaces: "f9" })])).toEqual([
      undefined,
    ]);
    expect(refused([item({ about: ["c1"], replaces: "e1" })])).toEqual([
      undefined,
    ]);
    expect(refused([item({ about: ["c1"], replaces: "f2" })])).toEqual([
      undefined,
    ]);
    // Only the first of two takes an old one; an item that is not a fact or event keeps nothing of it.
    expect(
      refused([
        item({ about: ["c1"], replaces: "f1", text: "а" }),
        item({ about: ["c1"], replaces: "f1", text: "б" }),
        item({ about: ["c1"], kind: "assessment", replaces: "f1", text: "в" }),
      ])
    ).toEqual([KNOWN[0]?.id, undefined, undefined]);
    // Nothing shown, nothing to replace.
    expect(
      plan({ items: [item({ about: ["c1"], replaces: "f1" })] }).records[0]
    ).not.toHaveProperty("replaces");
  });

  it("does not let a record that waits for a question replace anything", () => {
    const { drafts, records } = plan(
      {
        asks: [
          {
            candidates: ["c1", "c2"],
            id: "ask:andrey",
            name: "Андрей",
            question: "Какой Андрей?",
          },
        ],
        items: [
          item({
            about: ["ask:andrey"],
            replaces: "f1",
            text: "Андрей теперь тимлид",
          }),
        ],
      },
      SELF,
      KNOWN
    );
    expect(records).toEqual([]);
    expect(drafts[0]?.records[0]).not.toHaveProperty("replaces");
  });

  it("moves a commitment's deadline once, to a real other day", () => {
    const to = { date: "2026-11-16", precision: "day" } as const;
    expect(moveOf([{ due: to, ref: "k1" }])).toEqual([
      { dueAt: new Date("2026-11-15T21:00:00Z"), recordId: OPEN[0]?.id },
    ]);
    // A ref to nothing, no day, a second word on the same one, one the message settles too.
    expect(moveOf([{ due: to, ref: "k9" }])).toEqual([]);
    expect(moveOf([{ due: NO_TIME, ref: "k1" }])).toEqual([]);
    expect(
      moveOf([
        { due: to, ref: "k1" },
        { due: { date: "2026-11-20", precision: "day" }, ref: "k1" },
      ])
    ).toHaveLength(1);
    expect(
      moveOf([{ due: to, ref: "k1" }], {
        updates: [{ from: "user", ref: "k1", status: "done" }],
      })
    ).toEqual([]);
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
    // A rhythm is a schedule (D45); a wait stays a rule.
    expect(records.map((r) => [r.kind, r.rule ?? r.schedule ?? null])).toEqual([
      ["schedule", { days: 14, kind: "rhythm", workingDays: false }],
      ["rule", { days: 5, kind: "wait", workingDays: true }],
      ["rule", null],
      ["rule", null],
      ["fact", null],
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
    schedule: null,
    status: null,
    supersededAt: null,
    supersededBy: null,
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
        moves: [],
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

  it("keeps «пн, ср, пт» as a week on those days, starting on the first time after the message", () => {
    const { records } = planWrite(
      {
        asks: [],
        items: [
          item({
            debtor: "user",
            due: { date: "2026-11-16", precision: "day" },
            kind: "commitment",
            remind: "09:58",
            repeat: "week",
            repeat_on: ["mon", "wed", "fri"],
            text: "Созвон с командой по текущим делам",
          }),
        ],
        leaves: [],
        moves: [],
        new_entities: [],
        updates: [],
      },
      {
        cards,
        commitments: OPEN,
        selfId: SELF,
        // Monday 16 November, 10:00 in Moscow: Monday's 9:58 has passed.
        sentAt: new Date("2026-11-16T07:00:00Z"),
        timeZone: ZONE,
      }
    );
    expect(records[0]?.schedule).toEqual({
      at: new Date("2026-11-18T06:58:00Z"),
      days: [1, 3, 5],
      kind: "reminder",
      repeat: "week",
    });
  });

  it("keeps «напомни» of the person's own as a reminder alone, and one about a promise to someone with it (D45)", () => {
    const due = { date: "2026-11-12", precision: "day" } as const;
    const { records } = plan({
      items: [
        item({
          about: ["c1"],
          debtor: "user",
          due,
          kind: "commitment",
          remind: "15:00",
          repeat: "week",
          text: "Позвонить Андрею",
        }),
        item({
          creditor: "c1",
          debtor: "user",
          due,
          kind: "commitment",
          remind: "10:00",
          text: "Отправить Андрею договор",
        }),
      ],
    });
    expect(records.map((r) => r.kind)).toEqual(["schedule", "commitment"]);
    expect(records[0]?.schedule).toMatchObject({
      kind: "reminder",
      repeat: "week",
    });
    expect(records[0]?.entities.map((l) => l.role)).toEqual(["about"]);
    expect(records[0]?.dueAt).toBeUndefined();
    expect(records[1]?.remind?.at).toBeInstanceOf(Date);
    expect(records[1]?.dueAt).toBeInstanceOf(Date);
  });

  it("turns «remind me at a time» into the moment on the promise's day, in the person's zone", () => {
    const due = { date: "2026-11-12", precision: "day" } as const;
    const { records } = plan({
      items: [
        item({
          debtor: "user",
          due,
          kind: "commitment",
          remind: "15:00",
          text: "Позвонить Ольге",
        }),
        item({
          debtor: "user",
          due,
          kind: "commitment",
          remind: "morning",
          text: "Отчёт",
        }),
        item({
          debtor: "user",
          due,
          kind: "commitment",
          remind: "none",
          repeat_on: [],
          text: "Без напоминания",
        }),
        item({
          debtor: "user",
          due,
          kind: "commitment",
          remind: "25:00",
          text: "Не время",
        }),
        item({
          debtor: "user",
          due,
          kind: "commitment",
          remind: "7:5",
          text: "Не время 2",
        }),
        // No day for the promise: there is nothing to remind on.
        item({
          debtor: "user",
          kind: "commitment",
          remind: "15:00",
          text: "Без дня",
        }),
        // Only a promise is reminded of.
        item({ due, kind: "fact", remind: "15:00", text: "Факт" }),
      ],
    });
    // The person's own one is a reminder alone (D45); one about a promise to someone goes with the promise.
    const remindAt = (r: (typeof records)[number]) =>
      r.remind?.at ??
      (r.schedule?.kind === "reminder" ? r.schedule.at : undefined);
    expect(records.map((r) => remindAt(r)?.toISOString() ?? null)).toEqual([
      "2026-11-12T12:00:00.000Z",
      "2026-11-12T06:00:00.000Z",
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("offers the rule on reminders only to a message that asks for one, with the local time", () => {
    const args = {
      cards: [],
      sentAt: new Date("2026-11-09T11:05:00Z"),
      timeZone: "Europe/Moscow",
    };
    expect(memoryInstructions(args)).not.toContain("asks to be reminded");
    const text = memoryInstructions({ ...args, reminding: true });
    expect(text).toContain("asks to be reminded");
    expect(text).toContain("It is 14:05 now");
    for (const said of [
      "Напомни мне завтра в 15:00 позвонить",
      "напоминай про отчёт",
      "Remind me on Friday",
    ]) {
      expect(asksReminder(said)).toBe(true);
    }
    expect(asksReminder("Ольга обещала договор к пятнице")).toBe(false);
  });

  it("keeps a day that comes again as a schedule standing on its day (ARCH §19.8.7, D45)", () => {
    const { records } = plan({
      items: [
        item({
          about: ["c1"],
          kind: "rule",
          repeat: "year",
          rule_kind: "date",
          text: "У Андрея Смирнова день рождения 14 ноября",
          when: { date: "2026-11-14", precision: "day" },
        }),
        item({
          kind: "rule",
          repeat: "week",
          rule_kind: "date",
          text: "Отчёт каждую пятницу",
          when: { date: "2026-11-13", precision: "day" },
        }),
        // No day, or no repeat, or only a month: it is not a day that comes again.
        item({
          kind: "rule",
          repeat: "year",
          rule_kind: "date",
          text: "День рождения когда-то",
        }),
        item({
          kind: "rule",
          remind: "none",
          repeat: "none",
          repeat_on: [],
          rule_kind: "date",
          text: "Встреча 14 ноября",
          when: { date: "2026-11-14", precision: "day" },
        }),
        item({
          kind: "rule",
          repeat: "month",
          rule_kind: "date",
          text: "Платим в ноябре",
          when: { date: "2026-11-01", precision: "month" },
        }),
      ],
    });
    expect(
      records.map((r) => [r.schedule ?? null, r.occurred?.precision ?? null])
    ).toEqual([
      [{ kind: "date", repeat: "year" }, "day"],
      [{ kind: "date", repeat: "week" }, "day"],
      [null, null],
      [null, null],
      [null, null],
    ]);
  });

  it("offers the rule on days that come again only to a message that may name one", () => {
    const args = {
      cards: [],
      sentAt: new Date("2026-11-09T09:00:00Z"),
      timeZone: "Europe/Moscow",
    };
    expect(memoryInstructions(args)).not.toContain("a day that comes again");
    expect(memoryInstructions({ ...args, repeating: true })).toContain(
      "a day that comes again"
    );
    for (const text of [
      "У Ольги день рождения 14 ноября",
      "Отчёт нужен каждую пятницу",
      "Платим аренду раз в месяц",
      "Stand-up every Monday",
    ]) {
      expect(repeatsDate(text)).toBe(true);
    }
    for (const text of [
      "Ольга обещала договор к пятнице",
      "Созвонились с Андреем вчера",
    ]) {
      expect(repeatsDate(text)).toBe(false);
    }
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
        moves: [],
        new_entities: [],
        updates: [],
      })
    ).toBe(false);
    expect(
      mentionsUser({
        asks: [],
        items: [item({ debtor: "user" })],
        leaves: [],
        moves: [],
        new_entities: [],
        updates: [],
      })
    ).toBe(true);
  });
});

describe("an item's time (ARCH §19.4)", () => {
  it("takes «no time» said outright, and a dated «none», as no date", () => {
    const { records } = plan({
      items: [
        item({ kind: "event", text: "Созвон", when: NO_TIME }),
        item({
          kind: "event",
          text: "Встреча",
          when: { date: "2026-11-20", precision: "none" },
        }),
        item({
          kind: "event",
          text: "Подписание",
          when: { date: "2026-11-03", precision: "day" },
        }),
      ],
    });
    expect(records.map((r) => r.occurred?.precision ?? null)).toEqual([
      null,
      null,
      "day",
    ]);
  });
});

/** A planned record with these links, for `onCard`. */
const record = (
  kind: "fact" | "event" | "commitment",
  entities: {
    entityId: string;
    role: "about" | "participant" | "debtor" | "creditor";
  }[]
) => ({
  entities,
  important: false,
  kind,
  text: "…",
});

describe("a note typed on a card (P22)", () => {
  it("asks about the card before the note, as the question it answers", () => {
    expect(
      memoryPrompt("обещала прислать план к пятнице", [
        noteTurn({ name: "Ирина Белова", role: "заместитель" }),
      ])
    ).toBe(
      "<context>\nAssistant: What should I remember about Ирина Белова (заместитель)?\n</context>\n<message>\nобещала прислать план к пятнице\n</message>"
    );
  });

  it("puts a record naming no one but the person on the card", () => {
    const [event, promise, mine] = onCard(
      [
        record("event", [{ entityId: SELF, role: "participant" }]),
        record("commitment", []),
        record("commitment", [{ entityId: SELF, role: "debtor" }]),
      ],
      ANDREY,
      SELF
    );
    expect(event?.entities).toContainEqual({
      entityId: ANDREY,
      role: "participant",
    });
    expect(promise?.entities).toEqual([{ entityId: ANDREY, role: "debtor" }]);
    expect(mine?.entities).toContainEqual({
      entityId: ANDREY,
      role: "creditor",
    });
  });

  it("leaves a record naming someone else as the model read it", () => {
    const named = record("commitment", [
      { entityId: KOVALEV, role: "debtor" },
      { entityId: SELF, role: "creditor" },
    ]);
    expect(onCard([named], ANDREY, SELF)).toEqual([named]);
  });
});
