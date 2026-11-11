import { describe, expect, it } from "vitest";

import type { MemoryEntity, MemoryRecord } from "./memory";
import {
  isStale,
  stillTrue,
  summaryPrompt,
  summaryRecords,
  supported,
} from "./memory-summary-text";

const TZ = "Europe/Moscow";
const at = (iso: string) => new Date(iso);

const card = (
  id: string,
  kind: MemoryEntity["kind"],
  name: string,
  role: string | null = null
) => ({ id, kind, name, role }) as MemoryEntity;
const ENTITIES = [
  card("me", "self", "Я"),
  card("olga", "person", "Ольга Ли", "юрист"),
];

const record = (id: string, over: Partial<MemoryRecord> = {}) =>
  ({
    deletedAt: null,
    dueAt: null,
    entities: [{ entityId: "olga", role: "about" }],
    givenAt: null,
    id,
    important: false,
    kind: "fact",
    occurredAt: null,
    occurredPrecision: null,
    recordedAt: at("2026-11-01T09:00:00Z"),
    status: null,
    supersededAt: null,
    text: id,
    validFrom: null,
    validTo: null,
    ...over,
  }) as MemoryRecord;

describe("summaryPrompt", () => {
  it("puts the open promises first, the current known next, the closed last, each under a ref", () => {
    const records = [
      record("closed", {
        kind: "commitment",
        status: "done",
        text: "Прислала смету",
      }),
      record("fact", { text: "Работает в «Альфа-Логистике»" }),
      record("open", {
        dueAt: at("2026-11-13T00:00:00+03:00"),
        entities: [
          { entityId: "olga", role: "debtor" },
          { entityId: "me", role: "creditor" },
        ],
        kind: "commitment",
        status: "open",
        text: "Прислать договор",
      }),
    ];
    const { prompt, refs } = summaryPrompt(
      ENTITIES[1] as MemoryEntity,
      records,
      ENTITIES,
      TZ
    );
    expect([...refs.values()]).toEqual(["open", "fact", "closed"]);
    expect(prompt).toContain(
      "r1: promise: «Прислать договор» (by Ольга Ли to the user, due 2026-11-13)"
    );
    expect(prompt.indexOf("r2:")).toBeGreaterThan(prompt.indexOf("r1:"));
    expect(prompt).toContain("<card>Ольга Ли (person; юрист)</card>");
    expect(prompt.startsWith("<today>")).toBe(true);
    // No record's id reaches the model.
    expect(prompt).not.toContain("closed");
  });

  it("leaves out the deleted and the replaced", () => {
    const shown = summaryRecords([
      record("a"),
      record("b", { deletedAt: at("2026-11-02T00:00:00Z") }),
      record("c", { supersededAt: at("2026-11-02T00:00:00Z") }),
    ]);
    expect(shown.map((r) => r.id)).toEqual(["a"]);
  });
});

const sentence = (n: number) => ({ refs: ["r1"], text: `Фраза ${n}.` });

describe("supported", () => {
  const refs = new Map([
    ["r1", "id1"],
    ["r2", "id2"],
  ]);
  it("keeps a sentence with the records it names, as their ids", () => {
    const out = supported(
      {
        how: [],
        now: [{ refs: ["R2", " r1 ", "r2"], text: "Ждёте от неё договор." }],
        who: [{ refs: ["r1"], text: "Ольга — юрист." }],
      },
      refs
    );
    expect(out.now).toEqual([
      { records: ["id2", "id1"], text: "Ждёте от неё договор." },
    ]);
    expect(out.who).toEqual([{ records: ["id1"], text: "Ольга — юрист." }]);
  });

  it("throws away a sentence with no ref, a made-up ref, an empty text or a text too long", () => {
    const out = supported(
      {
        how: [
          { refs: [], text: "Любит краткость." },
          { refs: ["r9"], text: "Не любит звонки." },
          { refs: ["r1"], text: "  " },
          { refs: ["r1"], text: "x".repeat(400) },
          { refs: ["r1", "r9"], text: "Пишет в мессенджер." },
        ],
        now: [],
        who: [],
      },
      refs
    );
    expect(out.how).toEqual([
      { records: ["id1"], text: "Пишет в мессенджер." },
    ]);
  });

  it("cuts a list to its length", () => {
    const out = supported(
      {
        how: [1, 2, 3, 4].map(sentence),
        now: [1, 2, 3, 4].map(sentence),
        who: [1, 2, 3].map(sentence),
      },
      refs
    );
    expect([out.who.length, out.how.length, out.now.length]).toEqual([2, 3, 3]);
  });
});

describe("stillTrue", () => {
  it("drops a record that is gone from a sentence, and the sentence when none is left", () => {
    const out = stillTrue(
      {
        how: [{ records: ["gone"], text: "Любит краткость." }],
        now: [{ records: ["gone", "live"], text: "Ждёте договор." }],
        who: [{ records: ["live"], text: "Ольга — юрист." }],
      },
      new Set(["live"])
    );
    expect(out.how).toEqual([]);
    expect(out.now).toEqual([{ records: ["live"], text: "Ждёте договор." }]);
    expect(out.who).toHaveLength(1);
  });
});

describe("isStale", () => {
  const stored = { count: 2, coversAt: at("2026-11-01T09:00:00Z") };
  it("is fresh while nothing newer came and the number is the same", () => {
    expect(isStale(stored, [record("a"), record("b")])).toBe(false);
  });
  it("is stale after a newer record, after a deletion and after a merge brought more", () => {
    expect(
      isStale(stored, [
        record("a"),
        record("b", { recordedAt: at("2026-11-05T00:00:00Z") }),
      ])
    ).toBe(true);
    expect(isStale(stored, [record("a")])).toBe(true);
    expect(isStale(stored, [record("a"), record("b"), record("c")])).toBe(true);
    expect(
      isStale(stored, [
        record("a"),
        record("b"),
        record("c", { deletedAt: at("2026-11-02T00:00:00Z") }),
      ])
    ).toBe(false);
  });
});
