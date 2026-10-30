"use client";

import { cn } from "@metobe/ui/lib/utils";
import { createContext, use, useEffect, useState } from "react";

// The knobs: which server (its way in — login and password, a token, a header's value), whether the answer gave a
// reason, the dialog's state — empty, filled, checking, refused, the server silent, connected — and the screen.
// `?srv=token&why=1&st=refused&sz=phone` — a state to send to someone.

export type Auth = "basic" | "token" | "header";
export type Status = "empty" | "filled" | "checking" | "refused" | "unreachable" | "done";
export type Screen = "desktop" | "phone";

export interface Server {
  auth: Auth;
  title: string;
  /** The admin's words on what the service is for (`catalog_items.description`). */
  description: string;
  logo?: string;
  headerName?: string;
  toolCount: number;
}

export const SERVERS: Record<Auth, Server> = {
  basic: { auth: "basic", description: "Остатки, заказы и цены из 1С", title: "Управление торговлей", toolCount: 12 },
  header: { auth: "header", description: "Внутренний сервис отчётов отдела продаж", headerName: "X-API-Key", title: "Отчёты продаж", toolCount: 4 },
  token: { auth: "token", description: "Задачи и проекты команды", title: "YouTrack", toolCount: 9 },
};

/** The model's words: why the answer asks for the service. */
export const REASON = "Чтобы найти остатки по складу «Центральный» на сегодня";

const Proto = createContext<{
  auth: Auth;
  setAuth: (a: Auth) => void;
  reason: boolean;
  setReason: (r: boolean) => void;
  status: Status;
  setStatus: (s: Status) => void;
  screen: Screen;
  setScreen: (s: Screen) => void;
  /** The fields hold what the way in needs: the button waits for it. */
  ready: boolean;
  setReady: (r: boolean) => void;
}>(null as never);

export const ProtoProvider = ({ children }: { children: React.ReactNode }) => {
  const [auth, setAuth] = useState<Auth>("basic");
  const [reason, setReason] = useState(false);
  const [status, setStatus] = useState<Status>("empty");
  const [screen, setScreen] = useState<Screen>("desktop");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const srv = q.get("srv");
    if (srv === "token" || srv === "header" || srv === "basic") setAuth(srv);
    if (q.get("why") === "1") setReason(true);
    const st = q.get("st") as Status | null;
    if (st && ["empty", "filled", "checking", "refused", "unreachable", "done"].includes(st)) setStatus(st);
    if (q.get("sz") === "phone") setScreen("phone");
  }, []);
  return <Proto value={{ auth, ready, reason, screen, setAuth, setReady, setReason, setScreen, setStatus, status }}>{children}</Proto>;
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
    <div className="flex flex-wrap justify-end gap-1">{children}</div>
  </div>
);

const STATUSES: [Status, string][] = [
  ["empty", "пусто"],
  ["filled", "заполнено"],
  ["checking", "проверка"],
  ["refused", "не подошло"],
  ["unreachable", "не отвечает"],
  ["done", "готово"],
];

export const ProtoParams = () => {
  const { auth, setAuth, reason, setReason, status, setStatus, screen, setScreen } = useProto();
  return (
    <>
      <Row label="вход">
        <Chip active={auth === "basic"} onClick={() => setAuth("basic")}>
          логин и пароль
        </Chip>
        <Chip active={auth === "token"} onClick={() => setAuth("token")}>
          токен
        </Chip>
        <Chip active={auth === "header"} onClick={() => setAuth("header")}>
          заголовок
        </Chip>
      </Row>
      <Row label="причина">
        <Chip active={!reason} onClick={() => setReason(false)}>
          нет
        </Chip>
        <Chip active={reason} onClick={() => setReason(true)}>
          от модели
        </Chip>
      </Row>
      <Row label="состояние">
        {STATUSES.map(([s, label]) => (
          <Chip active={status === s} key={s} onClick={() => setStatus(s)}>
            {label}
          </Chip>
        ))}
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
