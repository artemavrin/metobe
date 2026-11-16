import { describe, expect, it } from "vitest";

import { limitByVoice, voiceOf } from "./memory-evidence";
import type { Voice, Voices } from "./memory-evidence";
import type { Extraction } from "./memory-extract";

const NO_TIME = { date: "", precision: "none" } as const;

const item = (
  kind: Extraction["items"][number]["kind"],
  text: string,
  from: Voice
): Extraction["items"][number] => ({
  about: [],
  creditor: null,
  debtor: null,
  due: NO_TIME,
  from,
  important: false,
  interval_days: 0,
  kind,
  remind: "none",
  repeat: "none",
  repeat_on: [],
  replaces: "none",
  role: null,
  rule_kind: null,
  text,
  when: NO_TIME,
  working_days: null,
});

const extraction = (
  items: Extraction["items"],
  updates: Extraction["updates"]
): Extraction => ({
  asks: [],
  items,
  leaves: [],
  moves: [],
  new_entities: [],
  updates,
});

const ALL: Voices = { answer: true, others: true, owner: true };

describe("whose words it is (§5.2)", () => {
  it("goes by the model's label while the material has that voice, else by the material's", () => {
    expect(voiceOf("answer", ALL)).toBe("answer");
    expect(voiceOf("other", ALL)).toBe("other");
    expect(voiceOf("answer", { ...ALL, answer: false })).toBe("user");
    expect(voiceOf("other", { ...ALL, others: false })).toBe("user");
    // A forward alone: nothing in it is the person's, whatever the label.
    expect(voiceOf("user", { answer: false, others: true, owner: false })).toBe(
      "other"
    );
  });
});

describe("what words may change, by who says them", () => {
  const said = extraction(
    [
      item("commitment", "Ольга пришлёт договор к пятнице", "other"),
      item("fact", "Ольга Ли — менеджер «Альфы»", "other"),
      item("assessment", "Ольга часто срывает сроки", "other"),
      item("rule", "Напоминать Ольге за день", "other"),
      item("assessment", "Андрей надёжен", "user"),
      item("event", "Договор пришёл", "answer"),
    ],
    [
      { from: "user", ref: "k1", status: "done" },
      { from: "other", ref: "k2", status: "done" },
      { from: "other", ref: "k3", status: "cancelled" },
      { from: "answer", ref: "k4", status: "done" },
      { from: "answer", ref: "k5", status: "cancelled" },
      { from: "answer", ref: "k6", status: "unconfirmed" },
    ]
  );

  it("lets the person do everything, others promise and tell about themselves, the answer only settle as «ждёт проверки»", () => {
    const limited = limitByVoice(said, ALL);
    expect(limited.items.map((i) => i.text)).toEqual([
      "Ольга пришлёт договор к пятнице",
      "Ольга Ли — менеджер «Альфы»",
      "Андрей надёжен",
    ]);
    expect(limited.updates).toEqual([
      { from: "user", ref: "k1", status: "done" },
      { from: "other", ref: "k2", status: "unconfirmed" },
      { from: "other", ref: "k3", status: "cancelled" },
      { from: "answer", ref: "k4", status: "unconfirmed" },
      { from: "answer", ref: "k6", status: "unconfirmed" },
    ]);
  });

  it("reads a forward with nothing of the person's as someone else's, whatever it is labelled", () => {
    const limited = limitByVoice(
      extraction(
        [item("assessment", "Андрей надёжен", "user")],
        [{ from: "user", ref: "k1", status: "done" }]
      ),
      { answer: false, others: true, owner: false }
    );
    expect(limited.items).toEqual([]);
    expect(limited.updates).toEqual([
      { from: "user", ref: "k1", status: "unconfirmed" },
    ]);
  });
});
