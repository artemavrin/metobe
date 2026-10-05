import { describe, expect, it } from "vitest";

import { DEFAULT_CHAT_LIMITS, chatLimitFor, chatLimitsOf } from "./limits";

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
