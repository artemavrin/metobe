import { describe, expect, it } from "vitest";

import {
  isValidSchedule,
  nextRun,
  nextRuns,
  planDue,
  runJobId,
  scheduleWords,
} from "./task-schedule";

const at = (iso: string) => new Date(iso);

describe("a task's schedule", () => {
  it("counts the next run in the task's own time zone", () => {
    // Mondays at 10:00 in Moscow (UTC+3): after Monday 30 Nov 08:00 UTC (11:00 MSK) — the next Monday, 07:00 UTC.
    expect(
      nextRun(
        "0 10 * * 1",
        "Europe/Moscow",
        at("2026-11-30T08:00:00Z")
      ).toISOString()
    ).toBe("2026-12-07T07:00:00.000Z");
    // Before 10:00 MSK the same Monday is still ahead.
    expect(
      nextRun(
        "0 10 * * 1",
        "Europe/Moscow",
        at("2026-11-30T06:00:00Z")
      ).toISOString()
    ).toBe("2026-11-30T07:00:00.000Z");
  });

  it("gives the next few runs for the card", () => {
    const runs = nextRuns(
      "0 9 * * 1-5",
      "Europe/Moscow",
      at("2026-11-27T10:00:00Z"),
      3
    ).map((d) => d.toISOString());
    // Friday after 9:00 → Monday, Tuesday, Wednesday at 06:00 UTC.
    expect(runs).toEqual([
      "2026-11-30T06:00:00.000Z",
      "2026-12-01T06:00:00.000Z",
      "2026-12-02T06:00:00.000Z",
    ]);
  });

  it("refuses a cron or a zone that cannot be scheduled", () => {
    expect(isValidSchedule("0 10 * * 1", "Europe/Moscow")).toBe(true);
    expect(isValidSchedule("every monday", "Europe/Moscow")).toBe(false);
    expect(isValidSchedule("0 10 * * 1", "Mars/Olympus")).toBe(false);
  });
});

describe("a due task", () => {
  it("runs once for the time it was due and counts the next from now — one catch-up after a night down", () => {
    // Daily at 9:00 MSK; the server was down from Sunday evening to Wednesday noon: three runs were missed.
    const plan = planDue(
      {
        cron: "0 9 * * *",
        nextRunAt: at("2026-11-30T06:00:00Z"),
        timezone: "Europe/Moscow",
      },
      at("2026-12-02T09:00:00Z")
    );
    expect(plan.scheduledFor.toISOString()).toBe("2026-11-30T06:00:00.000Z");
    expect(plan.next.toISOString()).toBe("2026-12-03T06:00:00.000Z");
  });

  it("gets a job id without «:» that is the same for the same run", () => {
    const due = at("2026-11-30T07:00:00Z");
    const id = runJobId(
      "6f9c2b1e-0000-4000-8000-000000000001",
      due,
      "schedule"
    );
    expect(id).not.toContain(":");
    expect(id).toBe(
      runJobId(
        "6f9c2b1e-0000-4000-8000-000000000001",
        new Date(due),
        "schedule"
      )
    );
    expect(id).not.toBe(
      runJobId("6f9c2b1e-0000-4000-8000-000000000001", due, "manual")
    );
  });
});

describe("the schedule in words", () => {
  it("says the usual shapes as people do", () => {
    expect(scheduleWords("0 9 * * 1-5", "ru")).toBe("По будням в 9:00");
    expect(scheduleWords("0 10 * * 1", "ru")).toBe("По понедельникам в 10:00");
    expect(scheduleWords("30 8 * * 1,3", "ru")).toBe(
      "По понедельникам и средам в 8:30"
    );
    expect(scheduleWords("0 18 * * *", "ru")).toBe("Каждый день в 18:00");
    expect(scheduleWords("0 9,15 * * 1-5", "ru")).toBe(
      "По будням в 9:00 и 15:00"
    );
    expect(scheduleWords("0 10 * * 6,0", "ru")).toBe("По выходным в 10:00");
    expect(scheduleWords("0 9 1 * *", "ru")).toBe(
      "Каждый месяц 1-го числа в 9:00"
    );
    expect(scheduleWords("0 9 * * 1-5", "en")).toBe("On weekdays at 9:00");
    expect(scheduleWords("0 10 * * 7", "en")).toBe("On Sundays at 10:00");
  });

  it("says a run every so often", () => {
    expect(scheduleWords("*/5 * * * *", "ru")).toBe("Каждые 5 минут");
    expect(scheduleWords("*/2 * * * *", "ru")).toBe("Каждые 2 минуты");
    expect(scheduleWords("*/21 * * * *", "ru")).toBe("Каждую 21 минуту");
    expect(scheduleWords("* * * * *", "ru")).toBe("Каждую минуту");
    expect(scheduleWords("0 * * * *", "ru")).toBe("Каждый час");
    expect(scheduleWords("0 */3 * * *", "ru")).toBe("Каждые 3 часа");
    expect(scheduleWords("0 */6 * * *", "ru")).toBe("Каждые 6 часов");
    expect(scheduleWords("*/15 * * * *", "en")).toBe("Every 15 minutes");
  });

  it("shows any other cron as it is, never a wrong sentence", () => {
    expect(scheduleWords("*/15 9-18 * * 1-5", "ru")).toBe("*/15 9-18 * * 1-5");
    expect(scheduleWords("0 9 * 1 *", "ru")).toBe("0 9 * 1 *");
    expect(scheduleWords("0 9 L * *", "ru")).toBe("0 9 L * *");
  });
});
