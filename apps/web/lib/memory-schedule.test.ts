import type { MemoryDue } from "@metobe/contracts/memory";
import { describe, expect, it } from "vitest";

import { overdueDays, scheduleCount, scheduleGroups } from "./memory-schedule";
import type { ScheduleItem } from "./memory-schedule";

const TZ = "Europe/Moscow";

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
  repeatDays: null,
  side: "mine",
  status: "open",
  text: id,
  who: null,
  ...over,
});

const ANDREY = { id: "a", kind: "person" as const, name: "Андрей" };

// Saturday 14 November 2026 in Moscow.
const due = (over: Partial<MemoryDue> = {}): MemoryDue => ({
  closedBySend: [],
  dates: [],
  none: 0,
  rhythms: [],
  rows: [],
  today: "2026-11-14",
  ...over,
});

const rhythm = (id: string, day: string, away = false) => ({
  away,
  day,
  every: 14,
  id,
  last: null,
  text: id,
  who: ANDREY,
  workingDays: false,
});

const idOf = (i: ScheduleItem) => {
  if (i.kind === "reminder") {
    return i.row.id;
  }
  return i.kind === "date" ? i.date.id : i.rhythm.id;
};

describe("«Расписание» (D45, P30)", () => {
  it("puts reminders, days and rhythms in one list by when, what wants the person on top", () => {
    const groups = scheduleGroups(
      due({
        dates: [
          {
            day: "2026-11-18",
            id: "birthday",
            repeat: "year",
            text: "birthday",
            who: ANDREY,
          },
        ],
        rhythms: [
          rhythm("overdue", "2026-11-10"),
          rhythm("soon", "2026-11-15"),
          rhythm("away", "2026-11-01", true),
        ],
        rows: [
          row("later", "2026-11-30T07:00:00Z"),
          row("evening", "2026-11-14T15:00:00Z"),
          row("morning", "2026-11-14T06:00:00Z"),
          row("sent", "2026-11-13T13:00:00Z", { reminded: true }),
          row("weekly", "2026-11-16T07:00:00Z", { repeat: "week" }),
          row("noRemind", null),
        ],
      }),
      TZ
    );
    expect(groups.map(({ group, items }) => [group, items.map(idOf)])).toEqual([
      ["sent", ["sent"]],
      ["overdue", ["overdue"]],
      ["today", ["morning", "evening"]],
      ["tomorrow", ["soon"]],
      ["week", ["weekly", "birthday"]],
      ["later", ["later"]],
    ]);
  });

  it("counts everything but a rhythm taken away, and says how long a rhythm is overdue", () => {
    expect(
      scheduleCount(
        due({
          rhythms: [rhythm("a", "2026-11-10"), rhythm("b", "2026-11-01", true)],
          rows: [row("r", "2026-11-15T06:30:00Z"), row("n", null)],
        }),
        TZ
      )
    ).toBe(2);
    expect(overdueDays(rhythm("a", "2026-11-10"), "2026-11-14")).toBe(4);
    expect(overdueDays(rhythm("a", "2026-11-20"), "2026-11-14")).toBe(0);
  });
});
