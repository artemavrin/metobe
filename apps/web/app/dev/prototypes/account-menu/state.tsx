"use client";

import { cn } from "@metobe/ui/lib/utils";
import { createContext, use, useState } from "react";

// Меню аккаунта: общее состояние всех вариантов. Тема переключается по-настоящему (next-themes), язык и переходы —
// только здесь: ничего не уходит на сервер. «Параметры» задают состояния, которые стоит увидеть.

export type Lang = "ru" | "en";

type Proto = {
  lang: Lang;
  setLang: (v: Lang) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  phone: boolean;
  setPhone: (v: boolean) => void;
  /** Куда бы привёл последний выбранный пункт. */
  last: string | null;
  go: (where: string) => void;
};

const Ctx = createContext<Proto | null>(null);
export const useProto = () => {
  const p = use(Ctx);
  if (!p) {
    throw new Error("outside ProtoProvider");
  }
  return p;
};

export const ProtoProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLang] = useState<Lang>("ru");
  const [collapsed, setCollapsed] = useState(false);
  const [phone, setPhone] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  return (
    <Ctx
      value={{
        collapsed,
        go: setLast,
        lang,
        last,
        phone,
        setCollapsed,
        setLang,
        setPhone,
      }}
    >
      {children}
    </Ctx>
  );
};

const Chip = ({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) => (
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
        <span>боковая панель</span>
        <div className="flex gap-1">
          <Chip active={!p.collapsed} onClick={() => p.setCollapsed(false)}>
            развёрнута
          </Chip>
          <Chip active={p.collapsed} onClick={() => p.setCollapsed(true)}>
            свёрнута
          </Chip>
        </div>
      </div>
    </>
  );
};
