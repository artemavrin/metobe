import type { MemoryDue } from "@metobe/contracts/memory";
import { describe, expect, it } from "vitest";

import { isLate, lateByCard } from "./memory-late";

const TZ = "Europe/Moscow";

const row = (
  id: string,
  dueAt: string,
  cards: string[]
): MemoryDue["rows"][number] => ({
  cards,
  dueAt,
  id,
  important: false,
  side: "theirs",
  status: "open",
  text: id,
  who: null,
});

// A deadline is midnight of its day in the person's zone: 10 Nov in Moscow is 9 Nov 21:00 UTC.
const due = (rows: MemoryDue["rows"]): MemoryDue => ({
  none: 0,
  rows,
  today: "2026-11-11",
});

describe("what is past its day", () => {
  it("counts the day before today as late, and today and later as not", () => {
    const rows = [
      row("yesterday", "2026-11-09T21:00:00.000Z", ["olga"]),
      row("today", "2026-11-10T21:00:00.000Z", ["olga"]),
      row("later", "2026-11-12T21:00:00.000Z", ["olga"]),
    ];
    expect(rows.map((r) => isLate(r, "2026-11-11", TZ))).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("counts late ones for every card they are about, and leaves out cards with none", () => {
    const counts = lateByCard(
      due([
        row("a", "2026-11-09T21:00:00.000Z", ["olga", "me"]),
        row("b", "2026-11-01T21:00:00.000Z", ["olga", "igor"]),
        row("c", "2026-11-20T21:00:00.000Z", ["anna"]),
      ]),
      TZ
    );
    expect(counts.get("olga")).toBe(2);
    expect(counts.get("me")).toBe(1);
    expect(counts.get("igor")).toBe(1);
    expect(counts.has("anna")).toBe(false);
  });

  it("follows a deadline moved over today, both ways", () => {
    const rows = [row("a", "2026-11-12T21:00:00.000Z", ["olga"])];
    expect(lateByCard(due(rows), TZ).get("olga")).toBeUndefined();
    const moved = rows.map((r) => ({
      ...r,
      dueAt: "2026-11-08T21:00:00.000Z",
    }));
    expect(lateByCard(due(moved), TZ).get("olga")).toBe(1);
    expect(lateByCard(due(rows), TZ).get("olga")).toBeUndefined();
  });
});
