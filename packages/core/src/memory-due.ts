import "server-only";
import type {
  MemoryDue,
  MemoryPromiseRow,
  MemoryStaleRow,
} from "@metobe/contracts/memory";

import {
  keepKey,
  lastChanges,
  listDismissals,
  listEntities,
  listRecords,
} from "./memory";
import type { MemoryEntity, MemoryRecord } from "./memory";
import { cardOf, dayKey, daysBetween, sidesOf } from "./memory-today";

// «Сроки» (Д6, P27) and «Сверка» (Д2, P20): two views of the open commitments that «Не упустить» does not give —
// what is ahead, day by day, and what has been open a long time with nothing happening to it. Plain reads, no model.
// The picking is functions without a base (`scheduleOf`, `staleOf`); the two at the bottom read and call them.

/** Days shown ahead of today: the next two weeks. */
export const DUE_DAYS = 14;
/** «Давно открыто»: no change, and given, this many days ago (ARCH §19.8.6); «Оставить» hides it as long. */
export const STALE_DAYS = 30;

const OPEN = new Set(["open", "unconfirmed"]);

const rowOf = (
  r: MemoryRecord,
  cards: Map<string, MemoryEntity>
): MemoryPromiseRow => {
  const { side, who } = sidesOf(r, cards);
  return {
    dueAt: r.dueAt?.toISOString() ?? null,
    id: r.id,
    important: r.important,
    side,
    status: r.status,
    text: r.text,
    who: cardOf(who),
  };
};

const byImportance = (a: MemoryPromiseRow, b: MemoryPromiseRow) =>
  Number(b.important) - Number(a.important) ||
  (a.dueAt ?? "").localeCompare(b.dueAt ?? "") ||
  a.text.localeCompare(b.text);

/**
 * The open commitments by day in the person's zone: past their day (the longest first), each of the next `DUE_DAYS`
 * days (today first, empty ones too — the screen draws a column for each), and the counts of those with no day and
 * those beyond the days shown.
 */
export const scheduleOf = (
  records: MemoryRecord[],
  cards: Map<string, MemoryEntity>,
  now: Date,
  timeZone: string
): MemoryDue => {
  const today = dayKey(now, timeZone);
  const late: MemoryDue["late"] = [];
  const days = Array.from({ length: DUE_DAYS }, (_, offset) => ({
    day: dayKey(
      new Date(Date.parse(`${today}T12:00:00Z`) + offset * 86_400_000),
      "UTC"
    ),
    items: [] as MemoryPromiseRow[],
    offset,
  }));
  let none = 0;
  let later = 0;
  for (const r of records) {
    if (r.kind !== "commitment" || !OPEN.has(r.status ?? "") || r.deletedAt) {
      continue;
    }
    if (!r.dueAt) {
      none += 1;
      continue;
    }
    const offset = daysBetween(today, dayKey(r.dueAt, timeZone));
    if (offset < 0) {
      late.push({ ...rowOf(r, cards), days: -offset });
    } else if (offset < DUE_DAYS) {
      days[offset]?.items.push(rowOf(r, cards));
    } else {
      later += 1;
    }
  }
  for (const day of days) {
    day.items.sort(byImportance);
  }
  late.sort((a, b) => b.days - a.days || byImportance(a, b));
  return { days, late, later, none, today };
};

/**
 * Commitments open a long time: open or «ждёт проверки», no change in `STALE_DAYS`, given earlier than that, with a
 * deadline that is not ahead — and not kept by «Оставить» within `STALE_DAYS`. The longest quiet first.
 */
export const staleOf = (
  records: MemoryRecord[],
  cards: Map<string, MemoryEntity>,
  changed: ReadonlyMap<string, Date>,
  kept: ReadonlyMap<string, Date>,
  now: Date,
  timeZone: string
): MemoryStaleRow[] => {
  const today = dayKey(now, timeZone);
  const quietOf = (r: MemoryRecord) =>
    daysBetween(
      dayKey(changed.get(r.id) ?? r.givenAt ?? r.recordedAt, timeZone),
      today
    );
  const rows: MemoryStaleRow[] = [];
  for (const r of records) {
    if (r.kind !== "commitment" || !OPEN.has(r.status ?? "") || r.deletedAt) {
      continue;
    }
    const given = r.givenAt ?? r.recordedAt;
    if (daysBetween(dayKey(given, timeZone), today) < STALE_DAYS) {
      continue;
    }
    const quiet = quietOf(r);
    if (quiet < STALE_DAYS) {
      continue;
    }
    if (r.dueAt && daysBetween(today, dayKey(r.dueAt, timeZone)) > 0) {
      continue;
    }
    const keptAt = kept.get(r.id);
    if (keptAt && daysBetween(dayKey(keptAt, timeZone), today) < STALE_DAYS) {
      continue;
    }
    rows.push({
      ...rowOf(r, cards),
      givenAt: r.givenAt?.toISOString() ?? null,
      quiet,
    });
  }
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts its own array; toSorted is past the ES2022 target
  return rows.sort((a, b) => b.quiet - a.quiet || byImportance(a, b));
};

export const memoryDue = async (
  ownerId: string,
  timeZone: string,
  now = new Date()
) => {
  const [records, entities] = await Promise.all([
    listRecords(ownerId, { kinds: ["commitment"] }),
    listEntities(ownerId),
  ]);
  return scheduleOf(
    records,
    new Map(entities.map((e) => [e.id, e])),
    now,
    timeZone
  );
};

export const memoryStale = async (
  ownerId: string,
  timeZone: string,
  now = new Date()
) => {
  const [records, entities, changed, dismissed] = await Promise.all([
    listRecords(ownerId, { kinds: ["commitment"] }),
    listEntities(ownerId),
    lastChanges(ownerId),
    listDismissals(ownerId),
  ]);
  const kept = new Map(
    records.flatMap((r): [string, Date][] => {
      const row = dismissed.get(keepKey(r.id));
      return row ? [[r.id, row.at]] : [];
    })
  );
  return staleOf(
    records,
    new Map(entities.map((e) => [e.id, e])),
    changed,
    kept,
    now,
    timeZone
  );
};
