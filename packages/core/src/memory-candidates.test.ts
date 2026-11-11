import { describe, expect, it } from "vitest";

import type { MemoryEntity, MemoryRecord } from "./memory";
import {
  MAX_CANDIDATES,
  candidateCards,
  candidateCommitments,
  candidateKnown,
  likelySame,
  mentionedCards,
} from "./memory-candidates";

const NOW = new Date("2026-11-09T09:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const card = (
  id: string,
  name: string,
  kind: MemoryEntity["kind"] = "person",
  role: string | null = null
): MemoryEntity => ({
  aliases: [],
  createdAt: NOW,
  email: null,
  id,
  kind,
  name,
  phone: null,
  role,
  updatedAt: NOW,
});

const record = (
  id: string,
  over: Partial<MemoryRecord> & Pick<MemoryRecord, "kind" | "text">
): MemoryRecord => ({
  closedByWrite: null,
  deletedAt: null,
  doneAt: null,
  dueAt: null,
  entities: [],
  givenAt: null,
  id,
  important: false,
  occurredAt: null,
  occurredPrecision: null,
  recordedAt: daysAgo(60),
  role: null,
  rule: null,
  status: null,
  supersededAt: null,
  supersededBy: null,
  validFrom: null,
  validTo: null,
  writeId: null,
  ...over,
});

const promise = (
  id: string,
  text: string,
  sides: [debtor: string, creditor: string],
  over: Partial<MemoryRecord> = {}
) =>
  record(id, {
    entities: [
      { entityId: sides[0], role: "debtor" },
      { entityId: sides[1], role: "creditor" },
    ],
    kind: "commitment",
    status: "open",
    text,
    ...over,
  });

const SELF = card("me", "Я", "self");
const FILLER = Array.from({ length: 300 }, (_, i) =>
  card(`p${i}`, `Сотрудник${i} Номер${i}`)
);
const CARDS = [
  SELF,
  card("olga", "Ольга Ли", "person", "менеджер в «Альфа-Логистике»"),
  card("andrey", "Андрей Ковалёв", "person", "закупщик в ООО «Вектор»"),
  card("vector", "ООО «Вектор»", "org", "поставщик оборудования"),
  card("team", "Моя команда", "group"),
  card("pavel", "Павел Гуров"),
  ...FILLER,
];

const ids = (cards: { id: string }[]) => cards.map((c) => c.id);
/** The pick for a text in a memory without records. */
const pickIn = (entities: MemoryEntity[], text: string) =>
  ids(candidateCards({ entities, now: NOW, records: [], text }));

