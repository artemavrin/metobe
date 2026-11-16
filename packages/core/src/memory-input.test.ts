import { describe, expect, it } from "vitest";

import { memoryInstructions, memoryPrompt } from "./memory-extract";
import type { ChatTurn } from "./memory-extract";
import {
  memoryPromptOf,
  messageSegments,
  othersSpeak,
  ownerSpeaks,
} from "./memory-input";
import type { Segment } from "./memory-input";

const context: ChatTurn[] = [
  { role: "user", text: "Кто ведёт закупки в «Векторе»?" },
  { role: "assistant", text: "Андрей Ковалёв." },
];

describe("a chat's message as lines (И1)", () => {
  it("is read word for word as before: plain, with a paste, with a forward, after a chat", () => {
    for (const text of [
      "Ольга пришлёт договор к пятнице",
      "Это от юриста\n\n> Договор подпишем завтра\n> Иван",
      "Переслано от Ольга Ли:\nПришлю подписанный договор в пятницу",
      "Глянь\n\n---------- Пересланное сообщение ---------\nОт: Ольга\nТема: Договор\n\nПришлю в пятницу",
    ]) {
      expect(memoryPromptOf(messageSegments(text))).toBe(memoryPrompt(text));
      expect(memoryPromptOf(messageSegments(text), context)).toBe(
        memoryPrompt(text, context)
      );
    }
  });

  it("is the person's words, or — a forward alone — someone else's", () => {
    expect(ownerSpeaks(messageSegments("Ольга пришлёт договор"))).toBe(true);
    expect(
      ownerSpeaks(messageSegments("Это от юриста\n> Подпишем завтра"))
    ).toBe(true);
    expect(
      ownerSpeaks(messageSegments("Переслано от Ольга Ли:\nПришлю договор"))
    ).toBe(false);
    expect(othersSpeak(messageSegments("Переслано от Ольга Ли:\nПришлю"))).toBe(
      false
    );
  });
});

describe("a letter and a meeting as lines", () => {
  const olga = { kind: "card", name: "Ольга Ли", ref: "c3" } as const;
  const letter: Segment[] = [
    {
      speaker: olga,
      text: "Добрый день! Пришлю подписанный договор в пятницу.",
      voice: "own",
    },
  ];
  const meeting: Segment[] = [
    { speaker: olga, text: "Договор пришлю к пятнице.", voice: "own" },
    {
      speaker: { kind: "owner" },
      text: "Отлично, а я подготовлю спецификацию.",
      voice: "own",
    },
    {
      speaker: { kind: "named", name: "Иван" },
      text: "Я проверю юридически.",
      voice: "own",
    },
  ];

  it("names each speaker: a card by its name and ref, the person as <user>", () => {
    expect(memoryPromptOf(letter)).toBe(
      '<message>\n<said by="Ольга Ли (c3)">\nДобрый день! Пришлю подписанный договор в пятницу.\n</said>\n</message>'
    );
    expect(memoryPromptOf(meeting)).toBe(
      '<message>\n<said by="Ольга Ли (c3)">\nДоговор пришлю к пятнице.\n</said>\n<user>\nОтлично, а я подготовлю спецификацию.\n</user>\n<said by="Иван">\nЯ проверю юридически.\n</said>\n</message>'
    );
    expect(ownerSpeaks(letter)).toBe(false);
    expect(ownerSpeaks(meeting)).toBe(true);
    expect(othersSpeak(letter)).toBe(true);
  });

  it("adds the rule on others' lines only when others speak", () => {
    const base = {
      cards: [],
      sentAt: new Date("2026-11-13T09:00:00Z"),
      timeZone: "Europe/Moscow",
    };
    expect(memoryInstructions(base)).not.toContain("<said by");
    expect(memoryInstructions({ ...base, said: true })).toContain("<said by");
  });
});
