"use client";

import { cn } from "@metobe/ui/lib/utils";
import { createContext, use, useState } from "react";

import { SCENARIOS } from "./data";

// Общие настройки просмотра: какой сценарий играть, какой экран, с какой скоростью. Смена сценария или скорости
// запускает ответ заново (как и «повторить» на пилюле выбора).

type Proto = {
  scenarioId: string;
  setScenarioId: (v: string) => void;
  phone: boolean;
  setPhone: (v: boolean) => void;
  speed: number;
  setSpeed: (v: number) => void;
};

const Ctx = createContext<Proto | null>(null);
export const useProto = () => {
  const p = use(Ctx);
  if (!p) {
    throw new Error("outside ProtoProvider");
  }
  return p;
};

export const ProtoProvider = ({ children, initialScenario = "plain" }: { children: React.ReactNode; initialScenario?: string }) => {
  const [scenarioId, setScenarioId] = useState(initialScenario);
  const [phone, setPhone] = useState(false);
  const [speed, setSpeed] = useState(1);
  return <Ctx value={{ phone, scenarioId, setPhone, setScenarioId, setSpeed, speed }}>{children}</Ctx>;
};

const Chip = ({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) => (
  <button
    aria-pressed={active}
    className={cn(
      "rounded-full px-2.5 py-1 transition-colors duration-150",
      active ? "bg-white/15 text-white" : "text-white/55 hover:text-white/85"
    )}
    onClick={onClick}
    type="button"
  >
    {children}
  </button>
);

export const ProtoParams = () => {
  const p = useProto();
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <span>сценарий</span>
        <div className="flex flex-wrap justify-end gap-1">
          {SCENARIOS.map((s) => (
            <Chip active={p.scenarioId === s.id} key={s.id} onClick={() => p.setScenarioId(s.id)}>
              {s.label.toLowerCase()}
            </Chip>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span>экран</span>
        <div className="flex gap-1">
          <Chip active={!p.phone} onClick={() => p.setPhone(false)}>
            компьютер
          </Chip>
          <Chip active={p.phone} onClick={() => p.setPhone(true)}>
            телефон
          </Chip>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span>скорость</span>
        <div className="flex gap-1">
          <Chip active={p.speed === 0.5} onClick={() => p.setSpeed(0.5)}>
            медленно
          </Chip>
          <Chip active={p.speed === 1} onClick={() => p.setSpeed(1)}>
            обычно
          </Chip>
        </div>
      </div>
    </>
  );
};
