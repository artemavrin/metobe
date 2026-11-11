import type { MemorySuggestion } from "@metobe/contracts/memory";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getDb: () => ({}) }));
vi.mock("./memory", () => ({}));

const { actionData, buttonsFor, parseAction, reminderButtons, tomorrowOf } =
  await import("./telegram-actions");

const ID = "0b9c1a52-9f5f-4b9a-8a52-6a1f0b2c3d4e";

const row = (
  id: string,
  over: Partial<MemorySuggestion> = {}
): MemorySuggestion => ({
  days: 0,
  dueAt: null,
  id,
  important: false,
  key: id,
  kind: "commitment",
  reason: "today",
  rhythm: null,
  side: "mine",
  status: "open",
  text: "Прислать договор на проверку",
  who: null,
  ...over,
});

describe("the digest's buttons (D43)", () => {
  it("carries an action and a promise's id in under 64 bytes, and reads it back", () => {
    for (const action of ["done", "tomorrow", "dismiss", "snooze"] as const) {
      const data = actionData(action, ID);
      expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
      expect(parseAction(data)).toEqual({ action, id: ID });
    }
  });

  it("reads nothing else: another action, a bad id, extra parts, nothing", () => {
    for (const data of [
      undefined,
      "",
      `z:${ID}`,
      "d:not-an-id",
      `d:${ID}:more`,
      "d",
      `D:${ID}`,
    ]) {
      expect(parseAction(data)).toBeNull();
    }
  });

  it("makes a row of three for each of the first five promises, and none for a rhythm or a date", () => {
    const rows = [
      ...Array.from({ length: 7 }, (_, i) => row(`${ID.slice(0, -1)}${i}`)),
      row("rhythm", { kind: "rhythm" }),
      row("date", { kind: "date" }),
    ];
    const buttons = buttonsFor(rows, { dismiss: "Убрать", tomorrow: "Завтра" });
    expect(buttons).toHaveLength(5);
    expect(buttons[0]?.map((b) => b.text)).toEqual([
      "✓ Прислать договор…",
      "Завтра",
      "Убрать",
    ]);
    expect(buttons[0]?.map((b) => b.data[0])).toEqual(["d", "m", "x"]);
  });
});

describe("tomorrowOf", () => {
  it("is the next day's midnight in the person's zone", () => {
    // 22:30 UTC on the 11th is already the 12th in Moscow: tomorrow is the 13th, 00:00 there.
    expect(
      tomorrowOf(
        new Date("2026-11-11T22:30:00Z"),
        "Europe/Moscow"
      )?.toISOString()
    ).toBe("2026-11-12T21:00:00.000Z");
    expect(
      tomorrowOf(new Date("2026-11-11T09:00:00Z"), "UTC")?.toISOString()
    ).toBe("2026-11-12T00:00:00.000Z");
  });
});

describe("the buttons under a reminder", () => {
  it("is one row: done, in an hour, tomorrow", () => {
    const rows = reminderButtons(ID, {
      done: "✓ Готово",
      snooze: "Через час",
      tomorrow: "Завтра",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.map((b) => b.text)).toEqual([
      "✓ Готово",
      "Через час",
      "Завтра",
    ]);
    expect(rows[0]?.map((b) => parseAction(b.data)?.action)).toEqual([
      "done",
      "snooze",
      "tomorrow",
    ]);
  });
});
