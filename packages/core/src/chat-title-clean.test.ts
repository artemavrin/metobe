import { describe, expect, it } from "vitest";

import { cleanTitle } from "./chat-title-clean";

describe("a model's title made fit for the sidebar", () => {
  it("drops quotes, markdown, a label and the final dot", () => {
    expect(cleanTitle("«План миграции на Postgres 18».")).toBe(
      "План миграции на Postgres 18"
    );
    expect(cleanTitle('**"Regex for phone numbers"**')).toBe(
      "Regex for phone numbers"
    );
    expect(cleanTitle("Название: Разбор логов nginx")).toBe(
      "Разбор логов nginx"
    );
  });

  it("keeps one line and a sidebar's length", () => {
    expect(cleanTitle("\n\nСводка продаж\nи ещё строка")).toBe("Сводка продаж");
    expect(cleanTitle("а".repeat(100))).toHaveLength(80);
    expect(cleanTitle("   ")).toBe("");
  });
});
