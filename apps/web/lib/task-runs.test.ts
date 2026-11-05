import type { TaskRunRow } from "@metobe/core/tasks";
import { describe, expect, it } from "vitest";

import { hasAnswer } from "./task-runs";

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
