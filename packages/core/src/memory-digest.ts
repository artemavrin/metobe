import "server-only";
import type { MemorySuggestion } from "@metobe/contracts/memory";
import { user } from "@metobe/db/schema/auth";
import type { LetterBlock } from "@metobe/emails/blocks";
import { defaultLocale, isLocale } from "@metobe/i18n/config";
import type { Locale } from "@metobe/i18n/config";
import { getTranslator } from "@metobe/i18n/translator";
import { and, eq, isNotNull, isNull, ne, or } from "drizzle-orm";

import { getDb } from "./db";
import { getEnv } from "./env";
import { todaySuggestions } from "./memory-today";
import { isMemoryOnFor } from "./memory-write";
import { notify } from "./notify";
import { buttonsFor } from "./telegram-actions";

// The morning digest of «Не упустить» (D43): at the time the person chose, one message with what is in front of them —
// past its day, today, waiting for others, days that come, rhythms. It goes by `notify`, so where is their choice. It
// goes once a day and only when there is a row that was not in the last one: the same list is not sent twice.

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;
/** Rows in the message; the rest is counted. */
const MAX_ROWS = 15;

export const isDigestTime = (value: string) => TIME.test(value);

/** The local day (`2026-11-11`) and time (`09:30`) in a zone. */
export const localNow = (now: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(now);
  const at = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  // Some engines write midnight as 24.
  const hour = at("hour") === "24" ? "00" : at("hour");
  return {
    day: `${at("year")}-${at("month")}-${at("day")}`,
    time: `${hour}:${at("minute")}`,
  };
};

/** Whether the digest is due: its time has come in the person's day, and it has not gone today. */
export const digestDue = (
  settings: { time: string | null; sentOn: string | null },
  now: Date,
  timeZone: string
) => {
  if (!(settings.time && isDigestTime(settings.time))) {
    return false;
  }
  const local = localNow(now, timeZone);
  return local.time >= settings.time && settings.sentOn !== local.day;
};

/** The rows the last digest did not carry. */
export const freshRows = (
  rows: MemorySuggestion[],
  before: readonly string[] | null
) => {
  const had = new Set(before);
  return rows.filter((r) => !had.has(r.key));
};

const normalize = (s: string) => s.toLocaleLowerCase("ru").replaceAll("ё", "е");

/** «Ольга Ли: Прислать договор», unless the text already names them. */
const labelOf = (row: MemorySuggestion) => {
  if (!row.who) {
    return row.text;
  }
  const text = normalize(row.text);
  const said = normalize(row.who.name)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4)
    .some((w) => text.includes(w.slice(0, Math.max(4, w.length - 2))));
  return said ? row.text : `${row.who.name}: ${row.text}`;
};

/** The rows as a list the letters and Telegram both draw; `why` says each in words («просрочено на 3 дн.»). */
export const digestBlocks = (
  rows: MemorySuggestion[],
  why: (row: MemorySuggestion) => string,
  more: (count: number) => string
): LetterBlock[] => {
  const shown = rows.slice(0, MAX_ROWS);
  const blocks: LetterBlock[] = [
    {
      items: shown.map((r) => ({ strong: labelOf(r), text: `— ${why(r)}` })),
      type: "list",
    },
  ];
  if (rows.length > shown.length) {
    blocks.push({ text: more(rows.length - shown.length), type: "p" });
  }
  return blocks;
};

/** The letter of a notice (a digest, a reminder): the task letter's template with the notice's own words (`scope`). */
export const letterOf = async (
  blocks: LetterBlock[],
  heading: string,
  locale: Locale,
  t: Awaited<ReturnType<typeof getTranslator>>,
  scope: "digest" | "reminder" = "digest"
) => {
  const { taskLetter } = await import("@metobe/emails/task-letter");
  const app = new URL("/", getEnv().BETTER_AUTH_URL).toString();
  const letter = await taskLetter({
    blocks,
    button: { href: app, label: t(`${scope}.open`) },
    heading,
    kind: "result",
    label: t(`${scope}.label`),
    locale,
    off: {
      href: new URL("/settings/account", app).toString(),
      label: t(`${scope}.off`),
    },
    preview: heading,
    task: { color: "#2a78d6", meta: "", name: t(`${scope}.name`) },
    why: t(`${scope}.why`),
  });
  return { ...letter, subject: `${t(`${scope}.name`)}: ${heading}` };
};

