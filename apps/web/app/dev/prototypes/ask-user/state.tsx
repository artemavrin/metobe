"use client";

import { cn } from "@metobe/ui/lib/utils";
import { createContext, use, useEffect, useState } from "react";

import { type Answers, SCENARIOS, type Scenario } from "./data";

// The prototype's one knob — how much the model asks: one question, several to pick, two in a row — and the card's
// life: asking → answered (or skipped) → the answer carrying on by itself, word by word, as a stream does.

const Proto = createContext<{ scenario: Scenario; setScenario: (s: Scenario) => void }>({
  scenario: SCENARIOS[0] as Scenario,
  setScenario: () => {},
});

export const ProtoProvider = ({ children }: { children: React.ReactNode }) => {
  const [scenario, setScenario] = useState(SCENARIOS[0] as Scenario);
  return <Proto value={{ scenario, setScenario }}>{children}</Proto>;
};

export const useProto = () => use(Proto);

const Chip = ({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) => (
  <button
    aria-pressed={active}
    className={cn("rounded-full px-2.5 py-1 transition-colors duration-150", active ? "bg-white/15 text-white" : "text-white/55 hover:text-white/85")}
    onClick={onClick}
    type="button"
  >
    {children}
  </button>
);

export const ProtoParams = () => {
  const { scenario, setScenario } = useProto();
  return (
    <div className="flex items-center justify-between gap-4">
      <span>модель спросит</span>
      <div className="flex gap-1">
        {SCENARIOS.map((s) => (
          <Chip active={s === scenario} key={s.id} onClick={() => setScenario(s)}>
            {s.knob}
          </Chip>
        ))}
      </div>
    </div>
  );
};

export type Phase = "asking" | "answered" | "skipped";

const WORD_MS = 40;

/** The card's state and the answer that carries on after it. */
export const useAsk = () => {
  const { scenario } = useProto();
  const [phase, setPhase] = useState<Phase>("asking");
  const [answers, setAnswers] = useState<Answers>({});
  const [words, setWords] = useState(0);

  const answer = (a: Answers) => {
    setAnswers(a);
    setPhase("answered");
  };
  const skip = () => setPhase("skipped");

  const text = phase === "answered" ? scenario.answerOf(answers) : scenario.guess;
  const total = text.split(" ").length;
  useEffect(() => {
    if (phase === "asking" || words >= total) return;
    const t = setTimeout(() => setWords((w) => w + 1), words === 0 ? 600 : WORD_MS);
    return () => clearTimeout(t);
  }, [phase, words, total]);

  return { answer, answers, phase, scenario, skip, streaming: phase !== "asking" && words < total, text, words };
};

export type Ask = ReturnType<typeof useAsk>;
