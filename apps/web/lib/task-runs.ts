import type { TaskRunRow } from "@metobe/core/tasks";

// How the task page lays out its runs (P12 «Последний итог»): a run on its way on top, then what came after the last
// result in rows (a failure, «нового нет»), the result itself whole, and everything older under the spoiler. Runs come
// newest first.

/** How many runs after the result stand as rows above it; older ones go under the spoiler. */
const SINCE_ROWS = 3;

const ACTIVE = new Set(["queued", "running"]);

/** A run with something to read: a result, a question, an action for the person. */
const isResult = (r: TaskRunRow) =>
  r.status === "done" && r.outcome !== null && r.outcome !== "quiet";

/** The last run worth reading whole, or none. */
export const resultOf = (runs: TaskRunRow[]) =>
  runs.find((r) => !ACTIVE.has(r.status) && isResult(r)) ?? null;

export const splitRuns = (runs: TaskRunRow[]) => {
  const active = runs.find((r) => ACTIVE.has(r.status)) ?? null;
  const finished = runs.filter((r) => !ACTIVE.has(r.status));
  const at = finished.findIndex(isResult);
  const before = at === -1 ? finished : finished.slice(0, at);
  return {
    active,
    past: [
      ...before.slice(SINCE_ROWS),
      ...(at === -1 ? [] : finished.slice(at + 1)),
    ],
    result: at === -1 ? null : (finished[at] ?? null),
    since: before.slice(0, SINCE_ROWS),
  };
};

/** Whether a run's answer can be opened: it got to a result. */
export const hasAnswer = (r: TaskRunRow) => isResult(r) && r.chatId !== null;
