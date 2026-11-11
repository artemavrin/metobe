import "server-only";
import { user } from "@metobe/db/schema/auth";
import type { LetterBlock } from "@metobe/emails/blocks";
import { eq } from "drizzle-orm";

import { activeTelegramChat, markTelegramError } from "./channels";
import { getDb } from "./db";
import { isMailConfigured, sendMail } from "./mail";
import { TelegramError, sendTelegram } from "./telegram";
import { escapeHtml, telegramHtml } from "./telegram-text";

// One way to tell a user something (D43): `notify` picks the channels they chose — the mail, the Telegram chat they
// bound, or both — and draws the message for each from what the source gives. What to send, and when, stays with the
// source (a task's flag, a digest's rule); the user chooses only where. It never throws: a channel that did not
// deliver is logged, and the others still go.

export interface Notice {
  /** What it is, in a line: the task's name with its label. Bold at the head of a Telegram message. */
  title: string;
  /** The body, in the blocks the letters draw (`letter-blocks`). */
  blocks?: LetterBlock[];
  /** Links under the message; the first is the one that opens the thing in the app. */
  links?: { href: string; label: string }[];
  /** Buttons under the Telegram message, a row each: what they do is the bot's (`telegram-actions`). */
  buttons?: { text: string; data: string }[][];
  /** The finished letter for the mail; asked for only when the mail is used. */
  mail?: () => Promise<{
    subject: string;
    html: string;
    text: string;
    headers?: Record<string, string>;
  }>;
}

export interface Delivery {
  mail: boolean;
  telegram: boolean;
}

/** A Telegram message: the title in bold, the body, then the links one under another. */
export const telegramMessage = (notice: Notice) => {
  const links = (notice.links ?? [])
    .map(
      (l) =>
        `<a href="${escapeHtml(l.href).replaceAll('"', "&quot;")}">${escapeHtml(l.label)}</a>`
    )
    .join("\n");
  const head = `<b>${escapeHtml(notice.title)}</b>`;
  const tail = links ? `\n\n${links}` : "";
  // The body takes what the head and the links leave of the limit.
  const room = 4096 - head.length - tail.length - 4;
  const body = notice.blocks
    ? telegramHtml(notice.blocks, { limit: Math.max(200, room) })
    : "";
  return `${head}${body ? `\n\n${body}` : ""}${tail}`;
};

export const notify = async (
  userId: string,
  notice: Notice
): Promise<Delivery> => {
  const done: Delivery = { mail: false, telegram: false };
  try {
    const [row] = await getDb()
      .db.select({
        email: user.email,
        mail: user.notifyEmail,
        telegram: user.notifyTelegram,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!row) {
      return done;
    }
    if (row.mail && notice.mail && (await isMailConfigured())) {
      try {
        await sendMail({ ...(await notice.mail()), to: row.email });
        done.mail = true;
      } catch (error) {
        console.error("notify: the letter was not sent", error);
      }
    }
    if (row.telegram) {
      const chat = await activeTelegramChat(userId);
      if (chat) {
        try {
          await sendTelegram(chat, telegramMessage(notice), {
            buttons: notice.buttons,
            html: true,
          });
          done.telegram = true;
        } catch (error) {
          console.error("notify: the Telegram message was not sent", error);
          // The person blocked the bot: the settings say so, and nothing more goes until a new link.
          if (error instanceof TelegramError && error.code === 403) {
            await markTelegramError(userId, error.message);
          }
        }
      }
    }
  } catch (error) {
    console.error("notify: could not tell", error);
  }
  return done;
};
