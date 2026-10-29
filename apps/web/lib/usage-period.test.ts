import { describe, expect, it } from "vitest";

import {
  nowIn,
  periodOf,
  periodQuery,
  readPeriod,
  stepAnchor,
  weekFrom,
} from "./usage-period";

// A Thursday.
const today = "2026-10-29";

describe("the period of «Расходы»", () => {
  it("is this month unless the URL says otherwise", () => {
    expect(readPeriod({}, today)).toEqual({ anchor: today, span: "month" });
    expect(readPeriod({ d: "вчера", p: "year" }, today)).toEqual({
      anchor: today,
      span: "month",
    });
    expect(readPeriod({ d: "2026-02-30", p: "day" }, today)).toEqual({
      anchor: today,
      span: "day",
    });
  });

  it("never looks past today", () => {
    expect(readPeriod({ d: "2027-01-01", p: "day" }, today).anchor).toBe(today);
    expect(
      readPeriod({ from: "2026-10-20", p: "range", to: "2026-12-01" }, today)
        .range
    ).toEqual({ from: "2026-10-20", to: today });
  });

  it("takes a range either way round", () => {
    expect(
      readPeriod({ from: "2026-10-15", p: "range", to: "2026-10-01" }, today)
        .range
    ).toEqual({ from: "2026-10-01", to: "2026-10-15" });
  });

  it("compares a month in progress with as many first days of the month before", () => {
    const p = periodOf({ anchor: today, span: "month" }, today, 1);
    expect([p.from, p.to, p.end]).toEqual(["2026-10-01", today, "2026-10-31"]);
    expect(p.prev).toEqual({ from: "2026-09-01", to: "2026-09-29" });
    expect(p.canNext).toBe(false);
  });

  it("keeps a short month's comparison inside it", () => {
    const p = periodOf({ anchor: "2026-03-31", span: "month" }, today, 1);
    expect(p.prev).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("starts the week on the viewer's first weekday", () => {
    expect(weekFrom(today, 1)).toBe("2026-10-26");
    expect(weekFrom(today, 7)).toBe("2026-10-25");
    expect(weekFrom(today, 6)).toBe("2026-10-24");
    const p = periodOf({ anchor: today, span: "week" }, today, 1);
    expect([p.from, p.to, p.end]).toEqual(["2026-10-26", today, "2026-11-01"]);
    expect(p.prev).toEqual({ from: "2026-10-19", to: "2026-10-22" });
  });

  it("draws a single day by hours and compares today with yesterday up to the same hour", () => {
    const p = periodOf({ anchor: today, span: "day" }, today, 1, 14);
    expect(p.hourly).toBe(true);
    expect(p.buckets).toHaveLength(24);
    expect(p.buckets[9]).toBe("2026-10-29T09");
    expect(p.prev).toEqual({ from: "2026-10-28", to: "2026-10-28" });
    expect(p.prevUntilHour).toBe(14);
    expect(
      periodOf({ anchor: "2026-10-20", span: "day" }, today, 1, 14)
        .prevUntilHour
    ).toBeNull();
  });

  it("compares a range with as many days just before it", () => {
    const p = periodOf(
      {
        anchor: "2026-10-15",
        range: { from: "2026-10-06", to: "2026-10-15" },
        span: "range",
      },
      today,
      1
    );
    expect(p.buckets).toHaveLength(10);
    expect(p.prev).toEqual({ from: "2026-09-26", to: "2026-10-05" });
  });

  it("steps by its own length and stops at today", () => {
    expect(stepAnchor({ anchor: today, span: "week" }, -1, today)).toBe(
      "2026-10-22"
    );
    expect(stepAnchor({ anchor: "2026-09-29", span: "month" }, 1, today)).toBe(
      "2026-10-01"
    );
    expect(stepAnchor({ anchor: today, span: "day" }, 1, today)).toBe(today);
  });

  it("goes back into the URL it came from", () => {
    expect(periodQuery({ anchor: today, span: "week" })).toBe(
      "?p=week&d=2026-10-29"
    );
    expect(
      periodQuery({
        anchor: "2026-10-15",
        range: { from: "2026-10-06", to: "2026-10-15" },
        span: "range",
      })
    ).toBe("?p=range&from=2026-10-06&to=2026-10-15");
  });

  it("knows the viewer's day and hour by their zone", () => {
    const at = new Date("2026-10-29T22:30:00Z");
    expect(nowIn("UTC", at)).toEqual({ hour: 22, today: "2026-10-29" });
    expect(nowIn("Europe/Moscow", at)).toEqual({
      hour: 1,
      today: "2026-10-30",
    });
  });
});
