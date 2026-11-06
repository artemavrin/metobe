import type { TaskRunRow } from "@metobe/core/tasks";
import { describe, expect, it } from "vitest";

import { clock, hasAnswer } from "./task-runs";

const run = (
  status: TaskRunRow["status"],
  outcome: TaskRunRow["outcome"],
  chatId: string | null = "chat"
) => ({ chatId, outcome, status }) as TaskRunRow;

describe("a past run on the task's page", () => {
  it("opens its answer only when it got to a result", () => {
    expect(hasAnswer(run("done", "news"))).toBe(true);
    expect(hasAnswer(run("done", "question"))).toBe(true);
    expect(hasAnswer(run("done", "quiet"))).toBe(false);
    expect(hasAnswer(run("failed", null))).toBe(false);
    expect(hasAnswer(run("done", "news", null))).toBe(false);
  });
});

describe("a time of day", () => {
  it("is the same wherever it is formatted: no leading zero in Russian, AM and PM in English", () => {
    const at = new Date("2026-11-06T06:35:00Z");
    expect(clock(at, "Europe/Moscow", "ru")).toBe("9:35");
    expect(clock(at, "Europe/Moscow", "en")).toBe("9:35 AM");
    expect(clock(new Date("2026-11-06T21:05:00Z"), "Europe/Moscow", "ru")).toBe(
      "0:05"
    );
    expect(clock(new Date("2026-11-06T09:00:00Z"), "Europe/Moscow", "en")).toBe(
      "12:00 PM"
    );
  });
});