describe("the cards the «Память» model is shown (ARCH §19.8.3)", () => {
  it("shows a memory of forty cards or fewer whole, the named ones first", () => {
    const small = [
      SELF,
      card("olga", "Ольга Ли"),
      card("pavel", "Павел Гуров"),
      card("boss", "Виктор Ильин", "person", "шеф"),
    ];
    const found = candidateCards({
      entities: small,
      now: NOW,
      records: [],
      text: "Шеф просил позвонить Павлу",
    });
    expect(ids(found)).toEqual(["pavel", "olga", "boss"]);
  });

  it("knows a short name and a name that loses a vowel", () => {
    expect(pickIn(CARDS, "Написал Павлу и Оле")).toEqual([
      "olga",
      "pavel",
      "team",
    ]);
    const people = [
      ...FILLER,
      card("sasha", "Саша Котов"),
      card("lev", "Лев Орлов"),
      card("alex", "Александра Белова"),
    ];
    expect(pickIn(people, "Отправил Льву отчёт")).toEqual(["lev"]);
    expect(pickIn(people, "Александр согласовал")).toEqual(["sasha", "alex"]);
    expect(pickIn(people, "Шура согласовала")).toEqual(["sasha", "alex"]);
    expect(pickIn(people, "Над этим работает отдел, люди любой темы")).toEqual(
      []
    );
  });

  it("names one by a declined name, and every group, out of three hundred", () => {
    const found = candidateCards({
      entities: CARDS,
      now: NOW,
      records: [],
      text: "Созвонился с Ольгой",
    });
    expect(ids(found)).toEqual(["olga", "team"]);
  });

  it("takes a name declined, not a name that only starts the same", () => {
    const entities = [
      card("marina", "Марина Орлова"),
      card("maria", "Мария Орлова"),
      card("andrey", "Андрей Ковалёв"),
    ];
    const named = (text: string) => ids(mentionedCards(entities, text));
    expect(named("Мы с Мариной договорились")).toEqual(["marina"]);
    expect(named("Марии нет на месте")).toEqual(["maria"]);
    expect(named("Созвонился с Андреем и Ковалёвым")).toEqual(["andrey"]);
    expect(named("Орловы приедут вдвоём")).toEqual(["marina", "maria"]);
  });

  it("finds one by a word of its role and never the person's own card", () => {
    const found = candidateCards({
      entities: CARDS,
      now: NOW,
      records: [],
      text: "Закупщик обещал прислать счёт, поставщик молчит",
    });
    expect(ids(found)).toEqual(["team", "andrey", "vector"]);
  });

  it("brings the cards of the last two weeks for «он», ten at most, newest first", () => {
    const records = [
      record("old", {
        entities: [{ entityId: "olga", role: "about" }],
        kind: "fact",
        recordedAt: daysAgo(20),
        text: "старое",
      }),
      ...FILLER.slice(0, 12).map((c, i) =>
        record(`r${i}`, {
          entities: [{ entityId: c.id, role: "about" }],
          kind: "event",
          recordedAt: daysAgo(12 - i),
          text: "событие",
        })
      ),
      record("mine", {
        entities: [
          { entityId: "pavel", role: "about" },
          { entityId: "me", role: "about" },
        ],
        kind: "event",
        recordedAt: daysAgo(0),
        text: "созвон",
      }),
    ];
    const found = candidateCards({
      entities: CARDS,
      now: NOW,
      records,
      text: "он уже прислал",
    });
    expect(ids(found)).toEqual([
      "team",
      "pavel",
      "p11",
      "p10",
      "p9",
      "p8",
      "p7",
      "p6",
      "p5",
      "p4",
      "p3",
    ]);
  });

  it("keeps the named ones first when there are more than forty", () => {
    const text = FILLER.slice(0, 50)
      .map((c) => c.name)
      .join(", ");
    const found = candidateCards({
      entities: CARDS,
      now: NOW,
      records: [],
      text,
    });
    expect(found).toHaveLength(MAX_CANDIDATES);
    expect(found.every((c) => c.id.startsWith("p"))).toBe(true);
  });
});

const pick = (records: MemoryRecord[], cards: MemoryEntity[], text = "") =>
  ids(candidateCommitments({ cards, now: NOW, records, selfId: "me", text }));

