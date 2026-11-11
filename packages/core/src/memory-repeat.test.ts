import { describe, expect, it } from "vitest";

import { REACH, nextRepeat } from "./memory-repeat";

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
