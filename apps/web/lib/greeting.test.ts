import { describe, expect, it } from "vitest";

import { dayPart, hourIn } from "./greeting";

describe("the greeting's time of day", () => {
  it("splits the day where people do", () => {
    expect([4, 5, 11, 12, 17, 18, 22, 23, 0].map(dayPart)).toEqual([
      "night",
      "morning",
      "morning",
      "day",
      "day",
      "evening",
      "evening",
      "night",
      "night",
    ]);
  });

  it("reads the hour in the user's zone", () => {
    const moment = new Date("2026-09-26T20:30:00Z");
    expect(hourIn(moment, "Europe/Moscow")).toBe(23);
    expect(hourIn(moment, "Asia/Tokyo")).toBe(5);
    expect(hourIn(new Date("2026-09-26T21:30:00Z"), "Europe/Moscow")).toBe(0);
  });
});
