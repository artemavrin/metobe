import "server-only";
import type {
  MemoryDue,
  MemoryPromiseCreate,
  MemoryPromiseRow,
  MemoryStaleRow,
} from "@metobe/contracts/memory";

import {
  addRecord,
  ensureSelf,
  keepKey,
  lastChanges,
  listDismissals,
  listEntities,
  listRecords,
  reviewKey,
} from "./memory";
import type { MemoryEntity, MemoryRecord, MemoryRecordInput } from "./memory";
import { cardOf, dayKey, daysBetween, sidesOf } from "./memory-today";

// «Сроки» (Д6, P27) and «Сверка» (Д2, P20): two views of the open commitments that «Не упустить» does not give —
// what is ahead, day by day, and what has been open a long time with nothing happening to it. Plain reads, no model.
// The picking is functions without a base (`scheduleOf`, `staleOf`); the two at the bottom read and call them.

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
 * The open commitments for a calendar: each with a deadline, the nearest first, and the number of those with none.
 * What day a deadline falls on is the screen's to say, in the person's zone.
 */
export const scheduleOf = (
  records: MemoryRecord[],
  cards: Map<string, MemoryEntity>,
  now: Date,
  timeZone: string
): MemoryDue => {
  const rows: MemoryDue["rows"] = [];
  let none = 0;
  for (const r of records) {
    if (r.kind !== "commitment" || !OPEN.has(r.status ?? "") || r.deletedAt) {
      continue;
    }
    if (r.dueAt) {
      rows.push({
        ...rowOf(r, cards),
        cards: r.entities.map((e) => e.entityId),
        dueAt: r.dueAt.toISOString(),
        remindAt: r.remindAt?.toISOString() ?? null,
        reminded: r.remindedAt !== null,
      });
    } else {
      none += 1;
    }
  }
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts its own array; toSorted is past the ES2022 target
  rows.sort(byImportance);
  return { none, rows, today: dayKey(now, timeZone) };
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

/** The Monday of the week a moment falls in, in the person's zone: `2026-11-09`. «Сверку» is put away for a week by it. */
export const weekStart = (now: Date, timeZone: string) => {
  const [year, month, day] = dayKey(now, timeZone).split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
};

/**
 * How many long-open promises the «Сверка» row of «Не упустить» stands for (ARCH §19.8.6): those of `memoryStale`,
 * none once the person put the row away for this week.
 */
export const reviewCount = async (
  ownerId: string,
  timeZone: string,
  now = new Date()
) => {
  const [rows, dismissed] = await Promise.all([
    memoryStale(ownerId, timeZone, now),
    listDismissals(ownerId),
  ]);
  return dismissed.has(reviewKey(weekStart(now, timeZone))) ? 0 : rows.length;
};

/**
 * A promise written by hand: the person's own («mine»: they owe, to the card if one is named) or a card's to them. Null
 * when the card is not the owner's. No model is asked: what is typed is what is kept.
 */
export const createPromise = async (
  ownerId: string,
  ownerName: string,
  input: MemoryPromiseCreate
) => {
  const self = await ensureSelf(ownerId, ownerName);
  let other: string | null = null;
  if (input.card) {
    const cards = await listEntities(ownerId);
    other = cards.find((e) => e.id === input.card)?.id ?? null;
    if (!other) {
      return null;
    }
  }
  const mine = input.side === "mine";
  const entities: MemoryRecordInput["entities"] = [
    { entityId: mine ? self.id : (other ?? self.id), role: "debtor" },
  ];
  if (mine && other) {
    entities.push({ entityId: other, role: "creditor" });
  } else if (!mine) {
    entities.push({ entityId: self.id, role: "creditor" });
  }
  const record = await addRecord(ownerId, {
    dueAt: new Date(input.dueAt),
    entities,
    givenAt: new Date(),
    important: input.important,
    kind: "commitment",
    remindAt: input.remindAt ? new Date(input.remindAt) : undefined,
    text: input.text,
  });
  return record.id;
};
