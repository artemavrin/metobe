import "server-only";
import { fetchFor } from "./net";

// The Telegram Bot API (D43): a few direct calls — no library. The bot is one for the installation, its token in
// `TELEGRAM_BOT_TOKEN`. Calls go through the app's own routes (`fetchFor`), so a proxy set for Telegram is used. The
// token is in every URL: no error text leaves here with it.

const API = "https://api.telegram.org";

/** The bot's token, or null — then there is no Telegram channel at all. */
export const telegramToken = () =>
  process.env.TELEGRAM_BOT_TOKEN?.trim() || null;

export class TelegramError extends Error {
  readonly code: number | null;
  constructor(message: string, code: number | null = null) {
    super(message);
    this.name = "TelegramError";
    this.code = code;
  }
}

interface Reply<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

const call = async <T>(
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 15_000
): Promise<T> => {
  const token = telegramToken();
  if (!token) {
    throw new TelegramError("no bot token");
  }
  const url = new URL(`/bot${token}/${method}`, API);
  let body: Reply<T>;
  try {
    const fetcher = await fetchFor(null, url);
    const response = await fetcher(url, {
      body: JSON.stringify(params),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
    });
    body = (await response.json()) as Reply<T>;
  } catch (error) {
    // The URL, with the token, is in the cause of a network error: only its kind and the cause's code are kept
    // («TypeError (ECONNRESET)») — enough to tell a dropped connection from a refused proxy.
    const kind = error instanceof Error ? error.name : "error";
    const cause =
      error instanceof Error &&
      error.cause instanceof Error &&
      "code" in error.cause &&
      typeof error.cause.code === "string"
        ? ` (${error.cause.code})`
        : "";
    throw new TelegramError(`${method}: ${kind}${cause}`);
  }
  if (!(body.ok && body.result !== undefined)) {
    throw new TelegramError(
      `${method}: ${body.description ?? "failed"}`,
      body.error_code ?? null
    );
  }
  return body.result;
};

let username: string | null = null;

/** The bot's `@name` without the `@`, for the `t.me` link; asked once. */
export const botUsername = async () => {
  if (!username) {
    const me = await call<{ username: string }>("getMe");
    ({ username } = me);
  }
  return username;
};

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

/** Where a forwarded message came from: a person (hidden, by name only), a group or a channel. */
export interface TelegramOrigin {
  type: "user" | "hidden_user" | "chat" | "channel";
  sender_user?: TelegramUser;
  sender_user_name?: string;
  sender_chat?: { title?: string };
  chat?: { title?: string };
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id?: number;
    /** Seconds since 1970. */
    date?: number;
    chat: { id: number; type: string };
    from?: TelegramUser;
    text?: string;
    /** The words under a photo or a file. */
    caption?: string;
    forward_origin?: TelegramOrigin;
  };
  callback_query?: {
    id: string;
    from: TelegramUser;
    data?: string;
    message?: {
      chat: { id: number };
      message_id: number;
      reply_markup?: {
        inline_keyboard: { text: string; callback_data?: string }[][];
      };
    };
  };
}

/** A message to a chat; `html` is Telegram's HTML subset, already escaped. 403 — the person blocked the bot. */
export const sendTelegram = async (
  chatId: string,
  text: string,
  options: { html?: boolean; buttons?: { text: string; data: string }[][] } = {}
) => {
  await call("sendMessage", {
    chat_id: chatId,
    disable_web_page_preview: true,
    ...(options.html ? { parse_mode: "HTML" } : {}),
    ...(options.buttons
      ? {
          reply_markup: {
            inline_keyboard: options.buttons.map((row) =>
              row.map((b) => ({ callback_data: b.data, text: b.text }))
            ),
          },
        }
      : {}),
    text: text.slice(0, 4096),
  });
};

/** New updates after `offset`; waits up to `timeout` seconds for one (long polling). */
export const getUpdates = (offset: number, timeout: number) =>
  call<TelegramUpdate[]>(
    "getUpdates",
    { allowed_updates: ["message", "callback_query"], offset, timeout },
    (timeout + 10) * 1000
  );

/** «печатает…» at the top of the chat, for five seconds or until a message comes. */
export const sendTyping = async (chatId: string) => {
  await call("sendChatAction", { action: "typing", chat_id: chatId });
};

/** The answer to a button press: a line that shows at the top of the chat for a moment. */
export const answerCallback = async (id: string, text: string) => {
  await call("answerCallbackQuery", { callback_query_id: id, text });
};

/** The buttons of a message, as they are now (an empty list takes them all away). */
export const setButtons = async (
  chatId: string,
  messageId: number,
  rows: { text: string; callback_data?: string }[][]
) => {
  await call("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: rows },
  });
};
