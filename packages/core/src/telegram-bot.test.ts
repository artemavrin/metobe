import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ActionsModule from "./telegram-actions";

const complete = vi.fn();
const userOfChat = vi.fn();
const userCanAct = vi.fn();
const sendTelegram = vi.fn();
const answerTelegram = vi.fn();
const runAction = vi.fn();
const answerCallback = vi.fn();
const setButtons = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("./channels", () => ({ completeTelegramLink: complete, userOfChat }));
vi.mock("./context", () => ({ userCanAct }));
vi.mock("./telegram", () => ({
  answerCallback,
  getUpdates: vi.fn(),
  sendTelegram,
  sendTyping: () => Promise.resolve(),
  setButtons,
  telegramToken: () => "token",
}));
class NoChatModelError extends Error {
  constructor() {
    super("no chat model");
    this.name = "NoChatModelError";
  }
}
vi.mock("./telegram-chat", () => ({ NoChatModelError, answerTelegram }));
// The owner's language and zone: one row, whatever is asked.
const ownerRows = () =>
  Promise.resolve([{ locale: "ru", timeZone: "Europe/Moscow" }]);
vi.mock("./db", () => {
  const chain = { from: () => chain, limit: ownerRows, where: () => chain };
  return { getDb: () => ({ db: { select: () => chain } }) };
});
vi.mock("./telegram-actions", async () => ({
  ...(await vi.importActual<typeof ActionsModule>("./telegram-actions")),
  runAction,
}));

const { answerPress, handleUpdate, replyTo } = await import("./telegram-bot");

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
  userCanAct.mockReset();
  userCanAct.mockResolvedValue(true);
  sendTelegram.mockReset();
  sendTelegram.mockImplementation(() => Promise.resolve());
  answerTelegram.mockReset();
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

  it("does nothing for a person or an organization that is turned off", async () => {
    userOfChat.mockResolvedValue("user-1");
    userCanAct.mockResolvedValue(false);
    await answerPress(press(`d:${ID}`));
    expect(runAction).not.toHaveBeenCalled();
    expect(answerCallback).toHaveBeenCalledWith("cb1", "Этого пункта уже нет");
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

describe("a bound chat writes to the bot (шаг 7)", () => {
  it("answers a comment and what was forwarded with it as one message, the chat's way", async () => {
    vi.useFakeTimers();
    try {
      userOfChat.mockResolvedValue("owner");
      sendTelegram.mockImplementation(() => Promise.resolve());
      answerTelegram.mockResolvedValue({
        answer: {
          id: "a",
          parts: [{ text: "Договор жду **в пятницу**", type: "text" }],
          role: "assistant",
        },
        chatId: "c",
      });
      await handleUpdate(message("Это от юриста"));
      await handleUpdate(
        message("Пришлю договор в пятницу", {
          forward_origin: {
            sender_user: { first_name: "Ольга", id: 5 },
            type: "user",
          },
        })
      );
      expect(answerTelegram).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1600);
      expect(answerTelegram).toHaveBeenCalledTimes(1);
      expect(answerTelegram).toHaveBeenCalledWith({
        text: "Это от юриста\n\nПереслано от Ольга:\nПришлю договор в пятницу",
        timeZone: "Europe/Moscow",
        userId: "owner",
      });
      expect(sendTelegram).toHaveBeenLastCalledWith(
        "77",
        "Договор жду <b>в пятницу</b>",
        { html: true }
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("says plainly when there is nothing to answer with", async () => {
    vi.useFakeTimers();
    try {
      userOfChat.mockResolvedValue("owner");
      answerTelegram.mockRejectedValue(new NoChatModelError());
      await handleUpdate(message("что у меня горит?"));
      await vi.advanceTimersByTimeAsync(1600);
      expect(sendTelegram).toHaveBeenLastCalledWith(
        "77",
        expect.stringContaining("нет модели для чата")
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not ask the model for a person or an organization that is turned off, and says why", async () => {
    vi.useFakeTimers();
    try {
      userOfChat.mockResolvedValue("owner");
      userCanAct.mockResolvedValue(false);
      await handleUpdate(message("что у меня горит?"));
      await vi.advanceTimersByTimeAsync(1600);
      expect(userCanAct).toHaveBeenCalledWith("owner");
      expect(answerTelegram).not.toHaveBeenCalled();
      expect(sendTelegram).toHaveBeenLastCalledWith(
        "77",
        expect.stringContaining("отключены")
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("asks for words when a message has none, and leaves a chat bound to nobody to the old line", async () => {
    userOfChat.mockResolvedValue("owner");
    await handleUpdate({
      message: { chat: { id: 77, type: "private" } },
      update_id: 2,
    });
    expect(sendTelegram).toHaveBeenLastCalledWith(
      "77",
      expect.stringContaining("только текст")
    );
    userOfChat.mockResolvedValue(null);
    await handleUpdate(message("привет"));
    expect(sendTelegram).toHaveBeenLastCalledWith(
      "77",
      expect.stringContaining("Я бот Metobe")
    );
    expect(answerTelegram).not.toHaveBeenCalled();
  });
});
