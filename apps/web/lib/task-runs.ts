import type { TaskRunRow } from "@metobe/core/tasks";

/** Whether a past run's answer can be opened: it got to a result, and its chat is there. */
export const hasAnswer = (r: TaskRunRow) =>
  r.status === "done" &&
  r.outcome !== null &&
  r.outcome !== "quiet" &&
  r.chatId !== null;
