import "server-only";
import { setTimeout as sleep } from "node:timers/promises";

import { defaultLocale, isLocale } from "@metobe/i18n/config";
import type { Locale } from "@metobe/i18n/config";
import { getTranslator } from "@metobe/i18n/translator";

import { completeTelegramLink } from "./channels";
import { getUpdates, sendTelegram, telegramToken } from "./telegram";
import type { TelegramUpdate, TelegramUser } from "./telegram";

// What the bot does when someone writes to it (D43). Only «Start» with a code binds a chat to an account; anything
// else gets a line saying what the bot is. Groups are not answered. The worker reads the updates by long polling —
// the installation may have no public address — with one reader per token: a second one (a dev next to a production
// with the same bot) would take the updates from the first, so each installation has a bot of its own.

const START = /^\/start(?:@\w+)?(?:\s+(?<code>[\w-]{8,64}))?\s*$/u;

const localeOf = (from: TelegramUser | undefined): Locale => {
  const code = from?.language_code?.slice(0, 2);
  return isLocale(code) ? code : defaultLocale;
};

/** The account's language, when the chat was just bound to one that has it; else the Telegram user's. */
const accountLocale = (
  done: { result: string; locale?: string | null },
  fallback: Locale
) =>
  done.result === "linked" && isLocale(done.locale) ? done.locale : fallback;

const shownName = (from: TelegramUser | undefined) =>
  from?.username ? `@${from.username}` : (from?.first_name ?? "Telegram");

/** The reply to a message of the bot's chat, or null for what is not answered. */
export const replyTo = async (update: TelegramUpdate) => {
  const { message } = update;
  if (!message || message.chat.type !== "private" || !message.text) {
    return null;
  }
  const match = START.exec(message.text.trim());
  const code = match?.groups?.code;
  let locale = localeOf(message.from);
  let key: "help" | "linked" | "invalid" | "taken" = "help";
  if (code) {
    const done = await completeTelegramLink(code, {
      display: shownName(message.from),
      id: String(message.chat.id),
    });
    key = done.result;
    // The language of the account answers once it is known.
    locale = accountLocale(done, locale);
  }
  const t = await getTranslator(locale);
  return { chatId: String(message.chat.id), text: t(`telegram.${key}`) };
};

const handle = async (update: TelegramUpdate) => {
  try {
    const reply = await replyTo(update);
    if (reply) {
      await sendTelegram(reply.chatId, reply.text);
    }
  } catch (error) {
    console.error("telegram: an update was not answered", error);
  }
};

const PAUSE_MS = 5000;
/** Starts the reader; returns how to stop it, or null while there is no bot. */
export const startTelegramWorker = () => {
  if (!telegramToken()) {
    return null;
  }
  const stop = new AbortController();
  const loop = async () => {
    let offset = 0;
    while (!stop.signal.aborted) {
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one poll after another: the offset follows the last update
        const updates = await getUpdates(offset, 25);
        for (const update of updates) {
          offset = update.update_id + 1;
          // oxlint-disable-next-line eslint/no-await-in-loop -- in order
          await handle(update);
        }
      } catch (error) {
        console.error("telegram: reading updates failed", error);
        // oxlint-disable-next-line eslint/no-await-in-loop -- a pause before the next try
        await sleep(PAUSE_MS);
      }
    }
  };
  void loop();
  return () => stop.abort();
};
