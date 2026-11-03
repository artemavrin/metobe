"use client";

import { cn } from "@metobe/ui/lib/utils";
import { createContext, use, useEffect, useState } from "react";

// Ручки прототипа: компьютер или телефон, агенты есть или их ещё нет (шаблоны в пустом состоянии). Куда открыт
// прототип — список, агент или запуск — живёт в адресе: `?a=brief&r=br-1&sz=phone&st=empty`, чтобы состояние можно
// было переслать.

export type Screen = "desktop" | "phone";

/** Где человек сейчас: список агентов, страница агента, запуск. */
export type Nav = { kind: "list" } | { kind: "agent"; id: string } | { kind: "run"; id: string; run: string };

interface Ctx {
  screen: Screen;
  setScreen: (s: Screen) => void;
  empty: boolean;
  setEmpty: (e: boolean) => void;
  nav: Nav;
  go: (n: Nav) => void;
  /** Короткая строка внизу: что произошло бы в продукте. */
  note: string | null;
  say: (text: string) => void;
}

const Proto = createContext<Ctx>(null as never);

const navFrom = (q: URLSearchParams): Nav => {
  const a = q.get("a");
  const r = q.get("r");
  if (a && r) return { id: a, kind: "run", run: r };
  if (a) return { id: a, kind: "agent" };
  return { kind: "list" };
};

export const ProtoProvider = ({ children }: { children: React.ReactNode }) => {
  const [screen, setScreen] = useState<Screen>("desktop");
  const [empty, setEmpty] = useState(false);
  const [nav, setNav] = useState<Nav>({ kind: "list" });
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("sz") === "phone") setScreen("phone");
    if (q.get("st") === "empty") setEmpty(true);
    setNav(navFrom(q));
  }, []);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 2200);
    return () => clearTimeout(t);
  }, [note]);
  const go = (n: Nav) => {
    setNav(n);
    const url = new URL(window.location.href);
    url.searchParams.delete("a");
    url.searchParams.delete("r");
    if (n.kind !== "list") url.searchParams.set("a", n.id);
    if (n.kind === "run") url.searchParams.set("r", n.run);
    window.history.replaceState(null, "", url);
  };
  return <Proto value={{ empty, go, nav, note, say: setNote, screen, setEmpty, setScreen }}>{children}</Proto>;
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
  const { screen, setScreen, empty, setEmpty, go } = useProto();
  return (
    <>
      <Row label="агенты">
        <Chip active={!empty} onClick={() => setEmpty(false)}>
          шесть
        </Chip>
        <Chip
          active={empty}
          onClick={() => {
            setEmpty(true);
            go({ kind: "list" });
          }}
        >
          ещё нет
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
