import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { letterKindOf } = await import("./task-mail");

const run = (
  status: "done" | "failed",
  outcome: "news" | "quiet" | "question" | "action" | null,
  trigger: "schedule" | "manual" | "test" = "schedule"
) => ({ outcome, status, trigger });

describe("a task's letter", () => {
  it("goes for a new result, a question and an action", () => {
    expect(letterKindOf(run("done", "news"), 0)).toBe("result");
    expect(letterKindOf(run("done", "question"), 0)).toBe("question");
    expect(letterKindOf(run("done", "action"), 0)).toBe("action");
  });

  it("never goes for nothing new, nor for a test run", () => {
    expect(letterKindOf(run("done", "quiet"), 0)).toBeNull();
    expect(letterKindOf(run("done", "news", "test"), 0)).toBeNull();
    expect(letterKindOf(run("failed", null, "test"), 1)).toBeNull();
  });

  it("goes once for failures in a row — at the first — and again for the stop after them", () => {
    expect(letterKindOf(run("failed", null), 1)).toBe("action");
    expect(letterKindOf(run("failed", null), 2)).toBeNull();
    expect(letterKindOf(run("failed", "action"), 5)).toBe("action");
  });
});
