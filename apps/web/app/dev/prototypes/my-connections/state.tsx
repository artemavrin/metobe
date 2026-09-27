"use client";

import { cn } from "@metobe/ui/lib/utils";
import { createContext, use, useState } from "react";

import { type Connection, hintOf, SERVERS, type Server, seedConnections } from "./data";

// The prototype's knobs (who looks, whether there is anything to show) and each variant's own connections state.

type Role = "user" | "admin";
type Scenario = "servers" | "empty";

const Proto = createContext<{ role: Role; setRole: (r: Role) => void; scenario: Scenario; setScenario: (s: Scenario) => void }>({
  role: "user",
  scenario: "servers",
  setRole: () => {},
  setScenario: () => {},
});

export const ProtoProvider = ({ children }: { children: React.ReactNode }) => {
  const [role, setRole] = useState<Role>("user");
  const [scenario, setScenario] = useState<Scenario>("servers");
  return <Proto value={{ role, scenario, setRole, setScenario }}>{children}</Proto>;
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

/** The picker's «Параметры»: who looks at the settings, and a user with nothing to connect. */
export const ProtoParams = () => {
  const { role, setRole, scenario, setScenario } = useProto();
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <span>кто смотрит</span>
        <div className="flex gap-1">
          <Chip active={role === "user"} onClick={() => setRole("user")}>
            пользователь
          </Chip>
          <Chip active={role === "admin"} onClick={() => setRole("admin")}>
            админ
          </Chip>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span>серверы</span>
        <div className="flex gap-1">
          <Chip active={scenario === "servers"} onClick={() => setScenario("servers")}>
            есть
          </Chip>
          <Chip active={scenario === "empty"} onClick={() => setScenario("empty")}>
            ни одного
          </Chip>
        </div>
      </div>
    </>
  );
};

/** Where a server stands for this user. */
export type Standing = "active" | "needs_reauth" | "error" | "none" | "org" | "admin";

export type ConnectInput = { login?: string; secret?: string };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A variant's connections: seeded fresh on every mount, so each variant starts from the same place. The check is a
 * stand-in for the real one: a value with «bad» in it is refused, the way a server answers 401.
 */
export const useMine = () => {
  const { scenario } = useProto();
  const servers = scenario === "empty" ? [] : SERVERS;
  const [connections, setConnections] = useState<Record<string, Connection>>(seedConnections);
  const [busy, setBusy] = useState<string | null>(null);

  const standing = (s: Server): Standing => {
    if (s.mode === "shared") return s.adminOnly ? "admin" : "org";
    return connections[s.id]?.status ?? "none";
  };

  /** Saves and checks: returns what went wrong, or null. An empty secret keeps the saved one (a login may change alone). */
  const connect = async (s: Server, input: ConnectInput): Promise<string | null> => {
    const before = connections[s.id];
    const secret = input.secret?.trim() ?? "";
    const login = input.login?.trim() ?? before?.login ?? "";
    if (s.auth === "basic" && !login) return "Введите логин";
    // A refused secret cannot stay: a new one is needed.
    if (!secret && (!before || before.status === "error")) return s.auth === "basic" ? "Введите пароль" : "Введите значение";
    setBusy(s.id);
    await wait(900);
    setBusy(null);
    if (secret.includes("bad")) {
      return s.auth === "basic" ? "Сервер ответил 401: логин или пароль не подходят" : "Сервер ответил 401: ключ не подходит";
    }
    setConnections((all) => ({
      ...all,
      [s.id]: {
        createdAt: before?.createdAt ?? new Date(),
        hint: s.auth === "basic" ? undefined : secret ? hintOf(secret) : before?.hint,
        lastUsedAt: before?.lastUsedAt,
        login: s.auth === "basic" ? login : undefined,
        status: "active",
      },
    }));
    return null;
  };

  /** OAuth: the provider's page and back, as a pause. */
  const signIn = async (s: Server) => {
    setBusy(s.id);
    await wait(1200);
    setBusy(null);
    setConnections((all) => ({
      ...all,
      [s.id]: { createdAt: all[s.id]?.createdAt ?? new Date(), lastUsedAt: all[s.id]?.lastUsedAt, status: "active" },
    }));
  };

  /** The provider's window said yes: signed in at once. */
  const markSignedIn = (s: Server) =>
    setConnections((all) => ({
      ...all,
      [s.id]: { createdAt: all[s.id]?.createdAt ?? new Date(), lastUsedAt: all[s.id]?.lastUsedAt, status: "active" },
    }));

  const disconnect = (s: Server) =>
    setConnections((all) => {
      const { [s.id]: _gone, ...rest } = all;
      return rest;
    });

  return { busy, connect, connections, disconnect, markSignedIn, servers, signIn, standing };
};

export type Mine = ReturnType<typeof useMine>;
