import { describe, expect, it } from "vitest";

import { prorate, remainingDays, roundDiv, vatSplit } from "./money";
import {
  daysInMonth,
  localParts,
  nextPeriod,
  periodOf,
  zonedInstant,
} from "./time";

const z = (tz: string, y: number, m: number, d: number, h = 0, min = 0) =>
  zonedInstant(tz, y, m, d, h, min).toISOString();

describe("daysInMonth", () => {
  it.each([
    [2026, 1, 31],
    [2026, 2, 28],
    [2028, 2, 29],
    [2100, 2, 28], // century, not a leap year
    [2000, 2, 29], // divisible by 400
    [2026, 4, 30],
    [2026, 12, 31],
  ])("%i-%i has %i days", (y, m, n) => {
    expect(daysInMonth(y, m)).toBe(n);
  });

  it("rolls the period over the year", () => {
    expect(nextPeriod("2026-12")).toBe("2027-01");
    expect(nextPeriod("2026-02")).toBe("2026-03");
  });
});

describe("zonedInstant", () => {
  it.each([
    ["Europe/Moscow", 2026, 12, 1, "2026-11-30T21:00:00.000Z"],
    ["Asia/Vladivostok", 2026, 12, 1, "2026-11-30T14:00:00.000Z"],
    ["Europe/Berlin", 2026, 12, 1, "2026-11-30T23:00:00.000Z"], // CET
    ["Europe/Berlin", 2026, 7, 1, "2026-06-30T22:00:00.000Z"], // CEST
    ["America/New_York", 2026, 12, 1, "2026-12-01T05:00:00.000Z"], // EST
    ["America/New_York", 2026, 11, 1, "2026-11-01T04:00:00.000Z"], // EDT: DST ends later that day
    ["Asia/Kolkata", 2026, 12, 1, "2026-11-30T18:30:00.000Z"], // +5:30
    ["Pacific/Kiritimati", 2026, 12, 1, "2026-11-30T10:00:00.000Z"], // +14
    ["Pacific/Pago_Pago", 2026, 12, 1, "2026-12-01T11:00:00.000Z"], // −11
    ["UTC", 2026, 12, 1, "2026-12-01T00:00:00.000Z"],
  ])("%s %i-%i-%i 00:00", (tz, y, m, d, iso) => {
    expect(z(tz, y, m, d)).toBe(iso);
  });

  it("DST gap at midnight: the first instant after the gap", () => {
    // Cuba: 2026-03-08 00:00 → 01:00. 00:00 does not exist.
    const t = zonedInstant("America/Havana", 2026, 3, 8);
    expect(t.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(localParts(t, "America/Havana")).toMatchObject({
      day: 8,
      hour: 1,
      minute: 0,
    });
    expect(
      localParts(new Date(t.getTime() - 60_000), "America/Havana").day
    ).toBe(7);
  });

  it("DST overlap: the first of the two moments", () => {
    // Berlin 2026-10-25: 03:00 CEST → 02:00 CET, 02:30 happens twice.
    expect(z("Europe/Berlin", 2026, 10, 25, 2, 30)).toBe(
      "2026-10-25T00:30:00.000Z"
    );
  });

  it("every day of a year starts exactly at local 00:00 (or after a gap), in all zones", () => {
    const zones = [
      "Europe/Berlin",
      "America/New_York",
      "Europe/Moscow",
      "Asia/Vladivostok",
      "Asia/Kolkata",
      "America/Havana",
      "Australia/Lord_Howe", // 30-minute DST
    ];
    for (const tz of zones) {
      for (let day = 0; day < 365; day++) {
        const probe = new Date(Date.UTC(2026, 0, 1 + day, 12));
        const p = localParts(probe, tz);
        const start = zonedInstant(tz, p.year, p.month, p.day);
        const here = localParts(start, tz);
        const before = localParts(new Date(start.getTime() - 60_000), tz);
        expect([here.year, here.month, here.day]).toEqual([
          p.year,
          p.month,
          p.day,
        ]);
        // the minute before is the previous day
        expect(before.day).not.toBe(p.day);
        // 00:00, except where the zone skips it
        expect(here.hour * 60 + here.minute).toBeLessThanOrEqual(60);
      }
    }
  });
});

describe("money", () => {
  it("rounds half-up", () => {
    expect(roundDiv(5, 2)).toBe(3);
    expect(roundDiv(4, 3)).toBe(1);
    expect(roundDiv(0, 7)).toBe(0);
    expect(() => roundDiv(-1, 2)).toThrow();
  });

  it("ORGS-PLAN example: 2 seats added on 18 Nov, 13 days of 30", () => {
    const at = zonedInstant("Europe/Moscow", 2026, 11, 18, 12);
    expect(remainingDays(at, "Europe/Moscow")).toEqual({
      remaining: 13,
      total: 30,
    });
    expect(prorate(2 * 100_000, at, "Europe/Moscow")).toBe(86_667); // 86 666,67 → 86 667
  });

  // [month, day of change] → remaining/total; the day of the change counts
  it.each([
    [2026, 1, 1, 31, 31], // first day: the whole month
    [2026, 1, 31, 1, 31], // last day: one day
    [2026, 2, 1, 28, 28],
    [2026, 2, 28, 1, 28],
    [2028, 2, 29, 1, 29], // leap year
    [2028, 2, 28, 2, 29],
    [2026, 4, 30, 1, 30],
    [2026, 4, 15, 16, 30],
    [2026, 12, 25, 7, 31],
  ])("%i-%i-%i: %i of %i days", (y, m, d, rem, total) => {
    const at = zonedInstant("Europe/Moscow", y, m, d, 12);
    expect(remainingDays(at, "Europe/Moscow")).toEqual({
      remaining: rem,
      total,
    });
    expect(prorate(total * 1000, at, "Europe/Moscow")).toBe(rem * 1000);
  });

  it("the day is the organization's, not UTC's: one instant, four zones", () => {
    const at = new Date("2026-11-30T21:30:00Z");
    const days = (tz: string) => remainingDays(at, tz);
    expect(days("Europe/Moscow")).toEqual({ remaining: 31, total: 31 }); // 1 Dec 00:30
    expect(days("Asia/Vladivostok")).toEqual({ remaining: 31, total: 31 }); // 1 Dec 07:30
    expect(days("Europe/Berlin")).toEqual({ remaining: 1, total: 30 }); // 30 Nov 22:30
    expect(days("America/New_York")).toEqual({ remaining: 1, total: 30 }); // 30 Nov 16:30
    expect(periodOf(at, "Europe/Moscow")).toBe("2026-12");
    expect(periodOf(at, "America/New_York")).toBe("2026-11");
  });

  it("DST changes no day count: 25 Oct 2026 in Berlin (25-hour day)", () => {
    const early = new Date("2026-10-24T22:00:00Z"); // 00:00 CEST
    const late = new Date("2026-10-25T22:59:00Z"); // 23:59 CET
    expect(remainingDays(early, "Europe/Berlin").remaining).toBe(7);
    expect(remainingDays(late, "Europe/Berlin").remaining).toBe(7);
  });

  it("VAT: on top and included", () => {
    expect(vatSplit(100_000, { included: false, rateBp: 2200 })).toEqual({
      gross: 122_000,
      net: 100_000,
      vat: 22_000,
    });
    expect(vatSplit(122_000, { included: true, rateBp: 2200 })).toEqual({
      gross: 122_000,
      net: 100_000,
      vat: 22_000,
    });
    expect(vatSplit(100_000, { included: false, rateBp: 0 }).vat).toBe(0);
    // 86 667 × 22 % = 19 066,74
    expect(vatSplit(86_667, { included: false, rateBp: 2200 }).vat).toBe(
      19_067
    );
    // included: 100 001 × 22/122 = 18 033,2…
    expect(vatSplit(100_001, { included: true, rateBp: 2200 })).toEqual({
      gross: 100_001,
      net: 81_968,
      vat: 18_033,
    });
  });
});
