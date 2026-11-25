"use server";

import {
  activeTelegramChat,
  markTelegramError,
  setNotifyPrefs,
  startTelegramLink,
  telegramChannel,
  unlinkTelegram,
} from "@metobe/core/channels";
import { setDigestTime } from "@metobe/core/memory-digest";
import { TelegramError, sendTelegram } from "@metobe/core/telegram";
import { getTranslations } from "next-intl/server";

import { getActiveContext } from "@/lib/context";

// The user's own channels (D43): Telegram is bound by a code the bot reads (the worker); these are the settings' calls.

/** A new link to the bot; refused while a chat is bound. */
export const startTelegram = async () => {
  const s = await getActiveContext();
  if (!s) {
    return { ok: false as const, reason: "auth" as const };
  }
  return startTelegramLink(s.user.id);
};

/** Where the channel stands now: the settings ask while the link waits for «Start» in the bot. */
export const telegramStatus = async () => {
  const s = await getActiveContext();
  return s ? await telegramChannel(s.user.id) : null;
};

export const unlinkTelegramChat = async () => {
  const s = await getActiveContext();
  if (!s) {
    return { ok: false as const };
  }
  await unlinkTelegram(s.user.id);
  return { ok: true as const };
};

/** A line to the chat, to see it works; a blocked bot turns the channel to an error. */
export const testTelegram = async () => {
  const s = await getActiveContext();
  if (!s) {
    return { ok: false as const };
  }
  const chat = await activeTelegramChat(s.user.id);
  if (!chat) {
    return { ok: false as const };
  }
  const t = await getTranslations("telegram");
  try {
    await sendTelegram(chat, t("test"));
    return { ok: true as const };
  } catch (error) {
    const blocked = error instanceof TelegramError && error.code === 403;
    if (blocked) {
      await markTelegramError(s.user.id, (error as Error).message);
    }
    return { blocked, ok: false as const };
  }
};

/** The switches: tell by mail, tell in Telegram (it needs a bound chat to do anything). */
export const saveNotify = async (prefs: {
  email?: boolean;
  telegram?: boolean;
}) => {
  const s = await getActiveContext();
  if (!s) {
    return { ok: false as const };
  }
  await setNotifyPrefs(s.user.id, prefs);
  return { ok: true as const };
};

/** The morning digest of «Не упустить»: its time (`09:00`), or null — off. */
export const saveDigest = async (time: string | null) => {
  const s = await getActiveContext();
  if (!s) {
    return { ok: false as const };
  }
  return { ok: await setDigestTime(s.user.id, time) };
};
