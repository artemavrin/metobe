import type { TaskRunRow } from "@metobe/core/tasks";
import { describe, expect, it } from "vitest";

import { resultOf, splitRuns } from "./task-runs";

const run = (
  id: string,
  status: TaskRunRow["status"],
  outcome: TaskRunRow["outcome"] = null
) => ({ chatId: `chat-${id}`, id, outcome, status }) as TaskRunRow;

describe("a task's runs on its page", () => {
  it("puts a run on its way on top, rows after the last result above it, older ones under the spoiler", () => {
    const runs = [
      run("q", "queued"),
      run("f", "failed"),
      run("n", "done", "quiet"),
      run("r", "done", "news"),
      run("o", "done", "news"),
    ];
    const s = splitRuns(runs);
    expect(s.active?.id).toBe("q");
    expect(s.since.map((r) => r.id)).toEqual(["f", "n"]);
    expect(s.result?.id).toBe("r");
    expect(s.past.map((r) => r.id)).toEqual(["o"]);
    expect(resultOf(runs)?.id).toBe("r");
  });

  it("keeps at most three rows above the result", () => {
    const s = splitRuns([
      run("1", "done", "quiet"),
      run("2", "done", "quiet"),
      run("3", "done", "quiet"),
      run("4", "done", "quiet"),
      run("r", "done", "question"),
    ]);
    expect(s.since.map((r) => r.id)).toEqual(["1", "2", "3"]);
    expect(s.past.map((r) => r.id)).toEqual(["4"]);
  });

  it("has no result when nothing was worth reading yet", () => {
    const s = splitRuns([run("1", "done", "quiet"), run("2", "failed")]);
    expect(s.result).toBeNull();
    expect(s.since).toHaveLength(2);
    expect(splitRuns([]).active).toBeNull();
  });
});