/** One person's digest, when it is due: claims the day first (two processes must not both send), then sends. */
const sendOne = async (
  row: {
    id: string;
    locale: string | null;
    timeZone: string | null;
    digestTime: string | null;
    digestSentOn: string | null;
    digestKeys: string[] | null;
  },
  now: Date
) => {
  const timeZone = row.timeZone ?? "UTC";
  if (
    !digestDue(
      { sentOn: row.digestSentOn, time: row.digestTime },
      now,
      timeZone
    )
  ) {
    return false;
  }
  const { day } = localNow(now, timeZone);
  const { db } = getDb();
  const claimed = await db
    .update(user)
    .set({ digestSentOn: day })
    .where(
      and(
        eq(user.id, row.id),
        or(isNull(user.digestSentOn), ne(user.digestSentOn, day))
      )
    )
    .returning({ id: user.id });
  if (claimed.length === 0 || !(await isMemoryOnFor(row.id))) {
    return false;
  }
  const rows = await todaySuggestions(row.id, timeZone, now);
  const keys = rows.map((r) => r.key);
  // Nothing new since the last one — or nothing at all: it does not go, and what is gone from the list is forgotten.
  if (freshRows(rows, row.digestKeys).length === 0) {
    await db.update(user).set({ digestKeys: keys }).where(eq(user.id, row.id));
    return false;
  }
  const locale =
    row.locale && isLocale(row.locale) ? row.locale : defaultLocale;
  const t = await getTranslator(locale);
  const blocks = digestBlocks(
    rows,
    (r) => t(`memory.forToday.why.${r.reason}`, { days: r.days }),
    (count) => t("digest.more", { count })
  );
  const heading = t("digest.heading", { count: rows.length });
  const app = new URL("/", getEnv().BETTER_AUTH_URL).toString();
  const sent = await notify(row.id, {
    blocks,
    buttons: buttonsFor(rows, {
      dismiss: t("digest.dismissButton"),
      tomorrow: t("digest.tomorrowButton"),
    }),
    links: [
      { href: app, label: t("digest.open") },
      {
        href: new URL("/settings/account", app).toString(),
        label: t("digest.off"),
      },
    ],
    mail: () => letterOf(blocks, heading, locale, t),
    title: `${t("digest.name")}: ${heading}`,
  });
  if (sent.mail || sent.telegram) {
    await db.update(user).set({ digestKeys: keys }).where(eq(user.id, row.id));
    return true;
  }
  return false;
};

/** The worker's minute tick: the digests that are due now. Never throws; a person's failure does not stop the others. */
export const sendDueDigests = async (now = new Date()) => {
  let sent = 0;
  try {
    const people = await getDb()
      .db.select({
        digestKeys: user.digestKeys,
        digestSentOn: user.digestSentOn,
        digestTime: user.digestTime,
        id: user.id,
        locale: user.locale,
        timeZone: user.timeZone,
      })
      .from(user)
      .where(and(isNotNull(user.digestTime), isNull(user.disabledAt)));
    for (const person of people) {
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one person after another: each reads their own memory
        if (await sendOne(person, now)) {
          sent += 1;
        }
      } catch (error) {
        console.error("digest: not sent to", person.id, error);
      }
    }
  } catch (error) {
    console.error("digest: could not look for due digests", error);
  }
  return sent;
};

/** The digest's time in the settings; null turns it off. */
export const setDigestTime = async (userId: string, time: string | null) => {
  if (time !== null && !isDigestTime(time)) {
    return false;
  }
  await getDb()
    .db.update(user)
    .set({ digestTime: time })
    .where(eq(user.id, userId));
  return true;
};

export const digestTimeOf = async (userId: string) => {
  const [row] = await getDb()
    .db.select({ time: user.digestTime })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.time ?? null;
};
