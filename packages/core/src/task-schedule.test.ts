import { describe, expect, it } from "vitest";

import {
  isValidSchedule,
  nextRun,
  nextRuns,
  planDue,
  runJobId,
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
