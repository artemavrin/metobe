import { describe, expect, it } from "vitest";

import { codeLetter } from "./code-letter";

const letter = {
  code: "482913",
  heading: "Ваш код для входа",
  ignore: "Если вы не запрашивали код, просто проигнорируйте письмо.",
  link: {
    href: "https://metobe.example.ru/login/verify?email=a%40b.ru&code=482913",
    label: "Или войдите по ссылке на этом устройстве",
  },
  locale: "ru",
  preview: "Введите его на странице входа.",
  use: "Введите его на странице входа. Код действует 10 минут.",
};

describe("a letter with a code", () => {
  it("draws the code, the link and the words in the recipient's language", async () => {
    const { html } = await codeLetter(letter);
    expect(html).toContain('lang="ru"');
    expect(html).toContain(">482913<");
    expect(html).toContain(
      `href="${letter.link.href.replaceAll("&", "&amp;")}"`
    );
    expect(html).toContain(letter.heading);
    expect(html).toContain("prefers-color-scheme: dark");
  });

  it("reads as a person would type it in the text part", async () => {
    const { text } = await codeLetter(letter);
    // The mark's initial is not glued to the name, the heading keeps its case, no rule drawn in dashes.
    expect(text.startsWith("Metobe")).toBe(true);
    expect(text).toContain("Ваш код для входа");
    expect(text).not.toContain("---");
    expect(text).toContain("482913");
    expect(text).toContain(letter.link.href);
  });

  it("goes without a link", async () => {
    const { html, text } = await codeLetter({ ...letter, link: null });
    expect(html).not.toContain("<a ");
    expect(text).not.toContain("http");
  });
});
