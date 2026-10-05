import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { allow } = await import("./rate-limit");

describe("the limit on how often something may be asked", () => {
  it("lets the first few through and then says no", async () => {
    const key = `t:${crypto.randomUUID()}`;
    const answers = await Promise.all(
      Array.from({ length: 5 }, () => allow(key, 3, 60))
    );
    expect(answers).toEqual([true, true, true, false, false]);
  });

  it("counts each key on its own", async () => {
    const [a, b] = [`a:${crypto.randomUUID()}`, `b:${crypto.randomUUID()}`];
    await allow(a, 1, 60);
    expect(await allow(a, 1, 60)).toBe(false);
    expect(await allow(b, 1, 60)).toBe(true);
  });

  it("starts over when the window is over", async () => {
    vi.useFakeTimers();
    try {
      const key = `w:${crypto.randomUUID()}`;
      expect(await allow(key, 1, 10)).toBe(true);
      expect(await allow(key, 1, 10)).toBe(false);
      vi.advanceTimersByTime(10_001);
      expect(await allow(key, 1, 10)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("asking for a sign-in code", () => {
  it("stops a fifth address's sixth ask, whoever sends it", async () => {
    const { mayAskForCode } = await import("./rate-limit");
    const email = `${crypto.randomUUID()}@acme.test`;
    const answers = [];
    for (let i = 0; i < 7; i += 1) {
      // oxlint-disable-next-line no-await-in-loop -- each ask is counted after the one before it
      answers.push(await mayAskForCode(email, null));
    }
    expect(answers).toEqual([true, true, true, true, true, false, false]);
  });

  it("stops one IP asking for many addresses", async () => {
    const { mayAskForCode } = await import("./rate-limit");
    const ip = `10.${Math.floor(Math.random() * 250)}.1.1`;
    const answers = [];
    for (let i = 0; i < 22; i += 1) {
      // oxlint-disable-next-line no-await-in-loop -- each ask is counted after the one before it
      answers.push(await mayAskForCode(`${crypto.randomUUID()}@acme.test`, ip));
    }
    expect(answers.filter(Boolean)).toHaveLength(20);
  });
});
