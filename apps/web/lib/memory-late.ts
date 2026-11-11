import type { MemoryDue } from "@metobe/contracts/memory";

import { dayKey } from "./memory-dates";

// «Просрочено» in one place (the «Память» page): the calendar's red bars, the line under it and the dots in the list
// on the left are all counted from the same rows, so a deadline moved over today changes all of them at once.

/** Whether a row's day is before today. */
export const isLate = (
  row: MemoryDue["rows"][number],
  today: string,
  timeZone: string
) => dayKey(new Date(row.dueAt), timeZone) < today;

/** How many open commitments of each card are past their day. A card with none is not in the map. */
export const lateByCard = (due: MemoryDue, timeZone: string) => {
  const counts = new Map<string, number>();
  for (const row of due.rows) {
    if (!isLate(row, due.today, timeZone)) {
      continue;
    }
    for (const id of row.cards) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
};
