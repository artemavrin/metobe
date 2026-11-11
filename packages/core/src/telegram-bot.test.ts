import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ActionsModule from "./telegram-actions";

const complete = vi.fn();
const userOfChat = vi.fn();
const runAction = vi.fn();
const answerCallback = vi.fn();
const setButtons = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("./channels", () => ({ completeTelegramLink: complete, userOfChat }));
vi.mock("./telegram", () => ({
  answerCallback,
  getUpdates: vi.fn(),
  sendTelegram: vi.fn(),
  setButtons,
  telegramToken: () => "token",
}));
vi.mock("./telegram-actions", async () => ({
  ...(await vi.importActual<typeof ActionsModule>("./telegram-actions")),
  runAction,
}));

const { answerPress, replyTo } = await import("./telegram-bot");

const message = (text: string, over: Record<string, unknown> = {}) => ({
  message: {
    chat: { id: 77, type: "private" },
    from: {
      first_name: "Ольга",
      id: 77,
      language_code: "ru",
      username: "olga",
    },
    text,
    ...over,
  },
  update_id: 1,
});

beforeEach(() => {
  complete.mockReset();
  userOfChat.mockReset();
  runAction.mockReset();
  answerCallback.mockReset();
  setButtons.mockReset();
});

describe("the bot's answers (D43)", () => {
  it("binds the chat on «Start» with a code, and says so in the account's language", async () => {
    complete.mockResolvedValue({ locale: "en", result: "linked" });
    const reply = await replyTo(message("/start abcDEF123456"));
    expect(complete).toHaveBeenCalledWith("abcDEF123456", {
      display: "@olga",
      id: "77",
    });
    expect(reply?.chatId).toBe("77");
    expect(reply?.text).toContain("linked to your Metobe account");
  });

  it("answers a code that does not fit, in the Telegram user's language", async () => {
    complete.mockResolvedValue({ result: "invalid" });
    const reply = await replyTo(message("/start abcDEF123456"));
    expect(reply?.text).toContain("Код не подошёл");
  });

  it("says another account has the chat", async () => {
    complete.mockResolvedValue({ result: "taken" });
    const reply = await replyTo(message("/start abcDEF123456"));
    expect(reply?.text).toContain("уже привязан к другому");
  });

  it("tells what the bot is to «Start» without a code and to any other words, binding nothing", async () => {
    for (const text of ["/start", "/start@metobe_bot", "привет"]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- three short checks
      const reply = await replyTo(message(text));
      expect(reply?.text).toContain("Я бот Metobe");
    }
    expect(complete).not.toHaveBeenCalled();
  });

  it("answers nothing in a group, to a non-text message or to a callback", async () => {
    expect(
      await replyTo(
        message("/start abcDEF123456", { chat: { id: -5, type: "group" } })
      )
    ).toBeNull();
    expect(await replyTo(message("", { text: undefined }))).toBeNull();
    expect(
      await replyTo({
        callback_query: { from: { id: 1 }, id: "x" },
        update_id: 2,
      })
    ).toBeNull();
    expect(complete).not.toHaveBeenCalled();
  });

  it("falls back to English for a language it has not", async () => {
    const reply = await replyTo(
      message("hello", { from: { id: 1, language_code: "de" } })
    );
    expect(reply?.text).toContain("I am the Metobe bot");
  });
});

const ID = "0b9c1a52-9f5f-4b9a-8a52-6a1f0b2c3d4e";
const OTHER = "1c0d2b63-0a60-4c0b-9b63-7b2a1c3d4e5f";

const press = (data: string, rows = true) => ({
  callback_query: {
    data,
    from: { id: 77, language_code: "ru" },
    id: "cb1",
    message: {
      chat: { id: 77 },
      message_id: 5,
      ...(rows
        ? {
            reply_markup: {
              inline_keyboard: [
                [
                  { callback_data: `d:${ID}`, text: "✓ первое" },
                  { callback_data: `m:${ID}`, text: "Завтра" },
                ],
                [{ callback_data: `d:${OTHER}`, text: "✓ второе" }],
              ],
            },
          }
        : {}),
    },
  },
  update_id: 3,
});

describe("a press on a button under a digest (D43)", () => {
  it("does the action for the owner of the chat, says so, and takes that promise's buttons away", async () => {
    userOfChat.mockResolvedValue("user-1");
    runAction.mockResolvedValue("done");
    await answerPress(press(`d:${ID}`));
    expect(userOfChat).toHaveBeenCalledWith("77");
    expect(runAction).toHaveBeenCalledWith("user-1", {
      action: "done",
      id: ID,
    });
    expect(answerCallback).toHaveBeenCalledWith("cb1", "Отмечено выполненным");
    expect(setButtons).toHaveBeenCalledWith("77", 5, [
      [{ callback_data: `d:${OTHER}`, text: "✓ второе" }],
    ]);
  });

  it("does nothing for a chat that is nobody's, and says it is gone", async () => {
    userOfChat.mockResolvedValue(null);
    await answerPress(press(`d:${ID}`));
    expect(runAction).not.toHaveBeenCalled();
    expect(answerCallback).toHaveBeenCalledWith("cb1", "Этого пункта уже нет");
    expect(setButtons).not.toHaveBeenCalled();
  });

  it("does nothing for data that is not an action", async () => {
    userOfChat.mockResolvedValue("user-1");
    await answerPress(press("hello"));
    expect(runAction).not.toHaveBeenCalled();
    expect(answerCallback).toHaveBeenCalledWith("cb1", "Этого пункта уже нет");
  });

  it("says a promise that is gone is gone, and still clears its buttons", async () => {
    userOfChat.mockResolvedValue("user-1");
    runAction.mockResolvedValue("gone");
    await answerPress(press(`m:${ID}`));
    expect(answerCallback).toHaveBeenCalledWith("cb1", "Этого пункта уже нет");
    expect(setButtons).toHaveBeenCalled();
  });
});
