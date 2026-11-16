import { describe, expect, it } from "vitest";

import { dayKey, daysUntil, moveTargets } from "./memory-dates";

const ZONE = "Europe/Moscow";

const iso = (t: ReturnType<typeof moveTargets>) =>
  Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.toISOString()]));

describe("the «Память» page's days", () => {
  it("counts calendar days in the person's zone", () => {
    // 23:30 in Moscow on Monday 9 November is still Monday there.
    const now = new Date("2026-11-09T20:30:00Z");
    expect(dayKey(now, ZONE)).toBe("2026-11-09");
    // Deadlines are midnights in the zone.
    expect(daysUntil(new Date("2026-11-08T21:00:00Z"), now, ZONE)).toBe(0);
    expect(daysUntil(new Date("2026-11-09T21:00:00Z"), now, ZONE)).toBe(1);
    expect(daysUntil(new Date("2026-11-06T21:00:00Z"), now, ZONE)).toBe(-2);
  });

  it("moves a deadline to tomorrow, the day after, Monday and a week on", () => {
    const monday = new Date("2026-11-09T09:00:00Z");
    expect(iso(moveTargets(monday, ZONE))).toEqual({
      dayAfter: "2026-11-10T21:00:00.000Z",
      monday: "2026-11-15T21:00:00.000Z",
      tomorrow: "2026-11-09T21:00:00.000Z",
      week: "2026-11-15T21:00:00.000Z",
    });
    // On a Friday «в понедельник» is three days on.
    const friday = new Date("2026-11-13T09:00:00Z");
    expect(moveTargets(friday, ZONE).monday.toISOString()).toBe(
      "2026-11-15T21:00:00.000Z"
    );
  });
});
