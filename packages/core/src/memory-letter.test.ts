import { getTranslator } from "@metobe/i18n/translator";
import { describe, expect, it } from "vitest";

import { letterPrompt, templateLetter } from "./memory-letter";
import type { LetterFacts, LetterWords } from "./memory-letter";

const wordsOf = async (locale: "ru" | "en"): Promise<LetterWords> => {
  const t = await getTranslator(locale);
  return {
    body: (v) => t("memory.letter.body", v),
    hello: (v) => t("memory.letter.hello", v),
    helloAll: () => t("memory.letter.helloAll"),
    subject: (v) => t("memory.letter.subject", v),
    thanks: () => t("memory.letter.thanks"),
  };
};

const olga: LetterFacts = {
  due: "13 ноября",
  given: "3 ноября",
  late: true,
  name: "Ольга Ли",
  person: true,
  text: "Прислать подписанный договор",
};

describe("templateLetter", () => {
  it("greets a person by name and says what, by when and since when", async () => {
    const letter = templateLetter(olga, await wordsOf("ru"));
    expect(letter.subject).toBe("Напоминание: Прислать подписанный договор");
    expect(letter.text).toBe(
      "Ольга Ли, добрый день!\n\nНапоминаю: прислать подписанный договор — срок был 13 ноября, договаривались 3 ноября. Подскажите, пожалуйста, как с этим дела?\n\nСпасибо!"
    );
  });

  it("greets an organization without a name, and leaves out what is not known", async () => {
    const letter = templateLetter(
      {
        due: null,
        given: null,
        late: false,
        name: "ООО «Вектор»",
        person: false,
        text: "Ответить на коммерческое предложение",
      },
      await wordsOf("ru")
    );
    expect(letter.text).toBe(
      "Добрый день!\n\nНапоминаю: ответить на коммерческое предложение. Подскажите, пожалуйста, как с этим дела?\n\nСпасибо!"
    );
  });

  it("says a deadline not yet passed as one", async () => {
    const letter = templateLetter(
      { ...olga, late: false },
      await wordsOf("en")
    );
    expect(letter.text).toContain(
      "A reminder: прислать подписанный договор — due 13 ноября, as agreed on 3 ноября."
    );
  });

  it("keeps an abbreviation's capitals", async () => {
    const letter = templateLetter(
      { ...olga, text: "НДС посчитать" },
      await wordsOf("ru")
    );
    expect(letter.text).toContain("Напоминаю: НДС посчитать");
  });
});

describe("letterPrompt", () => {
  it("gives the facts, the tone and the language, and nothing that is not known", () => {
    const prompt = letterPrompt({ ...olga, given: null }, "short", "ru");
    expect(prompt).toContain("Promised: Прислать подписанный договор");
    expect(prompt).toContain("Deadline: 13 ноября (passed)");
    expect(prompt).toContain("As short as it can be");
    expect(prompt).toContain("Language: Russian.");
    expect(prompt).not.toContain("Promised on");
  });
});
