import { describe, expect, it } from "vitest";

import type { MemoryWritePlan } from "./memory";
import { limitByVoice } from "./memory-evidence";

const record = (kind: string, text: string) =>
  ({
    entities: [],
    kind,
    text,
  }) as unknown as MemoryWritePlan["records"][number];

const plan: MemoryWritePlan = {
  drafts: [
    {
      candidates: ["a", "b"],
      name: "Андрей",
      question: "Какой Андрей?",
      records: [record("assessment", "Андрей надёжен")],
    },
    {
      candidates: ["a", "b"],
      name: "Андрей",
      question: "Какой Андрей?",
      records: [record("commitment", "Андрей пришлёт счёт")],
    },
  ],
  dues: [{ dueAt: new Date("2026-11-20T00:00:00Z"), recordId: "k2" }],
  ends: ["f1"],
  entities: [],
  records: [
    record("commitment", "Ольга пришлёт договор к пятнице"),
    record("fact", "Ольга Ли — менеджер «Альфы»"),
    record("event", "Ольга Ли была в отпуске"),
    record("assessment", "Ольга часто срывает сроки"),
    record("rule", "Напоминать Ольге за день"),
  ],
  statuses: [
    { recordId: "k1", status: "done" },
    { recordId: "k3", status: "cancelled" },
    { recordId: "k4", status: "unconfirmed" },
  ],
};

describe("what words may change, by who says them (§5.2)", () => {
  it("lets the person's own words do everything", () => {
    expect(limitByVoice(plan, true)).toBe(plan);
  });

  it("lets someone else's words promise, ask and tell about themselves, but settle only as «ждёт проверки», with no assessment or rule", () => {
    const limited = limitByVoice(plan, false);
    expect(limited.records.map((r) => r.kind)).toEqual([
      "commitment",
      "fact",
      "event",
    ]);
    expect(limited.drafts.map((d) => d.records[0]?.text)).toEqual([
      "Андрей пришлёт счёт",
    ]);
    expect(limited.statuses).toEqual([
      { recordId: "k1", status: "unconfirmed" },
      { recordId: "k3", status: "cancelled" },
      { recordId: "k4", status: "unconfirmed" },
    ]);
    expect(limited.dues).toEqual(plan.dues);
    expect(limited.ends).toEqual(plan.ends);
  });
});
