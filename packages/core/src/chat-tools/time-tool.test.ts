import { describe, expect, it } from "vitest";

import { localTime, timeTool } from "./time-tool";

const run = async (userZone: string, input: { timeZone?: string }) => {
  const out = await timeTool(userZone).execute?.(input, {
    context: undefined,
    messages: [],
    toolCallId: "t",
  });
  return out as { local: string; timeZone: string; utc: string };
};

describe("the clock the model asks", () => {
  it("writes the day, the second and the zone", () => {
    const at = new Date("2026-09-29T22:52:10Z");
    expect(localTime(at, "Europe/Moscow")).toBe(
      "Wednesday, 30 September 2026, 01:52:10 (Europe/Moscow, GMT+3)"
    );
    expect(localTime(at, "America/New_York")).toContain("18:52:10");
  });

  it("answers in the user's zone, or in the one asked for", async () => {
    const own = await run("Europe/Moscow", {});
    const other = await run("Europe/Moscow", { timeZone: "Asia/Tokyo" });
    expect(own.timeZone).toBe("Europe/Moscow");
    expect(other.timeZone).toBe("Asia/Tokyo");
  });

  it("falls back to the user's zone for a name that is no zone", async () => {
    const out = await run("Europe/Moscow", { timeZone: "Mars/Olympus" });
    expect(out.timeZone).toBe("Europe/Moscow");
    expect(out.utc).toMatch(/Z$/u);
  });
});
