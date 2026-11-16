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
  lastChanges,
  listDismissals,
  listEntities,
  listRecords,
} from "./memory";
import type { MemoryEntity, MemoryRecord, MemoryRecordInput } from "./memory";
import {
  cardOf,
  dayKey,
  daysBetween,
  scheduleParts,
  sidesOf,
} from "./memory-today";

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

/** «Пришли и закрылись сами» looks back this far. */
const CLOSED_DAYS = 7;
/** A reminder done this soon after it went off was closed by its sending (`memory-reminders`), not by the person. */
const CLOSED_BY_SEND_MS = 120_000;

/** A reminder kept as a schedule (D45). */
type Reminder = Extract<
  NonNullable<MemoryRecord["schedule"]>,
  { kind: "reminder" }
>;

const reminderOf = (r: MemoryRecord): Reminder | null =>
  r.schedule?.kind === "reminder" && !r.supersededAt && !r.deletedAt
    ? r.schedule
    : null;

/** The person's own reminders that closed themselves when they came — the newest first. */
const closedBySendOf = (
  records: MemoryRecord[],
  now: Date
): MemoryDue["closedBySend"] => {
  const since = now.getTime() - CLOSED_DAYS * 86_400_000;
  return (
    records
      .flatMap((r) => {
        const s = reminderOf(r);
        if (
          !s?.firedAt ||
          s.repeat ||
          s.forRecordId ||
          !r.doneAt ||
          r.doneAt.getTime() < since ||
          Math.abs(r.doneAt.getTime() - s.firedAt.getTime()) > CLOSED_BY_SEND_MS
        ) {
          return [];
        }
        return [
          { id: r.id, remindedAt: s.firedAt.toISOString(), text: r.text },
        ];
      })
      // oxlint-disable-next-line unicorn/no-array-sort -- sorts the array `flatMap` made; toSorted is past the ES2022 target
      .sort((a, b) => b.remindedAt.localeCompare(a.remindedAt))
  );
};

/**
 * The open commitments for a calendar: each with a deadline, the nearest first, and the number of those with none. A
 * commitment shows its reminder; the person's own reminders (schedules, D45) are rows of their own on the day they go
 * off — the calendar and «Напоминания» read them as before. What day a deadline falls on is the screen's to say, in the
 * person's zone.
 */
export const scheduleOf = (
  records: MemoryRecord[],
  cards: Map<string, MemoryEntity>,
  now: Date,
  timeZone: string
): MemoryDue => {
  const reminders = new Map<string, Reminder>();
  for (const r of records) {
    const s = reminderOf(r);
    if (s?.forRecordId && !r.doneAt) {
      reminders.set(s.forRecordId, s);
    }
  }
  const remindOf = (s: Reminder | undefined) => ({
    remindAt: s?.nextAt.toISOString() ?? null,
    reminded: Boolean(s?.firedAt),
    repeat: s?.repeat ?? null,
    repeatDays: s?.days ?? null,
  });
  const rows: MemoryDue["rows"] = [];
  let none = 0;
  for (const r of records) {
    const own = reminderOf(r);
    if (own && !own.forRecordId && !r.doneAt) {
      rows.push({
        cards: r.entities.map((e) => e.entityId),
        dueAt: own.nextAt.toISOString(),
        id: r.id,
        important: false,
        side: "mine",
        status: "open",
        text: r.text,
        who: null,
        ...remindOf(own),
      });
      continue;
    }
    if (r.kind !== "commitment" || !OPEN.has(r.status ?? "") || r.deletedAt) {
      continue;
    }
    if (r.dueAt) {
      rows.push({
        ...rowOf(r, cards),
        cards: r.entities.map((e) => e.entityId),
        dueAt: r.dueAt.toISOString(),
        ...remindOf(reminders.get(r.id)),
      });
    } else {
      none += 1;
    }
  }
  // oxlint-disable-next-line unicorn/no-array-sort -- sorts its own array; toSorted is past the ES2022 target
  rows.sort(byImportance);
  return {
    closedBySend: closedBySendOf(records, now),
    dates: [],
    none,
    rhythms: [],
    rows,
    today: dayKey(now, timeZone),
  };
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
  const [records, entities, parts] = await Promise.all([
    listRecords(ownerId, { kinds: ["commitment", "schedule"] }),
    listEntities(ownerId),
    scheduleParts(ownerId, timeZone, now),
  ]);
  return {
    ...scheduleOf(
      records,
      new Map(entities.map((e) => [e.id, e])),
      now,
      timeZone
    ),
    ...parts,
  };
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
      const row = dismissed.get({ kind: "keep", recordId: r.id });
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
  return dismissed.has({ day: weekStart(now, timeZone), kind: "review" })
    ? 0
    : rows.length;
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
  // «Напомни позвонить Ольге» by hand: the person's own, owed to nobody — a reminder alone, no promise (D45).
  if (mine && !other && input.remindAt) {
    const reminder = await addRecord(ownerId, {
      entities: [],
      kind: "schedule",
      schedule: {
        at: new Date(input.remindAt),
        kind: "reminder",
        repeat: input.repeat ?? undefined,
      },
      text: input.text,
    });
    return reminder.id;
  }
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
    remind: input.remindAt
      ? { at: new Date(input.remindAt), repeat: input.repeat ?? undefined }
      : undefined,
    text: input.text,
  });
  return record.id;
};
