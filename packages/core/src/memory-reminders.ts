import "server-only";
import { user } from "@metobe/db/schema/auth";
import type { LetterBlock } from "@metobe/emails/blocks";
import { defaultLocale, isLocale } from "@metobe/i18n/config";
import { getTranslator } from "@metobe/i18n/translator";
import { eq } from "drizzle-orm";

import { getDb } from "./db";
import { getEnv } from "./env";
import {
  claimReminder,
  dueReminders,
  listEntities,
  listRecords,
  rollReminder,
  setCommitmentStatus,
} from "./memory";
import type { MemoryEntity, MemoryRecord } from "./memory";
import { letterOf } from "./memory-digest";
import { sidesOf } from "./memory-today";
import { isMemoryOnFor } from "./memory-write";
import { notify } from "./notify";
import { reminderButtons } from "./telegram-actions";

// A reminder the person asked for («напомни мне завтра в 15:00 позвонить Ольге», D43): the promise carries the moment
// (`remind_at`), and the worker's minute tick tells it when it comes, by `notify` — the mail, Telegram or both, as the
// person chose — with «Готово», «Через час», «Завтра» under it. It is claimed before it is sent, so two ticks do not
// both tell; one that was missed (the worker was down) goes at the next tick, late. One that comes again moves on to
// its next time as it is claimed; a plain one — the person's own, owed to nobody — is done once it has reached them
// («Через час» and «Завтра» open it again).

const app = () => new URL("/", getEnv().BETTER_AUTH_URL).toString();

/** The person's own, owed to nobody, once: done when it has reached them. */
const isPlain = (r: MemoryRecord, cards: Map<string, MemoryEntity>) => {
  const { side, who } = sidesOf(r, cards);
  return side === "mine" && (!who || who.kind === "self") && !r.remindRepeat;
};

/** Claimed by this process: a plain one marked sent, one that comes again moved on. */
const claim = (ownerId: string, r: MemoryRecord, now: Date) =>
  r.remindRepeat && r.remindAt
    ? rollReminder(ownerId, r.id, r.remindAt, r.remindRepeat, now)
    : claimReminder(ownerId, r.id);

/** One person's due reminders, told one by one. */
const tellOwner = async (ownerId: string, ids: string[], now: Date) => {
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
  const [records, entities] = await Promise.all([
    listRecords(ownerId, { ids }),
    listEntities(ownerId),
  ]);
  const cards = new Map(entities.map((e) => [e.id, e]));
  let told = 0;
  for (const r of records) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one after another: each is claimed first
    if (!(await claim(ownerId, r, now))) {
      continue;
    }
    const blocks: LetterBlock[] = [{ text: r.text, type: "p" }];
    // oxlint-disable-next-line eslint/no-await-in-loop -- in order
    const sent = await notify(ownerId, {
      blocks,
      buttons: reminderButtons(
        r.id,
        {
          done: t("reminder.done"),
          snooze: t("reminder.snooze"),
          tomorrow: t("reminder.tomorrow"),
        },
        Boolean(r.remindRepeat)
      ),
      links: [{ href: app(), label: t("reminder.open") }],
      mail: () => letterOf(blocks, r.text, locale, t, "reminder"),
      title: t("reminder.title"),
    });
    if (sent.mail || sent.telegram) {
      told += 1;
      if (isPlain(r, cards)) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- in order
        await setCommitmentStatus(ownerId, r.id, "done");
      }
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
        told += await tellOwner(ownerId, ids, now);
      } catch (error) {
        console.error("reminders: not told to", ownerId, error);
      }
    }
  } catch (error) {
    console.error("reminders: could not look for due reminders", error);
  }
  return told;
};
