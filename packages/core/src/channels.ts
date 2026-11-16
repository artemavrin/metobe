import "server-only";
import { createHash, randomBytes } from "node:crypto";

import { user } from "@metobe/db/schema/auth";
import { userChannels } from "@metobe/db/schema/channels";
import { and, eq, gt } from "drizzle-orm";

import { getDb } from "./db";
import { botUsername, telegramToken } from "./telegram";

// Where Metobe may write to a user besides their mail (D43). The only channel now is a Telegram chat, bound by a one-time
// code the user takes to the bot: `startTelegramLink` makes the code and the `t.me` link, the worker's bot reads
// `/start <code>` and calls `completeTelegramLink`. What is kept of the code is its hash, for ten minutes.

const CODE_MINUTES = 10;

const hashOf = (code: string) =>
  createHash("sha256").update(code).digest("hex");

export interface TelegramChannel {
  status: "pending" | "active" | "error";
  /** `@name` or the first name; while active. */
  display: string | null;
  lastError: string | null;
}

/** Whether the installation has a bot at all — then the settings offer Telegram. */
export const telegramAvailable = () => telegramToken() !== null;

/** The user's Telegram channel as the settings show it; null — not started. */
export const telegramChannel = async (
  userId: string
): Promise<TelegramChannel | null> => {
  const [row] = await getDb()
    .db.select()
    .from(userChannels)
    .where(
      and(eq(userChannels.userId, userId), eq(userChannels.kind, "telegram"))
    )
    .limit(1);
  if (!row) {
    return null;
  }
  // A code that ran out is nothing: «Привязать» again.
  const expired =
    row.status === "pending" &&
    (!row.codeExpiresAt || row.codeExpiresAt.getTime() < Date.now());
  return expired
    ? null
    : { display: row.display, lastError: row.lastError, status: row.status };
};

/** A new code for the user's chat to be bound with. Refused while a chat is bound: unbind it first. */
export const startTelegramLink = async (userId: string) => {
  if (!telegramToken()) {
    return { ok: false as const, reason: "off" as const };
  }
  const existing = await telegramChannel(userId);
  if (existing?.status === "active") {
    return { ok: false as const, reason: "linked" as const };
  }
  const code = randomBytes(16).toString("base64url");
  const expiresAt = new Date(Date.now() + CODE_MINUTES * 60_000);
  const now = new Date();
  const fields = {
    chatId: null,
    codeExpiresAt: expiresAt,
    codeHash: hashOf(code),
    display: null,
    lastError: null,
    status: "pending" as const,
    updatedAt: now,
  };
  await getDb()
    .db.insert(userChannels)
    .values({ ...fields, kind: "telegram", userId })
    .onConflictDoUpdate({
      set: fields,
      target: [userChannels.userId, userChannels.kind],
    });
  const name = await botUsername();
  return {
    expiresAt: expiresAt.toISOString(),
    ok: true as const,
    url: `https://t.me/${name}?start=${code}`,
  };
};

/**
 * The bot read `/start <code>` from a private chat: the chat becomes the user's. `linked` — done (with who and in what
 * language to answer); `invalid` — no such code, or it ran out; `taken` — the chat is another account's.
 */
