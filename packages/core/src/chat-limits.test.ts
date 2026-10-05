import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const stored: { rateLimits?: unknown } = {};
vi.mock("./policies", () => ({
  mergePolicies: (patch: Record<string, unknown>) => {
    Object.assign(stored, patch);
    return Promise.resolve();
  },
  readPolicies: () => Promise.resolve(stored),
}));

const { checkChatLimit, setChatLimits } = await import("./chat-limits");

const send = async (user: Parameters<typeof checkChatLimit>[0], n: number) => {
  const answers = [];
  for (let i = 0; i < n; i += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each message is counted after the one before it
    answers.push(await checkChatLimit(user));
  }
  return answers;
};

describe("the limit on chat messages", () => {
  it("stops a member past the minute's limit", async () => {
    await setChatLimits({
      admin: { perDay: null, perMinute: null },
      user: { perDay: null, perMinute: 2 },
    });
    const user = { id: crypto.randomUUID(), role: "user" };
    expect(await send(user, 3)).toEqual([null, null, "too-fast"]);
  });

  it("stops one past the day's limit", async () => {
    await setChatLimits({
      admin: { perDay: 2, perMinute: 100 },
      user: { perDay: null, perMinute: null },
    });
    const admin = {
      id: crypto.randomUUID(),
      role: "admin",
      timeZone: "Europe/Moscow",
    };
    expect(await send(admin, 3)).toEqual([null, null, "daily-limit"]);
  });

  it("never stops the owner, and reads an unknown role as a member", async () => {
    await setChatLimits({
      admin: { perDay: 1, perMinute: 1 },
      user: { perDay: 1, perMinute: 1 },
    });
    expect(
      await send({ id: crypto.randomUUID(), role: "superuser" }, 3)
    ).toEqual([null, null, null]);
    expect(await send({ id: crypto.randomUUID(), role: "guest" }, 2)).toEqual([
      null,
      "too-fast",
    ]);
  });
});
