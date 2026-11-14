import type { MemoryCard, MemoryRecordView } from "@metobe/contracts/memory";
import { describe, expect, it, vi } from "vitest";

import type { MemoryEntity, MemoryRecord } from "./memory";
import { mentionedCards } from "./memory-candidates";
import {
  shownCard,
  shownPromises,
  standingParts,
  toldOfShown,
} from "./memory-read";

vi.mock("server-only", () => ({}));

const card = (
  name: string,
  kind: MemoryEntity["kind"] = "person",
  aliases: string[] = []
): MemoryEntity => ({
  aliases,
  createdAt: new Date(),
  email: null,
  id: name,
  kind,
  name,
  phone: null,
  role: null,
  type: null,
  updatedAt: new Date(),
});

const CARDS = [
  card("Ольга Ли"),
  card("Андрей Седов"),
  card("Андрей Ланьшин"),
  card("ООО «Вектор»", "org"),
  card("«Склад 2.0»", "project"),
  card("Игорь Белов", "person", ["Гоша"]),
  card("Проверка", "self"),
];

const names = (text: string) => mentionedCards(CARDS, text).map((c) => c.name);

describe("the cards a message mentions (ARCH §19.5)", () => {
  it("finds a name in any case", () => {
    expect(names("Напомни Ольге про договор")).toEqual(["Ольга Ли"]);
    expect(names("позвонить Седову")).toEqual(["Андрей Седов"]);
    expect(names("что там у Вектора?")).toEqual(["ООО «Вектор»"]);
    expect(names("как дела на складе")).toEqual(["«Склад 2.0»"]);
    expect(names("Гоша просил смету")).toEqual(["Игорь Белов"]);
  });

  it("gives every card a shared name fits, and nothing for short or unrelated words", () => {
    expect(names("Андрей передумал")).toEqual([
      "Андрей Седов",
      "Андрей Ланьшин",
    ]);
    // «ли» is a particle, not Ольга Ли; the person's own card is never «mentioned».
    expect(names("а ли не проверка ли это")).toEqual([]);
    expect(names("посчитай 15% от 240 тысяч")).toEqual([]);
  });
});

const OLGA_ID = "a1b2c3d4-0000-4000-8000-000000000001";

const promise = (
  n: number,
  patch: Partial<MemoryRecordView> = {}
): MemoryRecordView => ({
  chatId: null,
  deletedAt: null,
  doneAt: null,
  dueAt: null,
  entities: [
    { id: OLGA_ID, kind: "person", name: "Ольга Ли", role: "debtor" },
    { id: "self", kind: "self", name: "Я", role: "creditor" },
  ],
  fromChat: true,
  givenAt: null,
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  important: false,
  kind: "commitment",
  occurredAt: null,
  occurredPrecision: null,
  recordedAt: `2026-11-0${(n % 9) + 1}T10:00:00.000Z`,
  status: "open",
  supersededAt: null,
  text: `Прислать документ ${n}`,
  validFrom: null,
  validTo: null,
  ...patch,
});

const olga = (records: MemoryRecordView[]): MemoryCard => ({
  card: {
    aliases: [],
    email: null,
    id: OLGA_ID,
    kind: "person",
    name: "Ольга Ли",
    open: records.length,
    overdue: 0,
    phone: null,
    role: "Бухгалтер",
    type: null,
  },
  contact: { every: null, last: null },
  records,
});

describe("a card and the open promises in the answer (Д1)", () => {
  it("shows the open promises, the urgent first, and counts the rest", () => {
    const records = [
      ...Array.from({ length: 14 }, (_, i) =>
        promise(i + 1, { dueAt: `2026-11-${String(i + 10)}T00:00:00.000Z` })
      ),
      promise(90, { status: "done" }),
      promise(91, { dueAt: "2026-12-30T00:00:00.000Z", important: true }),
      promise(92, { kind: "fact", status: null }),
    ];
    const shown = shownCard(olga(records));
    expect(shown.found && shown.open).toHaveLength(12);
    expect(shown.found && shown.moreOpen).toBe(3);
    // «важно» goes first whatever its day; closed ones and facts are not here.
    expect(shown.found && shown.open[0]?.text).toBe("Прислать документ 91");
    expect(shown.found && shown.open.some((r) => r.status === "done")).toBe(
      false
    );
  });

  it("lists the promises with the day and the card it was asked about", () => {
    const shown = shownPromises([promise(1)], "2026-11-11", {
      id: OLGA_ID,
      name: "Ольга Ли",
    });
    expect(shown).toMatchObject({ more: 0, today: "2026-11-11" });
    expect(shown.records).toHaveLength(1);
  });

  it("tells the model the lines and that they are on screen, never a full id", () => {
    const told = toldOfShown(
      shownCard(olga([promise(1, { dueAt: "2026-11-14T00:00:00.000Z" })])),
      "Europe/Moscow"
    );
    expect(told.type).toBe("text");
    const text = String(told.value);
    expect(text).toContain("on screen");
    expect(text).toContain("Прислать документ 1");
    expect(text).toContain("[a1b2c3d4]");
    expect(text).not.toContain(OLGA_ID);
  });

  it("sends the model back to the user when a name fits several cards", () => {
    const told = toldOfShown(
      {
        candidates: [
          { id: "11111111", name: "Андрей Седов", role: null },
          { id: "22222222", name: "Андрей Ланьшин", role: null },
        ],
        found: false,
      },
      "Europe/Moscow"
    );
    expect(told.type).toBe("json");
    expect(JSON.stringify(told.value)).toContain("Ask the user which one");
  });

  it("says nothing is open when nothing is", () => {
    const told = toldOfShown(
      shownPromises([], "2026-11-11", null),
      "Europe/Moscow"
    );
    expect(String(told.value)).toContain("Nothing open.");
  });
});

