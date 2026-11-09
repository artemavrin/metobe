import { describe, expect, it, vi } from "vitest";

import type { MemoryEntity } from "./memory";
import { mentionedCards } from "./memory-read";

vi.mock("server-only", () => ({}));

const card = (
  name: string,
  kind: MemoryEntity["kind"] = "person",
  aliases: string[] = []
): MemoryEntity => ({
  aliases,
  createdAt: new Date(),
  id: name,
  kind,
  name,
  role: null,
  updatedAt: new Date(),
});

const CARDS = [
  card("Ольга Ли"),
  card("Андрей Седов"),
  card("Андрей Ланьшин"),
  card("ООО «Вектор»", "org"),
  card("«Склад 2.0»", "project"),
  card("Игорь Белов", "person", ["Гоша"]),
  card("Проверка", "self"),
];

const names = (text: string) => mentionedCards(CARDS, text).map((c) => c.name);

describe("the cards a message mentions (ARCH §19.5)", () => {
  it("finds a name in any case", () => {
    expect(names("Напомни Ольге про договор")).toEqual(["Ольга Ли"]);
    expect(names("позвонить Седову")).toEqual(["Андрей Седов"]);
    expect(names("что там у Вектора?")).toEqual(["ООО «Вектор»"]);
    expect(names("как дела на складе")).toEqual(["«Склад 2.0»"]);
    expect(names("Гоша просил смету")).toEqual(["Игорь Белов"]);
  });

  it("gives every card a shared name fits, and nothing for short or unrelated words", () => {
    expect(names("Андрей передумал")).toEqual([
      "Андрей Седов",
      "Андрей Ланьшин",
    ]);
    // «ли» is a particle, not Ольга Ли; the person's own card is never «mentioned».
    expect(names("а ли не проверка ли это")).toEqual([]);
    expect(names("посчитай 15% от 240 тысяч")).toEqual([]);
  });
});
