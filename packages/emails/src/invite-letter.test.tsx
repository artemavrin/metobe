import { describe, expect, it } from "vitest";

import { inviteLetter } from "./invite-letter";

const letter = {
  button: {
    href: "https://metobe.example.ru/invite?token=abc",
    label: "Принять приглашение",
  },
  heading: "Вас приглашают в Metobe",
  ignore: "Если вы не ждали приглашения, проигнорируйте письмо.",
  locale: "ru",
  preview: "Анна приглашает вас.",
  text: "Анна приглашает вас в Metobe.",
  ttl: "Ссылка действует 7 дней.",
};

describe("a letter that invites", () => {
  it("holds the words, the button and its link", async () => {
    const { html } = await inviteLetter(letter);
    expect(html).toContain('lang="ru"');
    expect(html).toContain(letter.heading);
    expect(html).toContain(letter.text);
    expect(html).toContain(`href="${letter.button.href}"`);
    expect(html).toContain(letter.button.label);
  });

  it("gives the link in the text part, without the mark's initial", async () => {
    const { text } = await inviteLetter(letter);
    expect(text.startsWith("Metobe")).toBe(true);
    expect(text).toContain(letter.button.href);
    expect(text).toContain(letter.ttl);
  });
});
