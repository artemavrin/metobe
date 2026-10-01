import { describe, expect, it } from "vitest";

import {
  activityRows,
  foldCount,
  opensByItself,
  summaryFacts,
} from "./activity";
import type { ActivityRow } from "./activity";
import type { ToolPart, WorkStep } from "./answer-work";

const call = (id: string, state: ToolPart["state"], name = "onec_stock") =>
  ({
    input: {},
    state,
    toolCallId: id,
    toolName: name,
    type: "dynamic-tool",
  }) as ToolPart;

const toolStep = (id: string, ...calls: ToolPart[]): WorkStep => ({
  calls,
  key: id,
  kind: "tool",
});
const thought = (id: string): WorkStep => ({
  key: id,
  kind: "thought",
  text: "…",
  timed: [`reasoning:${id}`],
});

const row = (state: ActivityRow["state"], count = 1): ActivityRow => ({
  count,
  key: state,
  ms: undefined,
  startedAt: undefined,
  state,
  step: thought("t"),
});

describe("the rows of the work", () => {
  it("takes a tool step's time from its calls, and says nothing for a call it did not see through", () => {
    const rows = activityRows(
      [
        toolStep(
          "a",
          call("c1", "output-available"),
          call("c2", "output-available")
        ),
        toolStep("b", call("c3", "output-available")),
      ],
      false,
      { stepMs: { c1: 800, c2: 700 } }
    );
    expect(rows[0]?.ms).toBe(1500);
    expect(rows[0]?.count).toBe(2);
    expect(rows[1]?.ms).toBeUndefined();
  });

  it("keeps a thought running only while it is the last thing and the work goes on", () => {
    const steps = [
      thought("a"),
      toolStep("b", call("c", "output-available")),
      thought("d"),
    ];
    expect(activityRows(steps, true).map((r) => r.state)).toEqual([
      "done",
      "done",
      "running",
    ]);
    expect(activityRows(steps, false).map((r) => r.state)).toEqual([
      "done",
      "done",
      "done",
    ]);
  });

  it("reads a call that waits, failed or was denied from its state", () => {
    const states = activityRows(
      [
        toolStep("a", call("1", "approval-requested")),
        toolStep("b", call("2", "output-error")),
        toolStep("c", call("3", "output-denied")),
        toolStep("d", call("4", "input-available")),
      ],
      true
    ).map((r) => r.state);
    expect(states).toEqual(["waiting", "failed", "denied", "running"]);
  });
});

describe("the time of a step that is still going", () => {
  it("runs from the server's start of the call, and keeps what the finished calls of the step took", () => {
    const [only] = activityRows(
      [
        toolStep(
          "a",
          call("c1", "output-available"),
          call("c2", "input-available")
        ),
      ],
      true,
      { stepMs: { c1: 800 }, stepStartedAt: { c1: 1000, c2: 5000 } }
    );
    expect(only?.startedAt).toBe(5000);
    expect(only?.ms).toBe(800);
  });

  it("has no start when the server did not say it, and none once the step is done", () => {
    const [going] = activityRows(
      [toolStep("a", call("c1", "input-available"))],
      true
    );
    expect(going?.startedAt).toBeUndefined();
    const [done] = activityRows(
      [toolStep("a", call("c1", "output-available"))],
      false,
      { stepStartedAt: { c1: 1000 } }
    );
    expect(done?.startedAt).toBeUndefined();
  });
});

describe("folding a long series", () => {
  it("folds nothing while the series is short", () => {
    expect(foldCount(Array.from({ length: 5 }, () => row("done")))).toBe(0);
  });

  it("folds all but the last three once it is long and finished", () => {
    expect(foldCount(Array.from({ length: 8 }, () => row("done")))).toBe(5);
  });

  it("keeps in sight an older step that is busy, waits or failed", () => {
    for (const state of ["running", "waiting", "failed"] as const) {
      const rows = [
        row(state),
        ...Array.from({ length: 7 }, () => row("done")),
      ];
      expect(opensByItself(row(state))).toBe(true);
      expect(foldCount(rows)).toBe(0);
    }
  });
});

describe("the summary", () => {
  it("counts every call as a step and leaves out what is not known", () => {
    const rows = [row("done", 5), row("done")];
    expect(summaryFacts(rows, 14_200)).toEqual({
      seconds: 14,
      steps: 6,
    });
    expect(summaryFacts(rows)).toEqual({
      seconds: null,
      steps: 6,
    });
    expect(summaryFacts(rows, 100).seconds).toBe(1);
  });

  it("times a thought by its own key, and counts on from its start while it goes", () => {
    const done = activityRows([thought("0")], false, {
      stepMs: { "reasoning:0": 1800 },
    });
    expect(done[0]?.ms).toBe(1800);
    const going = activityRows([thought("1")], true, {
      stepMs: {},
      stepStartedAt: { "reasoning:1": 5000 },
    });
    expect(going[0]).toMatchObject({ ms: undefined, startedAt: 5000 });
  });
});
