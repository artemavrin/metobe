import "server-only";
import type { MemorySuggestion } from "@metobe/contracts/memory";
import { user } from "@metobe/db/schema/auth";
import { eq } from "drizzle-orm";

import { getDb } from "./db";
import {
  dismissSuggestion,
  editCommitment,
  editReminder,
  listRecords,
  setPromiseReminder,
} from "./memory";
import type { MemoryRecord } from "./memory";
import { localMidnight } from "./memory-extract";

// The buttons under a digest in Telegram (D43): «✓ …» marks the promise done, «Завтра» moves its deadline a day on,
// «Убрать» takes it out of «Не упустить». Only what can be taken back on the page: no deletion, no sending. The press
// carries the action and the promise's id (`d:<uuid>` — 38 bytes, under Telegram's 64); whose it is, the bot knows from
// the chat, and the memory's own functions only touch the owner's records.

export type TelegramAction = "done" | "tomorrow" | "dismiss" | "snooze";
const CODE: Record<TelegramAction, string> = {
  dismiss: "x",
  done: "d",
  snooze: "s",
  tomorrow: "m",
};
const BY_CODE = new Map(
  Object.entries(CODE).map(([action, code]) => [code, action as TelegramAction])
);

const ID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/u;

/** What a button's data says, or null for anything else. */
export const parseAction = (data: string | undefined) => {
  const [code, id, ...rest] = (data ?? "").split(":");
  const action = BY_CODE.get(code ?? "");
  return action && id && ID.test(id) && rest.length === 0
    ? { action, id }
    : null;
};

export const actionData = (action: TelegramAction, id: string) =>
  `${CODE[action]}:${id}`;

const MAX_ROWS = 5;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const TITLE = 18;

const short = (text: string) =>
  text.length > TITLE ? `${text.slice(0, TITLE - 1).trimEnd()}…` : text;

/** A row of buttons for each of the first promises in the digest; rhythm and date rows have none. */
export const buttonsFor = (
  rows: MemorySuggestion[],
  words: { tomorrow: string; dismiss: string }
) =>
  rows
    .filter((r) => r.kind === "commitment")
    .slice(0, MAX_ROWS)
    .map((r) => [
      { data: actionData("done", r.id), text: `✓ ${short(r.text)}` },
      { data: actionData("tomorrow", r.id), text: words.tomorrow },
      { data: actionData("dismiss", r.id), text: words.dismiss },
    ]);

const dayKey = (at: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(at);

/** The next day's midnight in a zone: a promise moved «на завтра». */
export const tomorrowOf = (now: Date, timeZone: string) => {
  const today = dayKey(now, timeZone);
  const next = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  return localMidnight(next, timeZone);
};

/** What came of a press: `gone` — no such open promise of theirs (done already, deleted, or somebody else's). */
export type ActionResult = TelegramAction | "gone";

/**
 * A press under a reminder (D45). «Готово» — a once one is done, one that comes again is marked for this time; about a
 * commitment, the commitment is done too. «Через час» — told again in an hour. «Завтра» — a day on, at the same time;
 * about a commitment, its deadline moves to tomorrow.
 */
const reminderAction = async (
  ownerId: string,
  action: TelegramAction,
  id: string,
  reminder: Extract<
    NonNullable<MemoryRecord["schedule"]>,
    { kind: "reminder" }
  >,
  { now, timeZone }: { now: Date; timeZone: string }
): Promise<ActionResult> => {
  const about = reminder.forRecordId;
  if (action === "done") {
    if (about) {
      await editCommitment(ownerId, about, { status: "done" });
    }
    return (await editReminder(ownerId, id, { done: true }, now))
      ? "done"
      : "gone";
  }
  if (action === "snooze") {
    return (await editReminder(ownerId, id, {
      at: new Date(now.getTime() + HOUR_MS),
    }))
      ? "snooze"
      : "gone";
  }
  if (action === "tomorrow") {
    const dueAt = tomorrowOf(now, timeZone);
    if (about && dueAt) {
      await editCommitment(ownerId, about, { dueAt });
    }
    const at = new Date(
      Math.max(reminder.nextAt.getTime(), now.getTime()) + DAY_MS
    );
    return (await editReminder(ownerId, id, { at })) ? "tomorrow" : "gone";
  }
  return about && (await dismissSuggestion(ownerId, about))
    ? "dismiss"
    : "gone";
};

/** Does what the press says, for the owner of the chat. */
export const runAction = async (
  ownerId: string,
  press: { action: TelegramAction; id: string },
  now = new Date()
): Promise<ActionResult> => {
  const { db } = getDb();
  const [owner] = await db
    .select({ timeZone: user.timeZone })
    .from(user)
    .where(eq(user.id, ownerId))
    .limit(1);
  const timeZone = owner?.timeZone ?? "UTC";
  const [record] = await listRecords(ownerId, { ids: [press.id] });
  if (record?.schedule?.kind === "reminder") {
    return reminderAction(ownerId, press.action, record.id, record.schedule, {
      now,
      timeZone,
    });
  }
  if (press.action === "done") {
    return (await editCommitment(ownerId, press.id, { status: "done" }))
      ? "done"
      : "gone";
  }
  // «Через час» on a promise: a reminder about it, in an hour.
  if (press.action === "snooze") {
    return record?.kind === "commitment" &&
      (await setPromiseReminder(
        ownerId,
        press.id,
        new Date(now.getTime() + HOUR_MS)
      ))
      ? "snooze"
      : "gone";
  }
  if (press.action === "tomorrow") {
    const dueAt = tomorrowOf(now, timeZone);
    return dueAt && (await editCommitment(ownerId, press.id, { dueAt }))
      ? "tomorrow"
      : "gone";
  }
  return (await dismissSuggestion(ownerId, press.id)) ? "dismiss" : "gone";
};

/**
 * The one row under a reminder: done, in an hour, tomorrow. One that comes again has «Готово» only: moving it would
 * move its time of day for every time after.
 */
export const reminderButtons = (
  id: string,
  words: { done: string; snooze: string; tomorrow: string },
  repeats = false
) => [
  [
    { data: actionData("done", id), text: words.done },
    ...(repeats
      ? []
      : [
          { data: actionData("snooze", id), text: words.snooze },
          { data: actionData("tomorrow", id), text: words.tomorrow },
        ]),
  ],
];
