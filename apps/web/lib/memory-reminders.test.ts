import type { MemoryDue } from "@metobe/contracts/memory";
import { describe, expect, it } from "vitest";

import { cameAgain, reminderCount, reminderGroups } from "./memory-reminders";
import type { ReminderRow } from "./memory-reminders";

const TZ = "Europe/Moscow";
// Saturday 14 November 2026, noon in Moscow.
const NOW = new Date("2026-11-14T09:00:00Z");

const row = (
  id: string,
  remindAt: string | null,
  over: Partial<MemoryDue["rows"][number]> = {}
): MemoryDue["rows"][number] => ({
  cards: [],
  dueAt: remindAt ?? "2026-11-13T21:00:00Z",
  id,
  important: false,
  remindAt,
  reminded: false,
  repeat: null,
  side: "mine",
  status: "open",
  text: id,
  who: null,
  ...over,
});

const due = (rows: MemoryDue["rows"]): MemoryDue => ({
  closedBySend: [],
  none: 0,
  rows,
  today: "2026-11-14",
});

describe("«Напоминания» (P29)", () => {
  it("groups by what is with each now, the ones that come again apart, each by its time", () => {
    const groups = reminderGroups(
      due([
        row("later", "2026-11-30T07:00:00Z"),
        row("week", "2026-11-18T09:00:00Z"),
        row("tomorrow", "2026-11-15T06:30:00Z"),
        row("evening", "2026-11-14T15:00:00Z"),
        row("missed", "2026-11-14T06:00:00Z"),
        row("came", "2026-11-13T13:00:00Z", { reminded: true }),
        row("weekly", "2026-11-16T07:00:00Z", { repeat: "week" }),
        row("noRemind", null),
      ]),
      NOW,
      TZ
    );
    expect(groups.map((g) => [g.group, g.rows.map((r) => r.id)])).toEqual([
      ["sent", ["came"]],
      ["today", ["missed", "evening"]],
      ["tomorrow", ["tomorrow"]],
      ["week", ["week"]],
      ["later", ["later"]],
      ["repeat", ["weekly"]],
    ]);
    expect(
      reminderCount(due([row("a", "2026-11-15T06:30:00Z"), row("b", null)]))
    ).toBe(1);
  });

  it("knows one that comes again came and is not marked: it went off and «Готово» was not pressed", () => {
    const weekly = row("weekly", "2026-11-23T07:00:00Z", {
      reminded: true,
      repeat: "week",
    }) as ReminderRow;
    expect(cameAgain(weekly)).toBe(true);
    expect(cameAgain({ ...weekly, reminded: false })).toBe(false);
  });
});
