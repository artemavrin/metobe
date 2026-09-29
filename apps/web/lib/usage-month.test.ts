import { describe, expect, it } from "vitest";

import { monthOf } from "./usage-month";

const now = new Date("2026-09-28T12:00:00Z");

describe("a month of the usage", () => {
  it("is this month unless told", () => {
    expect(monthOf(undefined, now).key).toBe("2026-09");
    expect(monthOf("вчера", now).key).toBe("2026-09");
    expect(monthOf("2026-13", now).key).toBe("2026-09");
  });

  it("runs from the 1st to the 1st of the next", () => {
    const m = monthOf("2026-02", now);
    expect(m.from.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(m.to.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("knows the months on either side, and none ahead of this one", () => {
    expect(monthOf("2026-01", now)).toMatchObject({
      next: "2026-02",
      previous: "2025-12",
    });
    expect(monthOf("2026-09", now).next).toBeNull();
    expect(monthOf("2026-08", now).next).toBe("2026-09");
  });
});
