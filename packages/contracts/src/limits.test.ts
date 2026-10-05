import { describe, expect, it } from "vitest";

import {
  DEFAULT_CHAT_LIMITS,
  chatLimitFor,
  chatLimitsOf,
  dayIn,
} from "./limits";

describe("the chat limits stored", () => {
  it("are the defaults when nothing is stored", () => {
    expect(chatLimitsOf()).toEqual(DEFAULT_CHAT_LIMITS);
  });

  it("keep a role that reads, and give a broken one its default", () => {
    expect(
      chatLimitsOf({
        admin: { perDay: "many", perMinute: 5 },
        user: { perDay: null, perMinute: 3 },
      })
    ).toEqual({
      admin: DEFAULT_CHAT_LIMITS.admin,
      user: { perDay: null, perMinute: 3 },
    });
  });

  it("never limit the owner", () => {
    expect(chatLimitFor("superuser", DEFAULT_CHAT_LIMITS)).toEqual({
      perDay: null,
      perMinute: null,
    });
    expect(chatLimitFor("admin", DEFAULT_CHAT_LIMITS)).toEqual(
      DEFAULT_CHAT_LIMITS.admin
    );
  });
});

describe("the person's day", () => {
  const lateUtc = new Date("2026-10-06T22:30:00Z");

  it("is the date where they are", () => {
    expect(dayIn("Europe/Moscow", lateUtc)).toBe("2026-10-07");
    expect(dayIn("America/New_York", lateUtc)).toBe("2026-10-06");
  });

  it("is UTC's without a zone or with a wrong one", () => {
    expect(dayIn(null, lateUtc)).toBe("2026-10-06");
    expect(dayIn("Mars/Olympus", lateUtc)).toBe("2026-10-06");
  });
});
