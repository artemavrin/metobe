import type { MemoryCard, MemoryRecordView } from "@metobe/contracts/memory";
import { describe, expect, it, vi } from "vitest";

import type { MemoryEntity } from "./memory";
import { mentionedCards } from "./memory-candidates";
import { shownCard, shownPromises, toldOfShown } from "./memory-read";

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