describe("the promises the «Память» model is shown (ARCH §19.8.3)", () => {
  it("takes the open ones of a candidate, the nearest deadline first, none closed", () => {
    const records = [
      promise("late", "Ольга пришлёт акт", ["olga", "me"]),
      promise("soon", "Ольга пришлёт договор", ["olga", "me"], {
        dueAt: daysAgo(-3),
      }),
      promise("done", "Ольга пришлёт счёт", ["olga", "me"], { status: "done" }),
      promise("other", "Павел пришлёт прайс", ["pavel", "andrey"]),
    ];
    expect(pick(records, [CARDS[1] as MemoryEntity])).toEqual(["soon", "late"]);
  });

  it("takes the person's own given in the last 30 days, whoever the other side is", () => {
    const records = [
      promise("fresh", "Отправить отчёт", ["me", "p1"], {
        givenAt: daysAgo(5),
      }),
      promise("stale", "Отправить смету", ["me", "p2"], {
        givenAt: daysAgo(40),
      }),
    ];
    expect(pick(records, [])).toEqual(["fresh"]);
  });

  it("finds one by a long word of its text, not by a month or a short word", () => {
    const records = [
      promise(
        "price",
        "Павел Гуров пришлёт прайс до 13 ноября",
        ["pavel", "me"],
        {
          givenAt: daysAgo(40),
        }
      ),
      promise("act", "Сергей пришлёт акт до 20 ноября", ["p3", "me"], {
        givenAt: daysAgo(40),
      }),
    ];
    expect(pick(records, [], "Прайсы получили, он прислал")).toEqual(["price"]);
    expect(pick(records, [], "Всё будет к 20 ноября")).toEqual([]);
  });

  it("puts a named card's promises before forty that only share a word", () => {
    const records = [
      ...FILLER.slice(0, 50).map((c, i) =>
        promise(`f${i}`, "Подготовить отчёт", ["me", c.id], {
          dueAt: daysAgo(-i),
          givenAt: daysAgo(40),
        })
      ),
      promise("act", "Отправить акт", ["me", "pavel"], {
        givenAt: daysAgo(40),
      }),
    ];
    const found = pick(
      records,
      [CARDS[5] as MemoryEntity],
      "Отчёт готов, акт Павлу отправил"
    );
    expect(found).toHaveLength(MAX_CANDIDATES);
    expect(found[0]).toBe("act");
  });
});

const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);
const pairs = (cards: MemoryEntity[], dismissed: string[] = []) =>
  likelySame(cards, new Set(dismissed), pairKey).map(
    (p) => `${p.keep.id}<${p.gone.id}`
  );

/** A record about one card. */
const about = (id: string) => [{ entityId: id, role: "about" as const }];

describe("the facts and events a new item may replace (ARCH §19.9.3)", () => {
  const andrey = card("a", "Андрей Смирнов");
  const sklad = card("s", "«Склад 2.0»", "project");
  const team = card("g", "Моя команда", "group");
  const self = card("me", "Проверка", "self");
  const known = (records: MemoryRecord[], cards = [andrey, sklad]) =>
    candidateKnown({
      cards,
      entities: [andrey, sklad, team, self],
      now: NOW,
      records,
      selfId: self.id,
    });

  it("gives the facts that hold and no others, f1…, the cards in the order given", () => {
    const list = known(
      [
        record("f-a", {
          entities: about("a"),
          kind: "fact",
          text: "Андрей — разработчик",
          validFrom: daysAgo(30),
        }),
        record("f-s", {
          entities: about("s"),
          kind: "fact",
          text: "Склад в тестировании",
          validFrom: daysAgo(5),
        }),
        record("f-old", {
          entities: about("a"),
          kind: "fact",
          text: "Андрей — стажёр",
          validTo: daysAgo(30),
        }),
        record("f-me", {
          entities: about("me"),
          kind: "fact",
          text: "Развиваю команду",
        }),
        record("assessment", {
          entities: about("a"),
          kind: "assessment",
          text: "Надёжный",
        }),
      ],
      [sklad, andrey]
    );
    expect(list.map((k) => [k.ref, k.text])).toEqual([
      ["f1", "Склад в тестировании"],
      ["f2", "Андрей — разработчик"],
      ["f3", "Развиваю команду"],
    ]);
    expect(list[0]).toMatchObject({
      entityIds: ["s"],
      id: "f-s",
      kind: "fact",
    });
  });

  it("leaves out who is in a group — that is for «ушёл из команды» — and five a card, thirty in all", () => {
    const members = record("m", {
      entities: [...about("a"), ...about("g")],
      kind: "fact",
      text: "Андрей — в команде",
    });
    const many = Array.from({ length: 8 }, (_, i) =>
      record(`f${i}`, {
        entities: about("a"),
        kind: "fact",
        text: `факт ${i}`,
        validFrom: daysAgo(i),
      })
    );
    const list = known([members, ...many]);
    expect(list.map((k) => k.id)).toEqual(["f0", "f1", "f2", "f3", "f4"]);
    const cards = Array.from({ length: 10 }, (_, i) =>
      card(`c${i}`, `Карточка ${i}`)
    );
    const lots = candidateKnown({
      cards,
      entities: cards,
      now: NOW,
      records: cards.flatMap((c, ci) =>
        Array.from({ length: 5 }, (_, i) =>
          record(`${c.id}-${i}`, {
            entities: about(c.id),
            kind: "fact",
            text: `${ci}/${i}`,
          })
        )
      ),
      selfId: null,
    });
    expect(lots).toHaveLength(30);
  });

  it("gives the events of the cards from the last week on, the nearest to today first", () => {
    const at = (id: string, d: number, who = "a") =>
      record(id, {
        entities: about(who),
        kind: "event",
        occurredAt: daysAgo(d),
        text: id,
      });
    const list = known([
      at("soon", -2),
      at("yesterday", 1),
      at("week-ago", 6),
      at("month-ago", 30),
      at("later", -20),
      at("someone-else", -1, "other"),
      record("no-day", {
        entities: about("a"),
        kind: "event",
        text: "без даты",
      }),
    ]);
    expect(list.map((k) => [k.ref, k.id])).toEqual([
      ["e1", "yesterday"],
      ["e2", "soon"],
      ["e3", "week-ago"],
      ["e4", "later"],
    ]);
    expect(list[1]?.on).toEqual(daysAgo(-2));
  });
});

