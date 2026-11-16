import type { ChatMessage } from "@metobe/contracts/chat";
import type { MemoryRecordView } from "@metobe/contracts/memory";
import { describe, expect, it } from "vitest";

import { splitQuoted } from "./memory-extract";
import { answerBlocks, messageText, originName } from "./telegram-answer";

const forwarded = (name: string | null) =>
  name ? `Переслано от ${name}:` : "Переслано от скрытого отправителя:";

describe("what a message to the bot says (шаг 7)", () => {
  it("is its text, or the caption under a file; nothing — no words", () => {
    expect(messageText({ text: "  напомни завтра в 10  " }, forwarded)).toBe(
      "напомни завтра в 10"
    );
    expect(messageText({ caption: "счёт за октябрь" }, forwarded)).toBe(
      "счёт за октябрь"
    );
    expect(messageText({}, forwarded)).toBeNull();
  });

  it("marks a forwarded one as someone else's, so the memory reads it as such", () => {
    const text = messageText(
      {
        forward_origin: {
          sender_user: { first_name: "Ольга", id: 1, last_name: "Ли" },
          type: "user",
        },
        text: "Пришлю подписанный договор в пятницу",
      },
      forwarded
    );
    expect(text).toBe(
      "Переслано от Ольга Ли:\nПришлю подписанный договор в пятницу"
    );
    expect(splitQuoted(`Это от юриста\n\n${text}`)).toEqual({
      own: "Это от юриста",
      quoted: "Переслано от Ольга Ли:\nПришлю подписанный договор в пятницу",
    });
  });

  it("names the sender as Telegram says it: a person, a hidden one, a channel", () => {
    expect(
      originName({ sender_user_name: "Аноним", type: "hidden_user" })
    ).toBe("Аноним");
    expect(
      originName({ chat: { title: "Новости склада" }, type: "channel" })
    ).toBe("Новости склада");
    expect(originName({ type: "hidden_user" })).toBeNull();
  });
});

const promise = (
  text: string,
  dueAt: string | null,
  who?: string
): MemoryRecordView =>
  ({
    dueAt,
    entities: [
      { id: "me", kind: "self", name: "Я", role: "debtor" },
      ...(who
        ? [{ id: "o", kind: "person", name: who, role: "creditor" }]
        : []),
    ],
    id: text,
    text,
  }) as MemoryRecordView;

const words = {
  due: (date: string) => `до ${date}`,
  late: "просрочено",
  more: (count: number) => `и ещё ${count}`,
};

describe("an answer as Telegram shows it", () => {
  it("says the open promises the memory showed as lines, with the day, lateness and whom", () => {
    const parts = [
      { type: "step-start" },
      { text: "Посмотрю, что открыто.", type: "text" },
      { type: "step-start" },
      { text: "Вот что открыто:", type: "text" },
      {
        input: {},
        output: {
          card: null,
          more: 2,
          records: [
            promise("Согласовать смету", "2026-11-12T21:00:00Z", "Ольга Ли"),
            promise("Позвонить в банк", null),
          ],
          today: "2026-11-14",
        },
        state: "output-available",
        toolCallId: "1",
        type: "tool-show_promises",
      },
    ] as unknown as ChatMessage["parts"];
    expect(
      answerBlocks(parts, { locale: "ru", timeZone: "Europe/Moscow", words })
    ).toEqual([
      { runs: [{ text: "Вот что открыто:" }], type: "p" },
      {
        items: [
          { text: "Согласовать смету — до 13 нояб., просрочено · Ольга Ли" },
          { text: "Позвонить в банк" },
          { text: "и ещё 2" },
        ],
        type: "list",
      },
    ]);
  });
});
