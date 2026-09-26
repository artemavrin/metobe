import { describe, expect, it } from "vitest";

import { chatGroupOf, groupChats } from "./chat-history";

// 2026-09-26 10:00 in Moscow (UTC+3).
const now = new Date("2026-09-26T07:00:00Z");

describe("the sidebar's chat groups", () => {
  it("counts days in the user's time zone", () => {
    // 00:30 in Moscow today — still the 25th in UTC.
    expect(
      chatGroupOf(new Date("2026-09-25T21:30:00Z"), now, "Europe/Moscow")
    ).toBe("today");
    // 23:50 in Moscow yesterday.
    expect(
      chatGroupOf(new Date("2026-09-25T20:50:00Z"), now, "Europe/Moscow")
    ).toBe("yesterday");
    // The same moment is still the 25th, 13:50, in Los Angeles — where it is the 26th, 00:00 now.
    expect(
      chatGroupOf(
        new Date("2026-09-25T20:50:00Z"),
        new Date("2026-09-26T07:00:00Z"),
        "America/Los_Angeles"
      )
    ).toBe("yesterday");
  });

  it("keeps a week together, then the rest", () => {
    expect(
      chatGroupOf(new Date("2026-09-24T12:00:00Z"), now, "Europe/Moscow")
    ).toBe("week");
    expect(
      chatGroupOf(new Date("2026-09-20T12:00:00Z"), now, "Europe/Moscow")
    ).toBe("week");
    expect(
      chatGroupOf(new Date("2026-09-19T12:00:00Z"), now, "Europe/Moscow")
    ).toBe("earlier");
    // A clock a little ahead of ours is not the future.
    expect(
      chatGroupOf(new Date("2026-09-26T07:05:00Z"), now, "Europe/Moscow")
    ).toBe("today");
  });

  it("keeps the order and leaves empty groups out", () => {
    const chats = [
      { group: "today" as const, id: "a" },
      { group: "earlier" as const, id: "c" },
      { group: "today" as const, id: "b" },
    ];
    expect(
      groupChats(chats).map((g) => [g.group, g.chats.map((c) => c.id)])
    ).toEqual([
      ["today", ["a", "b"]],
      ["earlier", ["c"]],
    ]);
  });
});
