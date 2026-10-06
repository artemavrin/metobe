"use client";

import { cn } from "@metobe/ui/lib/utils";
import { createContext, use, useEffect, useState } from "react";

import { SCENARIOS } from "./data";
import type { Scenario } from "./data";

// The prototype's knobs: how many metrics the answer has (one number reads differently from nine), the widget's
// state (built, being built, failed), whether it was built live or opened from the history (the first plays its
// arrival, the second does not), and the screen — a phone is the same page in a narrow frame, the widget answers to
// its own width.

export type Status = "ready" | "building" | "error";
export type Arrival = "live" | "history";
export type Screen = "desktop" | "phone";

const Proto = createContext<{
  scenario: Scenario;
  setScenario: (s: Scenario) => void;
  status: Status;
  setStatus: (s: Status) => void;
  arrival: Arrival;
  setArrival: (a: Arrival) => void;
  screen: Screen;
  setScreen: (s: Screen) => void;
}>(null as never);

export const ProtoProvider = ({ children }: { children: React.ReactNode }) => {
  const [scenario, setScenario] = useState(SCENARIOS[0] as Scenario);
  const [status, setStatus] = useState<Status>("ready");
  const [arrival, setArrival] = useState<Arrival>("live");
  const [screen, setScreen] = useState<Screen>("desktop");
  // `?n=four&st=building&ar=history&sc=phone` — a state to look at or to send to someone.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const found = SCENARIOS.find((x) => x.id === q.get("n"));
    if (found) setScenario(found);
    if (["ready", "building", "error"].includes(q.get("st") ?? "")) setStatus(q.get("st") as Status);
    if (["live", "history"].includes(q.get("ar") ?? "")) setArrival(q.get("ar") as Arrival);
    if (["desktop", "phone"].includes(q.get("sc") ?? "")) setScreen(q.get("sc") as Screen);
  }, []);
  return <Proto value={{ arrival, scenario, screen, setArrival, setScenario, setScreen, setStatus, status }}>{children}</Proto>;
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
  <div className="flex items-center justify-between gap-4">
    <span>{label}</span>
    <div className="flex gap-1">{children}</div>
  </div>
);

export const ProtoParams = () => {
  const { scenario, setScenario, status, setStatus, arrival, setArrival, screen, setScreen } = useProto();
  return (
    <>
      <Row label="показателей">
        {SCENARIOS.map((s) => (
          <Chip active={s === scenario} key={s.id} onClick={() => setScenario(s)}>
            {s.name}
          </Chip>
        ))}
      </Row>
      <Row label="состояние">
        <Chip active={status === "ready"} onClick={() => setStatus("ready")}>
          готово
        </Chip>
        <Chip active={status === "building"} onClick={() => setStatus("building")}>
          считает
        </Chip>
        <Chip active={status === "error"} onClick={() => setStatus("error")}>
          ошибка
        </Chip>
      </Row>
      <Row label="появился">
        <Chip active={arrival === "live"} onClick={() => setArrival("live")}>
          в ответе
        </Chip>
        <Chip active={arrival === "history"} onClick={() => setArrival("history")}>
          из истории
        </Chip>
      </Row>
      <Row label="экран">
        <Chip active={screen === "desktop"} onClick={() => setScreen("desktop")}>
          компьютер
        </Chip>
        <Chip active={screen === "phone"} onClick={() => setScreen("phone")}>
          телефон
        </Chip>
      </Row>
    </>
  );
};
