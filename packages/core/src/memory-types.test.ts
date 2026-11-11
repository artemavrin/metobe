import { describe, expect, it } from "vitest";

import type { MemoryEntity, MemoryWritePlan } from "./memory";
import { kindWord, planWrite } from "./memory-extract";
import type { Extraction } from "./memory-extract";
import {
  ownTypes,
  thingsOf,
  typeQuestions,
  verdictOf,
  withTypes,
} from "./memory-types";
import type { TypeVerdict } from "./memory-types";

const ZONE = "Europe/Moscow";

const card = (name: string, type: string | null, at: number): MemoryEntity => ({
  aliases: [],
  createdAt: new Date(at),
  email: null,
  id: name,
  kind: "custom",
  name,
  phone: null,
  role: null,
  type,
  updatedAt: new Date(at),
});

const extraction = (over: Partial<Extraction> = {}): Extraction => ({
  asks: [],
  items: [],
  leaves: [],
  moves: [],
  new_entities: [],
  updates: [],
  ...over,
});

/** A fact about a thing the writer named: «Кота Барсика в четверг везу к ветеринару». */
const planOf = (): MemoryWritePlan =>
  planWrite(
    extraction({
      items: [
        {
          about: ["new:barsik"],
          creditor: null,
          debtor: null,
          due: { date: "", precision: "none" },
          important: false,
          interval_days: 0,
          kind: "fact",
          replaces: "none",
          role: null,
          rule_kind: null,
          text: "Барсик у ветеринара в четверг",
          when: { date: "2026-11-12", precision: "day" },
          working_days: false,
        },
      ],
      new_entities: [
        { about: "Кот", id: "new:barsik", kind: "thing", name: "Барсик" },
      ],
    }),
    { cards: [], selfId: null, timeZone: ZONE }
  );

describe("cards of the person's own types (D42)", () => {
  it("makes a thing the writer names a card of kind custom with the writer's word as its type", () => {
    expect(planOf().entities).toEqual([
      expect.objectContaining({
        kind: "custom",
        name: "Барсик",
        ref: "new:barsik",
        role: null,
        type: "кот",
      }),
    ]);
  });

  it("takes the word for what a thing is, never its name or a description", () => {
    expect(kindWord(" Кот ", "Барсик")).toBe("кот");
    // The kind inside the name is fine; the name — or a phrase around it — is not a kind.
    expect(kindWord("автобус", "Автобус 412")).toBe("автобус");
    expect(kindWord("Mac Studio M3 Ultra", "Mac Studio M3 Ultra")).toBeNull();
    expect(
      kindWord("рабочая станция Mac Studio M3 Ultra", "Mac Studio M3 Ultra")
    ).toBeNull();
    expect(
      kindWord("Mac Studio M3 Ultra", "Mac Studio M3 Ultra на 256 ГБ")
    ).toBeNull();
    expect(kindWord("очень длинное описание того, что это", "Х")).toBeNull();
    expect(kindWord("", "Х")).toBeNull();
  });

  it("makes the card of a thing the writer left without an id, and links the record that names it", () => {
    const plan = planWrite(
      extraction({
        items: [
          {
            about: ["", ""],
            creditor: null,
            debtor: null,
            due: { date: "", precision: "none" },
            important: false,
            interval_days: 0,
            kind: "fact",
            replaces: "none",
            role: null,
            rule_kind: null,
            text: "В компании есть Mac Studio M3 Ultra на 256 ГБ",
            when: { date: "2026-11-11", precision: "day" },
            working_days: false,
          },
        ],
        new_entities: [
          {
            about: "оборудование",
            id: "",
            kind: "thing",
            name: "Mac Studio M3 Ultra",
          },
        ],
      }),
      { cards: [], selfId: null, timeZone: ZONE }
    );
    expect(plan.entities).toEqual([
      expect.objectContaining({ kind: "custom", type: "оборудование" }),
    ]);
    expect(plan.records[0]?.entities).toEqual([
      { newRef: plan.entities[0]?.ref, role: "about" },
    ]);
  });

  it("shows the decision model the person's types, the most used first, each with its newest cards", () => {
    const own = ownTypes([
      card("Автобус 412", "автобус", 1),
      card("118", "автобус", 3),
      card("ЛиАЗ 233", "автобус", 2),
      card("Автобус 7", "автобус", 4),
      card("Барсик", "кот", 5),
      card("Без типа", null, 6),
    ]);
    expect(own).toEqual([
      { cards: ["Автобус 7", "118", "ЛиАЗ 233"], word: "автобус" },
      { cards: ["Барсик"], word: "кот" },
    ]);
    const criteria: Record<string, string> = typeQuestions(own).type.criteria;
    expect(criteria.own1).toBe(
      "автобус — карточки: «Автобус 7», «118», «ЛиАЗ 233»"
    );
    expect(criteria.own2).toContain("кот");
    expect(Object.keys(criteria)).toEqual([
      "person",
      "org",
      "project",
      "group",
      "own1",
      "own2",
      "new",
      "none",
    ]);
  });

  it("reads the choice: a type the person has, a new type, a built-in kind, or no card", () => {
    const [thing] = thingsOf(planOf().entities);
    const own = [{ cards: ["Автобус 412"], word: "автобус" }];
    const pick = (choice: string) =>
      verdictOf(thing as never, { type: { choice } }, own);
    expect(pick("own1")).toEqual({ type: "автобус" });
    expect(pick("new")).toEqual({ type: "кот" });
    expect(pick("person")).toEqual({ kind: "person" });
    expect(pick("none")).toEqual({ drop: true });
    expect(verdictOf(thing as never, undefined, own)).toBeNull();
  });

  it("puts the verdicts in the plan: a type, a built-in kind, or no card — and no record about nothing", () => {
    const plan = planOf();
    const typed = (v: TypeVerdict | null) =>
      withTypes(plan, new Map([["new:barsik", v]]));
    expect(typed({ type: "питомец" }).entities).toEqual([
      expect.objectContaining({ kind: "custom", type: "питомец" }),
    ]);
    // Sorted as a person after all: the word becomes who it is to the user.
    expect(typed({ kind: "person" }).entities).toEqual([
      expect.objectContaining({ kind: "person", role: "кот" }),
    ]);
    expect(typed({ kind: "person" }).entities[0]).not.toHaveProperty("type");
    // No card: the card is not made, and the record that was only about it goes.
    const none = typed({ drop: true });
    expect(none.entities).toEqual([]);
    expect(none.records).toEqual([]);
    // No answer: as the writer said.
    expect(typed(null)).toEqual(plan);
  });
});