const NOW = new Date("2026-11-14T09:00:00Z");
const TZ = "Europe/Moscow";
const ME = card("Я", "self");
const OLGA = card("Ольга Ли");
const SEDOV = card("Андрей Седов");
const VECTOR = card("ООО «Вектор»", "org");

let n = 0;
const record = (patch: Partial<MemoryRecord>): MemoryRecord => {
  n += 1;
  return {
    closedByWrite: null,
    deletedAt: null,
    doneAt: null,
    dueAt: null,
    entities: [],
    givenAt: null,
    id: `r${n}`,
    important: false,
    kind: "fact",
    occurredAt: null,
    occurredPrecision: null,
    recordedAt: NOW,
    remindAt: null,
    remindedAt: null,
    role: null,
    rule: null,
    status: null,
    supersededAt: null,
    supersededBy: null,
    text: `запись ${n}`,
    validFrom: null,
    validTo: null,
    writeId: null,
    ...patch,
  };
};
const owed = (text: string, due: string, patch: Partial<MemoryRecord> = {}) =>
  record({
    dueAt: new Date(due),
    entities: [
      { entityId: OLGA.id, role: "debtor" },
      { entityId: ME.id, role: "creditor" },
    ],
    kind: "commitment",
    status: "open",
    text,
    ...patch,
  });
const about = (id: string) => [{ entityId: id, role: "about" as const }];
const standing = (
  records: MemoryRecord[],
  entities = [ME, OLGA, SEDOV, VECTOR],
  skip: string[] = []
) =>
  standingParts({
    entities,
    now: NOW,
    records,
    skip: new Set(skip),
    timeZone: TZ,
  }).join("\n");

describe("what goes with every message (Г2.3)", () => {
  it("is nothing for an empty memory", () => {
    expect(standing([], [])).toBe("");
    expect(standing([])).toBe("");
  });

  it("gives the rules with no period, and not the ones «Не упустить» counts days by", () => {
    const text = standing([
      record({ kind: "rule", text: "В письма клиентам ставлю в копию Ирину" }),
      record({
        kind: "rule",
        rule: { days: 14, kind: "rhythm", workingDays: false },
        text: "С Ольгой — раз в две недели",
      }),
    ]);
    expect(text).toContain("How the user wants things done");
    expect(text).toContain("«В письма клиентам ставлю в копию Ирину»");
    expect(text).not.toContain("раз в две недели");
    // Rules only: no cards, no promises.
    expect(text).not.toContain("Due within a week");
  });

  it("gives what is overdue or due within a week, the important first, then the nearest", () => {
    const text = standing([
      owed("Прислать акт", "2026-11-16T21:00:00Z"),
      owed("Прислать договор", "2026-11-10T21:00:00Z"),
      owed("Прислать смету", "2026-11-20T21:00:00Z", { important: true }),
      owed("Прислать отчёт", "2026-11-25T21:00:00Z"),
      owed("Прислать NDA", "2026-11-01T21:00:00Z", { status: "done" }),
      record({ kind: "commitment", status: "open", text: "Без срока" }),
    ]);
    const lines = text.split("\n").filter((l) => l.includes("promise:"));
    expect(lines.map((l) => /«(?<text>.+?)»/u.exec(l)?.groups?.text)).toEqual([
      "Прислать смету",
      "Прислать договор",
      "Прислать акт",
    ]);
    expect(lines[1]).toMatch(/— overdue$/u);
    expect(lines[2]).not.toContain("overdue");
  });

  it("names the cards with the most of late, not the ones the message names nor the user", () => {
    const text = standing(
      [
        record({ entities: about(SEDOV.id) }),
        record({ entities: about(SEDOV.id) }),
        record({ entities: about(VECTOR.id) }),
        record({ entities: about(OLGA.id) }),
        record({ entities: about(ME.id) }),
        record({
          entities: about(OLGA.id),
          recordedAt: new Date("2026-09-01T00:00:00Z"),
        }),
      ],
      [ME, OLGA, SEDOV, VECTOR],
      [OLGA.id]
    );
    const [, main] = text.split("Who the user deals with most of late:\n");
    expect(main?.split("\n").map((l) => l.trim().split(" [")[0])).toEqual([
      "- Андрей Седов",
      "- ООО «Вектор»",
    ]);
  });

  it("keeps to about 600 tokens: the main cards go first, then the farthest promises", () => {
    const long = "очень длинное обещание ".repeat(10);
    const promises = Array.from({ length: 8 }, (_, i) =>
      owed(
        `${long}${i}`,
        `2026-11-${String(15 + i).padStart(2, "0")}T00:00:00Z`
      )
    );
    const many = Array.from({ length: 5 }, (_, i) =>
      card(`Карточка ${i}`, "person")
    );
    const text = standing(
      [
        ...promises,
        ...many.map((c) =>
          record({ entities: [{ entityId: c.id, role: "about" }] })
        ),
      ],
      [ME, OLGA, ...many]
    );
    expect(text.length).toBeLessThanOrEqual(1800);
    expect(text).not.toContain("Who the user deals with most");
    expect(text).toContain(`${long}0`);
    expect(text).not.toContain(`${long}7`);
  });
});
