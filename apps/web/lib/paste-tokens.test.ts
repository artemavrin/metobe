import { describe, expect, it } from "vitest";

import { tokenizePaste } from "./paste-tokens";
import type { Known } from "./paste-tokens";

const server = (id: string, label: string) => ({ id, label });
const card = (id: string, label: string) => ({
  id,
  kind: "card" as const,
  label,
});
const skill = (id: string, label: string) => ({
  id,
  kind: "skill" as const,
  label,
});

const KNOWN: Known = {
  cards: [
    card("c1", "Андрей Седов"),
    card("c2", "Ольга Ли"),
    card("c3", "Иван Петров"),
    card("c4", "Иван Петров"),
  ],
  servers: [server("s1", "GitHub"), server("s2", "GitHub Enterprise")],
  skills: [skill("k1", "отчёт")],
};

describe("a pasted text read as the composer reads typed", () => {
  it("makes a badge of a card named in full, where it stands", () => {
    expect(
      tokenizePaste("@Андрей Седов празднует день рождения", KNOWN)
    ).toEqual([card("c1", "Андрей Седов"), " празднует день рождения"]);
  });

  it("finds several, in any case, and leaves the words between", () => {
    expect(
      tokenizePaste("Спроси @ольга ли и @Андрей Седов, ладно?", KNOWN)
    ).toEqual([
      "Спроси ",
      card("c2", "Ольга Ли"),
      " и ",
      card("c1", "Андрей Седов"),
      ", ладно?",
    ]);
  });

  it("takes the longest server name, and a skill by its slash", () => {
    expect(tokenizePaste("@GitHub Enterprise и /отчёт", KNOWN)).toEqual([
      server("s2", "GitHub Enterprise"),
      " и ",
      skill("k1", "отчёт"),
    ]);
  });

  it("leaves as text what is not known whole, shared by two cards, or glued to a word", () => {
    for (const text of [
      "@Андрей придёт",
      "@Иван Петров придёт",
      "почта@Ольга Ли",
      "путь /отчётность",
      "/usr/bin",
    ]) {
      expect(tokenizePaste(text, KNOWN)).toEqual([text]);
    }
  });

  it("gives the text back whole when nothing is known", () => {
    expect(
      tokenizePaste("@Андрей Седов", { cards: [], servers: [], skills: [] })
    ).toEqual(["@Андрей Седов"]);
  });
});
