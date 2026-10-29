"use client";

import { cn } from "@metobe/ui/lib/utils";
import { createContext, use, useEffect, useRef, useState } from "react";

import { FAILURE, STEPS } from "./data";

// The update's state machine, shared by the variants, and the prototype's knobs: where it starts (latest, a new
// version, scheduled, running, done, failed, no updater installed), how it ends (success or a failed check that rolls
// back), and whose eyes — the admin's screen or what a person in the chat sees meanwhile.
// `?st=available&end=fail&eye=user` — a state to send.

export type Phase = "latest" | "available" | "scheduled" | "updating" | "done" | "failed" | "manual";
export type Outcome = "ok" | "fail";
export type Eye = "admin" | "user";

const STEP_MS = 2600;

interface Ctx {
  phase: Phase;
  /** The running step, 0…4; past the last — all done. */
  step: number;
  elapsed: number;
  outcome: Outcome;
  eye: Eye;
  autoPatch: boolean;
  setAutoPatch: (v: boolean) => void;
  nightly: string;
  setNightly: (v: string) => void;
  start: () => void;
  schedule: () => void;
  cancel: () => void;
  reset: (p: Phase) => void;
  setOutcome: (o: Outcome) => void;
  setEye: (e: Eye) => void;
}

const Proto = createContext<Ctx>(null as never);

export const ProtoProvider = ({ children }: { children: React.ReactNode }) => {
  const [phase, setPhase] = useState<Phase>("available");
  const [step, setStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [outcome, setOutcome] = useState<Outcome>("ok");
  const [eye, setEye] = useState<Eye>("admin");
  const [autoPatch, setAutoPatch] = useState(true);
  const [nightly, setNightly] = useState("03:00");
  const startedAt = useRef(0);
  const reset = (p: Phase) => {
    setStep(p === "done" ? STEPS.length : p === "failed" ? FAILURE.step : 0);
    setElapsed(p === "done" ? 72 : p === "failed" ? 49 : 0);
    if (p === "updating") startedAt.current = Date.now();
    setPhase(p);
  };
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const st = q.get("st") as Phase | null;
    if (st) reset(st);
    if (q.get("end") === "fail") setOutcome("fail");
    if (q.get("eye") === "user") setEye("user");
  }, []);
  // The steps run by themselves; a failure stops at the check and rolls back.
  useEffect(() => {
    if (phase !== "updating") return;
    const tick = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 250);
    const next = setTimeout(() => {
      if (outcome === "fail" && step === FAILURE.step) setPhase("failed");
      else if (step >= STEPS.length - 1) {
        setStep(STEPS.length);
        setPhase("done");
      } else setStep(step + 1);
    }, STEP_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(next);
    };
  }, [phase, step, outcome]);
  const start = () => {
    startedAt.current = Date.now();
    setElapsed(0);
    setStep(0);
    setPhase("updating");
  };
  return (
    <Proto
      value={{
        autoPatch,
        cancel: () => setPhase("available"),
        elapsed,
        eye,
        nightly,
        outcome,
        phase,
        reset,
        schedule: () => setPhase("scheduled"),
        setAutoPatch,
        setEye,
        setNightly,
        setOutcome,
        start,
        step,
      }}
    >
      {children}
    </Proto>
  );
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

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-4">
    <span className="pt-1">{label}</span>
    <div className="flex max-w-72 flex-wrap justify-end gap-1">{children}</div>
  </div>
);

const PHASES: [Phase, string][] = [
  ["latest", "последняя"],
  ["available", "есть новая"],
  ["scheduled", "ночью"],
  ["updating", "идёт"],
  ["done", "готово"],
  ["failed", "откат"],
  ["manual", "без обновлятеля"],
];

export const ProtoParams = () => {
  const { phase, reset, outcome, setOutcome, eye, setEye } = useProto();
  return (
    <>
      <Row label="состояние">
        {PHASES.map(([p, label]) => (
          <Chip active={phase === p} key={p} onClick={() => reset(p)}>
            {label}
          </Chip>
        ))}
      </Row>
      <Row label="исход">
        <Chip active={outcome === "ok"} onClick={() => setOutcome("ok")}>
          успех
        </Chip>
        <Chip active={outcome === "fail"} onClick={() => setOutcome("fail")}>
          проверка не прошла
        </Chip>
      </Row>
      <Row label="глазами">
        <Chip active={eye === "admin"} onClick={() => setEye("admin")}>
          админа
        </Chip>
        <Chip active={eye === "user"} onClick={() => setEye("user")}>
          человека в чате
        </Chip>
      </Row>
    </>
  );
};
