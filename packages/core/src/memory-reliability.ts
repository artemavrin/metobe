import type { MemoryReliability } from "@metobe/contracts/memory";

import type { MemoryRecord } from "./memory";

// «Надёжность» (Г2.2): how a side has kept its promises, by plain counts and without a model — never a mark of the
// person. A promise counts once it is done and had a deadline: «в срок» if the day it was marked done is not after the
// day of its deadline, «позже» otherwise. The day is the day the person said so, not the day it was done («прислала
// вчера» said a day late counts as late), so the words are «отмечено в срок». Fewer than three counted — nothing shown.

/** The least counted promises of a side to say anything about it. */
export const MIN_COUNTED = 3;

const DAY_MS = 86_400_000;

const dayKey = (at: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(at);

const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS
  );

const OPEN = new Set(["open", "unconfirmed"]);

const side = (r: MemoryRecord, role: "debtor" | "creditor") =>
  r.entities.find((e) => e.role === role)?.entityId;

const statOf = (
  mine: MemoryRecord[],
  moves: ReadonlyMap<string, number>,
  today: string,
  timeZone: string
): MemoryReliability["theirs"] => {
  let onTime = 0;
  let moved = 0;
  const lateBy: number[] = [];
  let overdueOpen = 0;
  for (const r of mine) {
    if (!r.dueAt) {
      continue;
    }
    if (r.status === "done" && r.doneAt) {
      moved += moves.get(r.id) ?? 0;
      const late = daysBetween(
        dayKey(r.dueAt, timeZone),
        dayKey(r.doneAt, timeZone)
      );
      if (late > 0) {
        lateBy.push(late);
      } else {
        onTime += 1;
      }
    } else if (
      OPEN.has(r.status ?? "") &&
      daysBetween(dayKey(r.dueAt, timeZone), today) > 0
    ) {
      overdueOpen += 1;
    }
  }
  const total = onTime + lateBy.length;
  if (total < MIN_COUNTED) {
    return null;
  }
  return {
    late: lateBy.length,
    lateDays:
      lateBy.length > 0
        ? Math.round(lateBy.reduce((a, b) => a + b, 0) / lateBy.length)
        : 0,
    moved,
    onTime,
    overdueOpen,
    total,
  };
};

/**
 * The two sides of a card: what it promised the person (`theirs`) and what the person promised it (`mine`). `records` —
 * the card's records, closed commitments too; `selfIds` — the person's own card; `moves` — how many times each
 * commitment's deadline was moved (`memory_changes`).
 */
export const reliabilityOf = (
  cardId: string,
  records: MemoryRecord[],
  selfIds: ReadonlySet<string>,
  moves: ReadonlyMap<string, number>,
  now: Date,
  timeZone: string
): MemoryReliability => {
  const today = dayKey(now, timeZone);
  const commitments = records.filter(
    (r) => r.kind === "commitment" && !r.deletedAt && !r.supersededAt
  );
  const theirs = commitments.filter(
    (r) =>
      side(r, "debtor") === cardId && selfIds.has(side(r, "creditor") ?? "")
  );
  const mine = commitments.filter(
    (r) =>
      side(r, "creditor") === cardId && selfIds.has(side(r, "debtor") ?? "")
  );
  return {
    mine: statOf(mine, moves, today, timeZone),
    theirs: statOf(theirs, moves, today, timeZone),
  };
};
