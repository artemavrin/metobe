import { describe, expect, it } from "vitest";

import { GATE_SKIP, gateState, nothingToKeep } from "./memory-gate";
import type { GateAnswers } from "./memory-gate";

const answers = (
  p: Partial<Record<keyof GateAnswers, number>>
): GateAnswers => ({
  change: { probability: p.change ?? 0.01 },
  commitment: { probability: p.commitment ?? 0.01 },
  event: { probability: p.event ?? 0.01 },
  fact: { probability: p.fact ?? 0.01 },
  remember: { probability: p.remember ?? 0.01 },
  rule: { probability: p.rule ?? 0.01 },
});

describe("the first step of the writer (ARCH §19.4)", () => {
  it("skips only a sure «no» to every question", () => {
    expect(nothingToKeep(answers({}))).toBe(true);
    // One unsure answer — the «Память» model reads it, as without the step.
    expect(nothingToKeep(answers({ commitment: 0.37 }))).toBe(false);
    expect(nothingToKeep(answers({ change: GATE_SKIP }))).toBe(false);
    expect(nothingToKeep(answers({ remember: 0.95 }))).toBe(false);
  });

  it("gives the model today, the chat before, cut short, and the message", () => {
    expect(gateState("спасибо", "Monday, 9 November 2026")).toEqual({
      message: "спасибо",
      today: "Monday, 9 November 2026",
    });
    const state = gateState("она прислала", "Monday, 9 November 2026", [
      { role: "user", text: "Ольга обещала прислать договор." },
      {
        role: "assistant",
        text: "Понял, жду договор от Ольги Ли.".repeat(100),
      },
    ]);
    expect(state.earlier?.[0]).toEqual({
      role: "user",
      text: "Ольга обещала прислать договор.",
    });
    expect(state.earlier?.[1]?.text).toHaveLength(800);
  });
});
