import type { MemoryCard, MemoryRecordView } from "@metobe/contracts/memory";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./memory-page", () => ({
  memoryCard: vi.fn(),
  memoryOverview: vi.fn(),
}));

const { memoryMarkdown } = await import("./memory-export");

const OLGA = { id: "olga", kind: "person" as const, name: "Ольга Ли" };
const ME = { id: "self", kind: "self" as const, name: "Я" };

const record = (
  n: number,
  patch: Partial<MemoryRecordView> = {}
): MemoryRecordView => ({
  chatId: null,
  deletedAt: null,
  doneAt: null,
  dueAt: null,
  entities: [{ ...OLGA, role: "about" }],
  fromChat: true,
  givenAt: null,
  id: `r${n}`,
  important: false,
  kind: "fact",
  occurredAt: null,
  occurredPrecision: null,
  recordedAt: "2026-11-01T10:00:00.000Z",
  status: null,
  supersededAt: null,
  text: `запись ${n}`,
  validFrom: null,
  validTo: null,
  ...patch,
});

const card = (records: MemoryRecordView[]): MemoryCard => ({
  card: {
    aliases: ["Оля"],
    email: "olga@example.test",
    id: "olga",
    kind: "person",
    name: "Ольга Ли",
    open: 1,
    overdue: 0,
    phone: null,
    role: "Бухгалтер",
    type: null,
  },
  records,
});

const owes = (n: number, patch: Partial<MemoryRecordView> = {}) =>
  record(n, {
    entities: [
      { ...OLGA, role: "debtor" },
      { ...ME, role: "creditor" },
    ],
    kind: "commitment",
    status: "open",
    ...patch,
  });

const make = (
  cards: MemoryCard[],
  rules: MemoryRecordView[] = [],
  me: MemoryRecordView[] = []
) =>
  memoryMarkdown({
    cards,
    language: "ru",
    me,
    now: new Date("2026-11-11T09:00:00.000Z"),
    rules,
    timeZone: "Europe/Moscow",
  });

describe("the memory as one Markdown file (Д7.3)", () => {
  it("holds every record the card holds, in its section", () => {
    const records = [
      owes(1, { dueAt: "2026-11-13T21:00:00.000Z" }),
      owes(2, { doneAt: "2026-11-05T10:00:00.000Z", status: "done" }),
      record(3),
      record(4, { validTo: "2026-10-01T00:00:00.000Z" }),
      record(5, { kind: "event", occurredAt: "2026-11-06T00:00:00.000Z" }),
      record(6, { kind: "event", supersededAt: "2026-11-07T00:00:00.000Z" }),
    ];
    const md = make([card(records)]);
    for (const r of records) {
      expect(md).toContain(r.text);
    }
    const at = (title: string) => md.indexOf(`### ${title}`);
    expect(at("Открыто")).toBeLessThan(md.indexOf("запись 1"));
    expect(md.indexOf("запись 2")).toBeGreaterThan(at("Закрыто"));
    expect(md.indexOf("запись 4")).toBeGreaterThan(at("Раньше"));
    expect(md).toContain("Ольга Ли → вы: запись 1 (срок 2026-11-14)");
    expect(md).toContain("выполнено 2026-11-05");
    expect(md).toContain("olga@example.test");
    expect(md).toContain("Другие имена: Оля");
  });

  it("puts the rules and what the person told about themselves apart from the cards", () => {
    const md = make(
      [card([record(1)])],
      [record(7, { kind: "rule", text: "писать Ольге раз в две недели" })],
      [record(8, { text: "работаю над порталом" })]
    );
    expect(md).toContain("## Правила\n- писать Ольге раз в две недели");
    expect(md).toContain("## Обо мне\n- работаю над порталом");
    expect(md.indexOf("## Правила")).toBeGreaterThan(md.indexOf("## Ольга Ли"));
  });

  it("says so when nothing is kept, and speaks the person's language", () => {
    expect(make([])).toContain("Пока ничего не записано.");
    const en = memoryMarkdown({
      cards: [],
      language: "en",
      me: [],
      now: new Date("2026-11-11T09:00:00.000Z"),
      rules: [],
      timeZone: "UTC",
    });
    expect(en).toContain("# Memory · 2026-11-11");
    expect(en).toContain("Nothing is kept yet.");
  });
});
