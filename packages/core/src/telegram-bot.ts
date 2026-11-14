import "server-only";
import { setTimeout as sleep } from "node:timers/promises";

import { user } from "@metobe/db/schema/auth";
import { defaultLocale, isLocale } from "@metobe/i18n/config";
import type { Locale } from "@metobe/i18n/config";
import { getTranslator } from "@metobe/i18n/translator";
import { eq } from "drizzle-orm";

import { completeTelegramLink, userOfChat } from "./channels";
import { getDb } from "./db";
import {
  answerCallback,
  getUpdates,
  sendTelegram,
  sendTyping,
  setButtons,
  telegramToken,
} from "./telegram";
import type { TelegramUpdate, TelegramUser } from "./telegram";
import { parseAction, runAction } from "./telegram-actions";
import { answerBlocks, messageText } from "./telegram-answer";
import { NoChatModelError, answerTelegram } from "./telegram-chat";
import { telegramHtml } from "./telegram-text";

// What the bot does when someone writes to it (D43). «Start» with a code binds a chat to an account; in a bound chat
// what the person writes is answered the chat's way (`telegram-chat`, шаг 7); an unbound one gets a line saying what
// the bot is. Groups are not answered. The worker reads the updates by long polling —
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

/** A press on a button under a digest: whose chat it is is known from the bot's binding, nothing is taken on trust. */
export const answerPress = async (update: TelegramUpdate) => {
  const press = update.callback_query;
  if (!press) {
    return;
  }
  const t = await getTranslator(localeOf(press.from));
  const chat = press.message?.chat.id;
  const action = parseAction(press.data);
  const owner = chat === undefined ? null : await userOfChat(String(chat));
  if (!(chat !== undefined && action && owner)) {
    await answerCallback(press.id, t("telegram.press.gone"));
    return;
  }
  const result = await runAction(owner, action);
  await answerCallback(press.id, t(`telegram.press.${result}`));
  // The promise has had its say: its row of buttons goes, the others stay.
  const rows = press.message?.reply_markup?.inline_keyboard;
  if (rows && press.message) {
    await setButtons(
      String(chat),
      press.message.message_id,
      rows.filter(
        (row) => !row.some((b) => b.callback_data?.endsWith(action.id))
      )
    );
  }
};

// ── A bound chat: what the person writes is answered ───────────────────────────────────────────────────────────────

/**
 * A comment and the messages forwarded with it come as separate updates a moment apart: what a chat sends within this
 * long of its last message is answered as one.
 */
const GATHER_MS = 1500;
/** «печатает…» lasts five seconds: it is said again while the answer is being written. */
const TYPING_MS = 4500;

const gathered = new Map<
  string,
  { owner: string; texts: string[]; timer: NodeJS.Timeout }
>();
/** One answer at a time in a chat, in the order its messages came. */
const answering = new Map<string, Promise<void>>();

/** The owner's language and zone: the answer speaks the one and counts days in the other. */
const ownerPrefs = async (owner: string) => {
  const [row] = await getDb()
    .db.select({ locale: user.locale, timeZone: user.timeZone })
    .from(user)
    .where(eq(user.id, owner))
    .limit(1);
  return {
    locale: isLocale(row?.locale) ? row.locale : defaultLocale,
    timeZone: row?.timeZone ?? "UTC",
  };
};

/** Answers what a bound chat wrote; a failure is said in the chat, never thrown. */
export const answerChat = async (
  chatId: string,
  owner: string,
  text: string
) => {
  const { locale, timeZone } = await ownerPrefs(owner);
  const t = await getTranslator(locale);
  const typing = async () => {
    try {
      await sendTyping(chatId);
    } catch {
      // «печатает…» is a courtesy: the answer goes without it.
    }
  };
  void typing();
  const keep = setInterval(() => {
    void typing();
  }, TYPING_MS);
  try {
    const { answer } = await answerTelegram({ text, timeZone, userId: owner });
    const html = answer
      ? telegramHtml(
          answerBlocks(answer.parts, {
            locale,
            timeZone,
            words: {
              due: (date) => t("telegram.chat.due", { date }),
              late: t("telegram.chat.late"),
              more: (count) => t("telegram.chat.more", { count }),
            },
          })
        )
      : "";
    await sendTelegram(chatId, html || t("telegram.chat.empty"), {
      html: Boolean(html),
    });
  } catch (error) {
    console.error("telegram: no answer", error);
    try {
      await sendTelegram(
        chatId,
        t(
          error instanceof NoChatModelError
            ? "telegram.chat.noModel"
            : "telegram.chat.failed"
        )
      );
    } catch (sendError) {
      console.error("telegram: could not say the answer failed", sendError);
    }
  } finally {
    clearInterval(keep);
  }
};

/** After the chat's answer before it: never throws, so the next one in the chat is not held up. */
const answerInTurn = async (
  chatId: string,
  before: Promise<void> | undefined,
  owner: string,
  text: string
) => {
  await before;
  try {
    await answerChat(chatId, owner, text);
  } catch (error) {
    console.error("telegram: an answer failed", error);
  }
};

/** The chat's last answer, once done, is no longer waited for. */
const forget = async (chatId: string, done: Promise<void>) => {
  await done;
  if (answering.get(chatId) === done) {
    answering.delete(chatId);
  }
};

const flush = (chatId: string) => {
  const batch = gathered.get(chatId);
  gathered.delete(chatId);
  if (!batch) {
    return;
  }
  const next = answerInTurn(
    chatId,
    answering.get(chatId),
    batch.owner,
    batch.texts.join("\n\n")
  );
  answering.set(chatId, next);
  void forget(chatId, next);
};

/** Keeps a bound chat's message for a moment: what follows it soon is answered with it. */
const gather = (chatId: string, owner: string, text: string) => {
  const batch = gathered.get(chatId);
  if (batch) {
    clearTimeout(batch.timer);
  }
  gathered.set(chatId, {
    owner,
    texts: [...(batch?.texts ?? []), text],
    timer: setTimeout(() => flush(chatId), GATHER_MS),
  });
};

/** A bound chat's message: kept to be answered; a message with no words gets a line why not. True — it was theirs. */
const takeMessage = async (update: TelegramUpdate) => {
  const { message } = update;
  if (
    !message ||
    message.chat.type !== "private" ||
    (message.text && START.test(message.text.trim()))
  ) {
    return false;
  }
  const chatId = String(message.chat.id);
  const owner = await userOfChat(chatId);
  if (!owner) {
    return false;
  }
  const { locale } = await ownerPrefs(owner);
  const t = await getTranslator(locale);
  const text = messageText(message, (name) =>
    name
      ? t("telegram.chat.forwarded", { name })
      : t("telegram.chat.forwardedAnon")
  );
  if (text) {
    gather(chatId, owner, text);
  } else {
    await sendTelegram(chatId, t("telegram.chat.onlyText"));
  }
  return true;
};

/** One update from the bot's reader: a press, a bound chat's message, or a line for anyone else. Never throws. */
export const handleUpdate = async (update: TelegramUpdate) => {
  try {
    if (update.callback_query) {
      await answerPress(update);
      return;
    }
    if (await takeMessage(update)) {
      return;
    }
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
          await handleUpdate(update);
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
