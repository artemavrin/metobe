"use client";

import { cn } from "@metobe/ui/lib/utils";
import { createContext, use, useState } from "react";

import type { ModelKey } from "./data";

// Параметры просмотра: сколько файлов уже в композере, какая модель выбрана, настроена ли модель «Зрение», экран и
// сеть (обрыв загрузки у одного файла). Смена числа файлов или сети начинает сцену заново.

type Proto = {
  count: 0 | 1 | 3 | 8;
  setCount: (v: 0 | 1 | 3 | 8) => void;
  model: ModelKey;
  setModel: (v: ModelKey) => void;
  slot: boolean;
  setSlot: (v: boolean) => void;
  phone: boolean;
  setPhone: (v: boolean) => void;
  breakOne: boolean;
  setBreakOne: (v: boolean) => void;
  bad: number;
  addBad: () => void;
};

const Ctx = createContext<Proto | null>(null);
export const useProto = () => {
  const p = use(Ctx);
  if (!p) throw new Error("outside ProtoProvider");
  return p;
};

export const ProtoProvider = ({ children }: { children: React.ReactNode }) => {
  const [count, setCount] = useState<0 | 1 | 3 | 8>(3);
  const [model, setModel] = useState<ModelKey>("yes");
  const [slot, setSlot] = useState(true);
  const [phone, setPhone] = useState(false);
  const [breakOne, setBreakOne] = useState(false);
  const [bad, setBad] = useState(0);
  return (
    <Ctx
      value={{
        addBad: () => setBad((n) => n + 1),
        bad,
        breakOne,
        count,
        model,
        phone,
        setBreakOne,
        setCount,
        setModel,
        setPhone,
        setSlot,
        slot,
      }}
    >
      {children}
    </Ctx>
  );
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

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-4">
    <span>{label}</span>
    <div className="flex flex-wrap justify-end gap-1">{children}</div>
  </div>
);

export const ProtoParams = () => {
  const p = useProto();
  return (
    <>
      <Row label="файлов в композере">
        {([0, 1, 3, 8] as const).map((n) => (
          <Chip active={p.count === n} key={n} onClick={() => p.setCount(n)}>
            {n}
          </Chip>
        ))}
      </Row>
      <Row label="модель">
        <Chip active={p.model === "yes"} onClick={() => p.setModel("yes")}>
          видит картинки
        </Chip>
        <Chip active={p.model === "no"} onClick={() => p.setModel("no")}>
          не видит
        </Chip>
        <Chip active={p.model === "unknown"} onClick={() => p.setModel("unknown")}>
          неизвестно
        </Chip>
      </Row>
      <Row label="модель «Зрение»">
        <Chip active={p.slot} onClick={() => p.setSlot(true)}>
          настроена
        </Chip>
        <Chip active={!p.slot} onClick={() => p.setSlot(false)}>
          нет
        </Chip>
      </Row>
      <Row label="сеть">
        <Chip active={!p.breakOne} onClick={() => p.setBreakOne(false)}>
          в порядке
        </Chip>
        <Chip active={p.breakOne} onClick={() => p.setBreakOne(true)}>
          обрыв у одного файла
        </Chip>
      </Row>
      <Row label="ошибки">
        <Chip active={false} onClick={p.addBad}>
          + большой и .mov
        </Chip>
      </Row>
      <Row label="экран">
        <Chip active={!p.phone} onClick={() => p.setPhone(false)}>
          компьютер
        </Chip>
        <Chip active={p.phone} onClick={() => p.setPhone(true)}>
          телефон
        </Chip>
      </Row>
      <p className="text-white/40">Свои файлы: «+» → «Файлы», перетащите на экран или вставьте скриншот ⌘V.</p>
    </>
  );
};