export const completeTelegramLink = async (
  code: string,
  chat: { id: string; display: string }
) => {
  const { db } = getDb();
  const [row] = await db
    .select({ id: userChannels.id, userId: userChannels.userId })
    .from(userChannels)
    .where(
      and(
        eq(userChannels.kind, "telegram"),
        eq(userChannels.codeHash, hashOf(code)),
        eq(userChannels.status, "pending"),
        gt(userChannels.codeExpiresAt, new Date())
      )
    )
    .limit(1);
  if (!row) {
    return { result: "invalid" as const };
  }
  const [other] = await db
    .select({ userId: userChannels.userId })
    .from(userChannels)
    .where(
      and(eq(userChannels.kind, "telegram"), eq(userChannels.chatId, chat.id))
    )
    .limit(1);
  if (other && other.userId !== row.userId) {
    return { result: "taken" as const };
  }
  await db
    .update(userChannels)
    .set({
      chatId: chat.id,
      codeExpiresAt: null,
      codeHash: null,
      display: chat.display,
      lastError: null,
      status: "active",
      updatedAt: new Date(),
    })
    .where(eq(userChannels.id, row.id));
  const [owner] = await db
    .select({ locale: user.locale, name: user.name })
    .from(user)
    .where(eq(user.id, row.userId))
    .limit(1);
  return {
    locale: owner?.locale ?? null,
    name: owner?.name ?? "",
    result: "linked" as const,
    userId: row.userId,
  };
};

/** The chat to write to, while the channel is active; null — none. */
export const activeTelegramChat = async (userId: string) => {
  const [row] = await getDb()
    .db.select({ chatId: userChannels.chatId })
    .from(userChannels)
    .where(
      and(
        eq(userChannels.userId, userId),
        eq(userChannels.kind, "telegram"),
        eq(userChannels.status, "active")
      )
    )
    .limit(1);
  return row?.chatId ?? null;
};

/** The channel is taken off; nothing is written to the chat any more. */
export const unlinkTelegram = async (userId: string) => {
  await getDb()
    .db.delete(userChannels)
    .where(
      and(eq(userChannels.userId, userId), eq(userChannels.kind, "telegram"))
    );
};

/** A send failed (the bot was blocked): the settings say so, and nothing more is sent until a new link. */
export const markTelegramError = async (userId: string, message: string) => {
  await getDb()
    .db.update(userChannels)
    .set({
      lastError: message.slice(0, 300),
      status: "error",
      updatedAt: new Date(),
    })
    .where(
      and(eq(userChannels.userId, userId), eq(userChannels.kind, "telegram"))
    );
};

/** Where the person wants to be told: the mail, the bound Telegram chat. */
export const notifyPrefs = async (userId: string) => {
  const [row] = await getDb()
    .db.select({ email: user.notifyEmail, telegram: user.notifyTelegram })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return { email: row?.email ?? true, telegram: row?.telegram ?? true };
};

export const setNotifyPrefs = async (
  userId: string,
  prefs: { email?: boolean; telegram?: boolean }
) => {
  const set = {
    ...(prefs.email === undefined ? {} : { notifyEmail: prefs.email }),
    ...(prefs.telegram === undefined ? {} : { notifyTelegram: prefs.telegram }),
  };
  if (Object.keys(set).length > 0) {
    await getDb().db.update(user).set(set).where(eq(user.id, userId));
  }
};

/** Whose chat this is: the account a Telegram chat is bound to; null — nobody's, or the channel is not active. */
export const userOfChat = async (chatId: string) => {
  const [row] = await getDb()
    .db.select({ userId: userChannels.userId })
    .from(userChannels)
    .where(
      and(
        eq(userChannels.kind, "telegram"),
        eq(userChannels.chatId, chatId),
        eq(userChannels.status, "active")
      )
    )
    .limit(1);
  return row?.userId ?? null;
};

/** The app's chat the bot's talk is kept in (шаг 7); null — none yet, or the person deleted it. */
export const telegramAppChat = async (userId: string) => {
  const [row] = await getDb()
    .db.select({ chatId: userChannels.appChatId })
    .from(userChannels)
    .where(
      and(eq(userChannels.userId, userId), eq(userChannels.kind, "telegram"))
    )
    .limit(1);
  return row?.chatId ?? null;
};

export const setTelegramAppChat = async (userId: string, chatId: string) => {
  await getDb()
    .db.update(userChannels)
    .set({ appChatId: chatId, updatedAt: new Date() })
    .where(
      and(eq(userChannels.userId, userId), eq(userChannels.kind, "telegram"))
    );
};
