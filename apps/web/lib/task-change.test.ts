import { describe, expect, it } from "vitest";

import { markAdded } from "./task-change";

describe("what is new after a change", () => {
  it("marks an addition at the end as whole words", () => {
    expect(markAdded("По будням в 9:00", "По будням в 9:00 и 15:00")).toEqual({
      added: " и 15:00",
      head: "По будням в 9:00",
      tail: "",
    });
  });

  it("marks a word put in the middle", () => {
    expect(
      markAdded(
        "shop-one.ru, shop-two.ru",
        "shop-one.ru, shop-three.ru, shop-two.ru"
      )
    ).toEqual({
      added: "shop-three.ru, ",
      head: "shop-one.ru, ",
      tail: "shop-two.ru",
    });
  });

  it("widens a change inside a word to the whole word", () => {
    expect(markAdded("в 9:00", "в 19:00")).toEqual({
      added: "19:00",
      head: "в ",
      tail: "",
    });
  });

  it("marks all of a value written anew, and nothing when only taken away", () => {
    expect(
      markAdded("При любом изменении", "Если цена изменилась")?.added
    ).toBe("Если цена изменилась");
    expect(
      markAdded("По будням в 9:00 и 15:00", "По будням в 9:00")
    ).toBeNull();
  });
});
