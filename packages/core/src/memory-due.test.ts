import { describe, expect, it, vi } from "vitest";

import type { MemoryEntity, MemoryRecord } from "./memory";
import { scheduleOf, staleOf, weekStart } from "./memory-due";

vi.mock("server-only", () => ({}));
vi.mock("./memory", () => ({}));

const TZ = "Europe/Moscow";
const NOW = new Date("2026-11-11T09:00:00Z");

const card = (id: string, kind: MemoryEntity["kind"], name: string) =>
  ({ id, kind, name }) as MemoryEntity;
const CARDS = new Map([
  ["me", card("me", "self", "Я")],
  ["olga", card("olga", "person", "Ольга Ли")],
]);

const promise = (id: string, over: Partial<MemoryRecord> = {}) =>
  ({
    deletedAt: null,
    doneAt: null,
    dueAt: null,
    entities: [
      { entityId: "olga", role: "debtor" },
      { entityId: "me", role: "creditor" },
    ],
    givenAt: null,
    id,
    important: false,
    kind: "commitment",
    recordedAt: new Date("2026-09-01T10:00:00Z"),
    status: "open",
    text: id,
    ...over,
  }) as MemoryRecord;

const at = (iso: string) => new Date(iso);

describe("scheduleOf", () => {
  it("takes the open ones with a deadline, the nearest first, and counts the dateless", () => {
    const s = scheduleOf(
      [
        promise("far", { dueAt: at("2026-12-30T09:00:00Z") }),
        promise("old", { dueAt: at("2026-10-20T09:00:00Z") }),
        promise("soon", { dueAt: at("2026-11-12T09:00:00Z") }),
        promise("none"),
        promise("none2"),
        promise("done", { dueAt: at("2026-11-13T09:00:00Z"), status: "done" }),
      ],
      CARDS,
      NOW,
      TZ
    );
    expect(s.rows.map((r) => r.id)).toEqual(["old", "soon", "far"]);
    expect(s.none).toBe(2);
    expect(s.today).toBe("2026-11-11");
  });

  it("names every card a commitment is about, for counting by card", () => {
    const { rows } = scheduleOf(
      [promise("a", { dueAt: at("2026-11-13T09:00:00Z") })],
      CARDS,
      NOW,
      TZ
    );
    expect(rows[0]?.cards).toEqual(["olga", "me"]);
  });

  it("puts the important one first and reads the sides", () => {
    const due = at("2026-11-13T09:00:00Z");
    const { rows } = scheduleOf(
      [
        promise("plain", { dueAt: due }),
        promise("urgent", {
          dueAt: due,
          entities: [
            { entityId: "me", role: "debtor" },
            { entityId: "olga", role: "creditor" },
          ],
          important: true,
        }),
      ],
      CARDS,
      NOW,
      TZ
    );
    expect(rows.map((i) => i.id)).toEqual(["urgent", "plain"]);
    expect(rows[0]?.side).toBe("mine");
    expect(rows[1]?.side).toBe("theirs");
    expect(rows[1]?.who?.name).toBe("Ольга Ли");
  });

  it("shows «ждёт проверки», not the closed ones, and takes today in the person's zone", () => {
    // 22:30 UTC on the 11th is already the 12th in Moscow.
    const s = scheduleOf(
      [
        promise("wait", {
          dueAt: at("2026-11-12T09:00:00Z"),
          status: "unconfirmed",
        }),
        promise("gone", {
          dueAt: at("2026-11-12T09:00:00Z"),
          status: "cancelled",
        }),
      ],
      CARDS,
      at("2026-11-11T22:30:00Z"),
      TZ
    );
    expect(s.rows.map((i) => i.id)).toEqual(["wait"]);
    expect(s.today).toBe("2026-11-12");
  });
});

describe("staleOf", () => {
  const none = new Map<string, Date>();

  it("takes the open ones quiet for 30 days and given earlier", () => {
    const rows = staleOf(
      [
        promise("quiet", { givenAt: at("2026-09-20T09:00:00Z") }),
        promise("fresh", { givenAt: at("2026-11-01T09:00:00Z") }),
      ],
      CARDS,
      none,
      none,
      NOW,
      TZ
    );
    expect(rows.map((r) => [r.id, r.quiet])).toEqual([["quiet", 52]]);
  });

  it("counts the quiet from the last change, not from the day it was given", () => {
    const rows = staleOf(
      [promise("moved", { givenAt: at("2026-09-01T09:00:00Z") })],
      CARDS,
      new Map([["moved", at("2026-11-05T09:00:00Z")]]),
      none,
      NOW,
      TZ
    );
    expect(rows).toEqual([]);
  });

  it("skips one whose deadline is ahead, shows one past its day", () => {
    const rows = staleOf(
      [
        promise("ahead", {
          dueAt: at("2026-11-20T09:00:00Z"),
          givenAt: at("2026-09-01T09:00:00Z"),
        }),
        promise("past", {
          dueAt: at("2026-10-01T09:00:00Z"),
          givenAt: at("2026-09-01T09:00:00Z"),
        }),
      ],
      CARDS,
      none,
      none,
      NOW,
      TZ
    );
    expect(rows.map((r) => r.id)).toEqual(["past"]);
  });

  it("keeps «Оставить» for 30 days, then asks again", () => {
    const old = promise("kept", { givenAt: at("2026-08-01T09:00:00Z") });
    expect(
      staleOf(
        [old],
        CARDS,
        none,
        new Map([["kept", at("2026-11-01T09:00:00Z")]]),
        NOW,
        TZ
      )
    ).toEqual([]);
    expect(
      staleOf(
        [old],
        CARDS,
        none,
        new Map([["kept", at("2026-10-10T09:00:00Z")]]),
        NOW,
        TZ
      )
    ).toHaveLength(1);
  });

  it("orders the longest quiet first and leaves the closed", () => {
    const rows = staleOf(
      [
        promise("b", { givenAt: at("2026-09-01T09:00:00Z") }),
        promise("a", { givenAt: at("2026-08-01T09:00:00Z") }),
        promise("c", { givenAt: at("2026-08-01T09:00:00Z"), status: "done" }),
      ],
      CARDS,
      none,
      none,
      NOW,
      TZ
    );
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("weekStart", () => {
  it("is the Monday of the week, in the person's zone", () => {
    // 11 Nov 2026 is a Wednesday.
    expect(weekStart(new Date("2026-11-11T09:00:00Z"), TZ)).toBe("2026-11-09");
    expect(weekStart(new Date("2026-11-09T09:00:00Z"), TZ)).toBe("2026-11-09");
    // Sunday evening there, still that week; a minute after midnight is the next.
    expect(weekStart(new Date("2026-11-15T20:59:00Z"), TZ)).toBe("2026-11-09");
    expect(weekStart(new Date("2026-11-15T21:01:00Z"), TZ)).toBe("2026-11-16");
  });
});