describe("«Один человек?» (ARCH §19.8.5)", () => {
  it("offers a name within another, keeping the longer", () => {
    expect(pairs([card("olga", "Ольга"), card("olga-li", "Ольга Ли")])).toEqual(
      ["olga-li<olga"]
    );
    expect(
      pairs([card("v1", "ООО «Вектор»", "org"), card("v2", "Вектор", "org")])
    ).toEqual(["v1<v2"]);
    expect(pairs([card("a", "Ольга Ли"), card("b", "Ольга Ли")])).toEqual([
      "a<b",
    ]);
  });

  it("offers a short name with its full one", () => {
    expect(pairs([card("a", "Оля"), card("b", "Ольга Ли")])).toEqual(["b<a"]);
    expect(
      pairs([card("a", "Саша Котов"), card("b", "Александр Котов")])
    ).toEqual(["a<b"]);
    expect(
      pairs([card("a", "Саша Котов"), card("b", "Алексей Котов")])
    ).toEqual([]);
  });

  it("offers a surname with an initial or the names swapped", () => {
    expect(
      pairs([card("a", "Андрей Ковалёв"), card("b", "А. Ковалёв")])
    ).toEqual(["a<b"]);
    expect(
      pairs([card("a", "Андрей Ковалёв"), card("b", "Ковалёв Андрей")])
    ).toEqual(["a<b"]);
  });

  it("does not offer namesakes, other kinds or a pair said to be different", () => {
    expect(
      pairs([card("a", "Андрей Смирнов"), card("b", "Алексей Смирнов")])
    ).toEqual([]);
    expect(pairs([card("a", "Ольга Ли"), card("b", "Ольга Петрова")])).toEqual(
      []
    );
    expect(
      pairs([card("a", "Марина Орлова"), card("b", "Мария Орлова")])
    ).toEqual([]);
    expect(
      pairs([card("a", "Склад", "project"), card("b", "Склад", "org")])
    ).toEqual([]);
    expect(
      pairs(
        [card("olga", "Ольга"), card("olga-li", "Ольга Ли")],
        ["olga:olga-li"]
      )
    ).toEqual([]);
  });

  it("offers three at most", () => {
    const many = ["Ли", "Петрова", "Сидорова", "Котова"].map((s) =>
      card(s, `Ольга ${s}`)
    );
    expect(pairs([card("olga", "Ольга"), ...many])).toHaveLength(3);
  });
});
