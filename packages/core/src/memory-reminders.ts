import "server-only";
import { user } from "@metobe/db/schema/auth";
import type { LetterBlock } from "@metobe/emails/blocks";
import { defaultLocale, isLocale } from "@metobe/i18n/config";
import { getTranslator } from "@metobe/i18n/translator";
import { eq } from "drizzle-orm";

import { getDb } from "./db";
import { getEnv } from "./env";
import { claimReminder, dueReminders, listRecords } from "./memory";
import { letterOf } from "./memory-digest";
import { isMemoryOnFor } from "./memory-write";
import { notify } from "./notify";
import { reminderButtons } from "./telegram-actions";

// A reminder the person asked for («напомни мне завтра в 15:00 позвонить Ольге», D43): the promise carries the moment
// (`remind_at`), and the worker's minute tick tells it when it comes, by `notify` — the mail, Telegram or both, as the
// person chose — with «Готово», «Через час», «Завтра» under it. It is claimed before it is sent, so two ticks do not
// both tell; one that was missed (the worker was down) goes at the next tick, late.

const app = () => new URL("/", getEnv().BETTER_AUTH_URL).toString();

/** One person's due reminders, told one by one. */
const tellOwner = async (ownerId: string, ids: string[]) => {
  if (!(await isMemoryOnFor(ownerId))) {
    return 0;
  }
  const [owner] = await getDb()
    .db.select({ locale: user.locale })
    .from(user)
    .where(eq(user.id, ownerId))
    .limit(1);
  const locale =
    owner?.locale && isLocale(owner.locale) ? owner.locale : defaultLocale;
  const t = await getTranslator(locale);
  const records = await listRecords(ownerId, { ids });
  let told = 0;
  for (const r of records) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one after another: each is claimed first
    if (!(await claimReminder(ownerId, r.id))) {
      continue;
    }
    const blocks: LetterBlock[] = [{ text: r.text, type: "p" }];
    // oxlint-disable-next-line eslint/no-await-in-loop -- in order
    const sent = await notify(ownerId, {
      blocks,
      buttons: reminderButtons(r.id, {
        done: t("reminder.done"),
        snooze: t("reminder.snooze"),
        tomorrow: t("reminder.tomorrow"),
      }),
      links: [{ href: app(), label: t("reminder.open") }],
      mail: () => letterOf(blocks, r.text, locale, t, "reminder"),
      title: t("reminder.title"),
    });
    if (sent.mail || sent.telegram) {
      told += 1;
    }
  }
  return told;
};

/** The worker's minute tick: the reminders whose moment has come. Never throws; a failure for one person does not stop the rest. */
export const sendDueReminders = async (now = new Date()) => {
  let told = 0;
  try {
    const due = await dueReminders(now);
    const byOwner = new Map<string, string[]>();
    for (const row of due) {
      byOwner.set(row.ownerId, [...(byOwner.get(row.ownerId) ?? []), row.id]);
    }
    for (const [ownerId, ids] of byOwner) {
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one person after another: each reads their own memory
        told += await tellOwner(ownerId, ids);
      } catch (error) {
        console.error("reminders: not told to", ownerId, error);
      }
    }
  } catch (error) {
    console.error("reminders: could not look for due reminders", error);
  }
  return told;
};
