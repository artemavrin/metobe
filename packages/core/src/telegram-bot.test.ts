import { beforeEach, describe, expect, it, vi } from "vitest";

const complete = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("./channels", () => ({ completeTelegramLink: complete }));
vi.mock("./telegram", () => ({
  getUpdates: vi.fn(),
  sendTelegram: vi.fn(),
  telegramToken: () => "token",
}));

const { replyTo } = await import("./telegram-bot");

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

beforeEach(() => complete.mockReset());

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
