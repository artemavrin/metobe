import { describe, expect, it } from "vitest";

import {
  REACH,
  nextReminder,
  nextReminderDay,
  nextRepeat,
} from "./memory-repeat";

describe("nextRepeat", () => {
  it("a year: this year's day if it has not passed, else next year's", () => {
    expect(nextRepeat("1985-11-14", "year", "2026-11-11")).toBe("2026-11-14");
    expect(nextRepeat("1985-11-14", "year", "2026-11-14")).toBe("2026-11-14");
    expect(nextRepeat("1985-11-14", "year", "2026-11-15")).toBe("2027-11-14");
  });

  it("a year: 29 February is the 28th where there is none", () => {
    expect(nextRepeat("2024-02-29", "year", "2026-02-20")).toBe("2026-02-28");
    expect(nextRepeat("2024-02-29", "year", "2027-03-01")).toBe("2028-02-29");
  });

  it("a month: the same day, the last day of a short month, next month once it has passed", () => {
    expect(nextRepeat("2026-11-20", "month", "2026-11-11")).toBe("2026-11-20");
    expect(nextRepeat("2026-11-20", "month", "2026-11-21")).toBe("2026-12-20");
    expect(nextRepeat("2026-10-31", "month", "2026-11-11")).toBe("2026-11-30");
    expect(nextRepeat("2026-10-31", "month", "2026-12-31")).toBe("2026-12-31");
    expect(nextRepeat("2026-12-15", "month", "2026-12-20")).toBe("2027-01-15");
  });

  it("a week: the same weekday, today included", () => {
    // 13 November 2026 is a Friday.
    expect(nextRepeat("2026-11-06", "week", "2026-11-11")).toBe("2026-11-13");
    expect(nextRepeat("2026-11-06", "week", "2026-11-13")).toBe("2026-11-13");
    expect(nextRepeat("2026-11-06", "week", "2026-11-14")).toBe("2026-11-20");
  });

  it("a birthday is shown three days ahead, the rest the day before", () => {
    expect(REACH.year).toBe(3);
    expect(REACH.week).toBe(1);
    expect(REACH.month).toBe(1);
  });
});

describe("a reminder that comes again (шаг 6)", () => {
  it("goes on to the next day, working day, week, month or year after the one given", () => {
    // Friday 13 November 2026.
    expect(nextReminderDay("2026-11-13", "day", "2026-11-13")).toBe(
      "2026-11-14"
    );
    expect(nextReminderDay("2026-11-13", "weekdays", "2026-11-13")).toBe(
      "2026-11-16"
    );
    expect(nextReminderDay("2026-11-13", "week", "2026-11-13")).toBe(
      "2026-11-20"
    );
    expect(nextReminderDay("2026-10-31", "month", "2026-10-31")).toBe(
      "2026-11-30"
    );
    expect(nextReminderDay("2026-11-13", "year", "2026-11-13")).toBe(
      "2027-11-13"
    );
  });

  it("a week on chosen weekdays goes to the next of them: пн, ср, пт", () => {
    const mwf = [1, 3, 5];
    // Monday 16 November 2026 → Wednesday 18, Friday 20, then Monday 23.
    expect(nextReminderDay("2026-11-16", "week", "2026-11-16", mwf)).toBe(
      "2026-11-18"
    );
    expect(nextReminderDay("2026-11-16", "week", "2026-11-18", mwf)).toBe(
      "2026-11-20"
    );
    expect(nextReminderDay("2026-11-16", "week", "2026-11-20", mwf)).toBe(
      "2026-11-23"
    );
    // No days: the anchor's weekday, as before.
    expect(nextReminderDay("2026-11-16", "week", "2026-11-16", [])).toBe(
      "2026-11-23"
    );
    // 9:58 in Moscow on Monday is past at 10:00: the next is Wednesday's.
    expect(
      nextReminder({
        after: "2026-11-15",
        days: mwf,
        now: new Date("2026-11-16T07:00:00Z"),
        remindAt: new Date("2026-11-16T06:58:00Z"),
        repeat: "week",
        timeZone: "Europe/Moscow",
      })?.remindAt.toISOString()
    ).toBe("2026-11-18T06:58:00.000Z");
  });

  it("keeps the time of day in the person's zone, and skips the times already past", () => {
    // Monday 10:00 in Moscow, every week; three weeks were missed.
    const next = nextReminder({
      after: "2026-10-19",
      now: new Date("2026-11-10T12:00:00Z"),
      remindAt: new Date("2026-10-19T07:00:00Z"),
      repeat: "week",
      timeZone: "Europe/Moscow",
    });
    expect(next).toEqual({
      dueAt: new Date("2026-11-15T21:00:00Z"),
      remindAt: new Date("2026-11-16T07:00:00Z"),
    });
  });
});
