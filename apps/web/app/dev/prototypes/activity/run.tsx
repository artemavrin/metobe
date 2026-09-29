"use client";

import { createContext, use, useEffect, useReducer, useRef, useState } from "react";

import { SCENARIOS } from "./data";
import type { Scenario, Step, StepState } from "./data";
import { useProto } from "./state";

// Проигрыватель: гонит сценарий по шагам, как это делал бы ответ. Часы идут, пока модель работает, и стоят, пока
// шаг ждёт разрешения или ответ остановлен. Ничего здесь не уходит на сервер.

export type StepView = {
  step: Step;
  index: number;
  state: StepState;
  /** Сколько шаг шёл, мс. */
  ms: number;
  /** Насколько шаг продвинулся, 0…1 — по нему «печатается» его содержимое. */
  live: number;
};

export type Phase = "working" | "waiting" | "done" | "stopped";

type State = {
  cur: number;
  inStep: number;
  done: { state: StepState; ms: number }[];
  waiting: boolean;
  stopped: boolean;
  approved: Record<string, boolean>;
  typed: number;
};

type Action = { type: "tick"; dt: number } | { type: "approve" } | { type: "deny" } | { type: "stop" };

const CHARS_PER_MS = 0.06;

const reduce = (s: State, a: Action, script: Scenario): State => {
  const n = script.steps.length;
  const step = script.steps[s.cur];
  if (a.type === "stop") {
    return { ...s, stopped: true, waiting: false };
  }
  if (a.type === "approve" && step) {
    return { ...s, approved: { ...s.approved, [step.id]: true }, waiting: false };
  }
  if (a.type === "deny" && step) {
    return {
      ...s,
      cur: s.cur + 1,
      done: [...s.done, { ms: s.inStep, state: "denied" }],
      inStep: 0,
      waiting: false,
    };
  }
  if (a.type !== "tick" || s.stopped || s.waiting) {
    return s;
  }
  if (step) {
    const inStep = s.inStep + a.dt;
    if (step.approval && !s.approved[step.id] && inStep >= step.ms * 0.5) {
      return { ...s, inStep: step.ms * 0.5, waiting: true };
    }
    if (inStep >= step.ms) {
      return {
        ...s,
        cur: s.cur + 1,
        done: [...s.done, { ms: step.ms, state: step.fail ? "error" : "done" }],
        inStep: 0,
      };
    }
    return { ...s, inStep };
  }
  return s.cur >= n ? { ...s, typed: s.typed + a.dt * CHARS_PER_MS } : s;
};

type Run = {
  script: Scenario;
  views: StepView[];
  phase: Phase;
  /** Сколько работает модель, мс (часы стоят на ожидании). */
  elapsed: number;
  answerText: string;
  tokens: number;
  approve: () => void;
  deny: () => void;
  stop: () => void;
  note: string | null;
  go: (where: string) => void;
};

const Ctx = createContext<Run | null>(null);
export const useRun = () => {
  const r = use(Ctx);
  if (!r) {
    throw new Error("outside RunProvider");
  }
  return r;
};

const init: State = { approved: {}, cur: 0, done: [], inStep: 0, stopped: false, typed: 0, waiting: false };

export const RunProvider = ({ children }: { children: React.ReactNode }) => {
  const { scenarioId, speed } = useProto();
  const script = SCENARIOS.find((s) => s.id === scenarioId) ?? (SCENARIOS[0] as Scenario);
  const scriptRef = useRef(script);
  scriptRef.current = script;
  const [s, dispatch] = useReducer((st: State, a: Action) => reduce(st, a, scriptRef.current), init);
  const [note, setNote] = useState<string | null>(null);
  const n = script.steps.length;
  const stepsFinished = s.cur >= n;
  useEffect(() => {
    const id = setInterval(() => dispatch({ dt: 80 * speed, type: "tick" }), 80);
    return () => clearInterval(id);
  }, [speed]);
  useEffect(() => {
    if (!note) {
      return;
    }
    const id = setTimeout(() => setNote(null), 2600);
    return () => clearTimeout(id);
  }, [note]);

  const views: StepView[] = [];
  for (let i = 0; i < Math.min(s.cur + 1, n); i++) {
    const step = script.steps[i] as Step;
    const finished = s.done[i];
    if (finished) {
      views.push({ index: i, live: 1, ms: finished.ms, state: finished.state, step });
    } else {
      let state: StepState = "running";
      if (s.stopped) {
        state = "stopped";
      } else if (s.waiting) {
        state = "waiting";
      }
      views.push({ index: i, live: Math.min(1, s.inStep / step.ms), ms: s.inStep, state, step });
    }
  }
  const failed = s.done.some((d) => d.state === "error");
  const denied = s.done.some((d) => d.state === "denied");
  let answer = script.answer;
  if (denied && script.answerDenied) {
    answer = script.answerDenied;
  } else if (failed && script.answerFailed) {
    answer = script.answerFailed;
  }
  let phase: Phase = "working";
  if (s.stopped) {
    phase = "stopped";
  } else if (s.waiting) {
    phase = "waiting";
  } else if (stepsFinished) {
    phase = "done";
  }
  return (
    <Ctx
      value={{
        answerText: s.stopped ? "" : answer.slice(0, Math.floor(s.typed)),
        approve: () => dispatch({ type: "approve" }),
        deny: () => dispatch({ type: "deny" }),
        elapsed: views.reduce((sum, v) => sum + v.ms, 0),
        go: setNote,
        note,
        phase,
        script,
        stop: () => dispatch({ type: "stop" }),
        tokens: script.tokens,
        views,
      }}
    >
      {children}
    </Ctx>
  );
};
