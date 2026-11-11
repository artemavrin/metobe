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
    // The URL, with the token, is in the cause of a network error: only its kind is kept.
    const kind = error instanceof Error ? error.name : "error";
    throw new TelegramError(`${method}: ${kind}`);
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
  username?: string;
  language_code?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number; type: string };
    from?: TelegramUser;
    text?: string;
  };
  callback_query?: {
    id: string;
    from: TelegramUser;
    data?: string;
    message?: { chat: { id: number }; message_id: number };
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
