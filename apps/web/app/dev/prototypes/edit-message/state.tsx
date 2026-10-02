"use client";

import { cn } from "@metobe/ui/lib/utils";
import { createContext, use, useState } from "react";

// Параметры просмотра: сколько файлов у правимого сообщения, длинный ли текст, сколько обмена шло после него, экран.
// Смена числа файлов, текста или «после» начинает сцену заново.

type Proto = {
  count: 0 | 2 | 5 | 8;
  setCount: (v: 0 | 2 | 5 | 8) => void;
  long: boolean;
  setLong: (v: boolean) => void;
  tail: 1 | 3;
  setTail: (v: 1 | 3) => void;
  phone: boolean;
  setPhone: (v: boolean) => void;
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
  const [count, setCount] = useState<0 | 2 | 5 | 8>(2);
  const [long, setLong] = useState(false);
  const [tail, setTail] = useState<1 | 3>(1);
  const [phone, setPhone] = useState(false);
  const [bad, setBad] = useState(0);
  return <Ctx value={{ addBad: () => setBad((n) => n + 1), bad, count, long, phone, setCount, setLong, setPhone, setTail, tail }}>{children}</Ctx>;
};

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
    <div className="flex flex-wrap justify-end gap-1">{children}</div>
  </div>
);

export const ProtoParams = () => {
  const p = useProto();
  return (
    <>
      <Row label="файлов у сообщения">
        {([0, 2, 5, 8] as const).map((n) => (
          <Chip active={p.count === n} key={n} onClick={() => p.setCount(n)}>
            {n}
          </Chip>
        ))}
      </Row>
      <Row label="текст">
        <Chip active={!p.long} onClick={() => p.setLong(false)}>
          короткий
        </Chip>
        <Chip active={p.long} onClick={() => p.setLong(true)}>
          длинный
        </Chip>
      </Row>
      <Row label="после сообщения">
        <Chip active={p.tail === 1} onClick={() => p.setTail(1)}>
          один ответ
        </Chip>
        <Chip active={p.tail === 3} onClick={() => p.setTail(3)}>
          три реплики
        </Chip>
      </Row>
      <Row label="ошибки при правке">
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
      <p className="text-white/40">Правка — карандаш под сообщением. Файлы: скрепка, перетаскивание на экран или ⌘V. Esc — отмена.</p>
    </>
  );
};
