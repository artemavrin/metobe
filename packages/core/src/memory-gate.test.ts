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

  it("gives the model today, the exchange before, cut short, and the message", () => {
    expect(gateState("спасибо", "Monday, 9 November 2026")).toEqual({
      message: "спасибо",
      today: "Monday, 9 November 2026",
    });
    const state = gateState("она прислала", "Monday, 9 November 2026", {
      assistant: "Понял, жду договор от Ольги Ли.",
      user: "Ольга обещала прислать договор.".repeat(100),
    });
    expect(state.earlier?.assistant).toBe("Понял, жду договор от Ольги Ли.");
    expect(state.earlier?.user).toHaveLength(1500);
  });
});
