"use client";

import { cn } from "@metobe/ui/lib/utils";
import { createContext, use, useEffect, useState } from "react";

import type { Draft } from "./data";

// Ручки прототипа: компьютер или телефон, подключена ли почта (от этого в черновике «нужен вход»). Созданная задача
// живёт здесь же, чтобы боковая панель показала его, — и сбрасывается, когда вариант открывается заново.
// В адресе: `?v=1&sz=phone&mail=on`.

export type Screen = "desktop" | "phone";

interface Ctx {
  screen: Screen;
  setScreen: (s: Screen) => void;
  mail: boolean;
  setMail: (m: boolean) => void;
  /** `chat` — задача выросла из чата и живёт в нём же (раунд 2, «Сначала сделать»). */
  created: (Draft & { chat?: boolean; color?: string }) | null;
  setCreated: (d: (Draft & { chat?: boolean; color?: string }) | null) => void;
  /** Короткая строка внизу: что произошло бы в продукте. */
  note: string | null;
  say: (text: string) => void;
}

const Proto = createContext<Ctx>(null as never);

const setParam = (key: string, value: string | null) => {
  const url = new URL(window.location.href);
  if (value === null) url.searchParams.delete(key);
  else url.searchParams.set(key, value);
  window.history.replaceState(null, "", url);
};

export const ProtoProvider = ({ children }: { children: React.ReactNode }) => {
  const [screen, setScreenState] = useState<Screen>("desktop");
  const [mail, setMailState] = useState(false);
  const [created, setCreated] = useState<(Draft & { chat?: boolean; color?: string }) | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("sz") === "phone") setScreenState("phone");
    if (q.get("mail") === "on") setMailState(true);
  }, []);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 2600);
    return () => clearTimeout(t);
  }, [note]);
  const setScreen = (s: Screen) => {
    setScreenState(s);
    setParam("sz", s === "phone" ? "phone" : null);
  };
  const setMail = (m: boolean) => {
    setMailState(m);
    setParam("mail", m ? "on" : null);
  };
  return <Proto value={{ created, mail, note, say: setNote, screen, setCreated, setMail, setScreen }}>{children}</Proto>;
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
  const { screen, setScreen, mail, setMail } = useProto();
  return (
    <>
      <Row label="экран">
        <Chip active={screen === "desktop"} onClick={() => setScreen("desktop")}>
          компьютер
        </Chip>
        <Chip active={screen === "phone"} onClick={() => setScreen("phone")}>
          телефон
        </Chip>
      </Row>
      <Row label="почта">
        <Chip active={!mail} onClick={() => setMail(false)}>
          не подключена
        </Chip>
        <Chip active={mail} onClick={() => setMail(true)}>
          подключена
        </Chip>
      </Row>
    </>
  );
};
