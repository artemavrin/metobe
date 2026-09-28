"use client";

import { cn } from "@metobe/ui/lib/utils";
import { createContext, use, useEffect, useRef, useState } from "react";

import { hintOf } from "../my-connections/data";
import { useOAuthWindow } from "../my-connections/oauth-flow";
import type { Draft } from "../my-connections/parts";
import { SCENARIOS, type Scenario } from "./data";

// The prototype's knobs — which service the model asks for (one per way of signing in) and what the server says to
// the credentials — and the card's life: waiting → connecting → refused / unreachable → connected, and the answer
// carrying on by itself, word by word, as a stream does.

export type Outcome = "ok" | "refused" | "unreachable";

const Proto = createContext<{
  scenario: Scenario;
  setScenario: (s: Scenario) => void;
  outcome: Outcome;
  setOutcome: (o: Outcome) => void;
}>({ outcome: "ok", scenario: SCENARIOS[0] as Scenario, setOutcome: () => {}, setScenario: () => {} });

export const ProtoProvider = ({ children }: { children: React.ReactNode }) => {
  const [scenario, setScenario] = useState(SCENARIOS[0] as Scenario);
  const [outcome, setOutcome] = useState<Outcome>("ok");
  return <Proto value={{ outcome, scenario, setOutcome, setScenario }}>{children}</Proto>;
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

const WAY: Record<string, string> = { basic: "логин", bearer: "токен", header: "заголовок", oauth: "OAuth" };

export const ProtoParams = () => {
  const { scenario, setScenario, outcome, setOutcome } = useProto();
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <span>вход</span>
        <div className="flex gap-1">
          {SCENARIOS.map((s) => (
            <Chip active={s === scenario} key={s.server.id} onClick={() => setScenario(s)}>
              {WAY[s.server.auth]}
            </Chip>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span>сервер скажет</span>
        <div className="flex gap-1">
          <Chip active={outcome === "ok"} onClick={() => setOutcome("ok")}>
            подошло
          </Chip>
          <Chip active={outcome === "refused"} onClick={() => setOutcome("refused")}>
            не тот ключ
          </Chip>
          <Chip active={outcome === "unreachable"} onClick={() => setOutcome("unreachable")}>
            не отвечает
          </Chip>
        </div>
      </div>
    </>
  );
};

export type Phase = "waiting" | "connecting" | "error" | "connected" | "dismissed";

const CHECK_MS = 1100;
const WORD_MS = 45;

/** What went wrong, in the user's words: whose fault and what to do. */
export const problemOf = (s: Scenario, outcome: Outcome) => {
  if (outcome === "unreachable") return `${s.server.title} не отвечает. Ваш вход не сохранён — попробуйте чуть позже.`;
  return s.server.auth === "basic" ? `${s.server.title} не принял логин или пароль.` : `${s.server.title} не принял ${s.server.auth === "header" ? "ключ" : "токен"} — проверьте, что скопировали его целиком.`;
};

/** The card's state and the answer that carries on after it. */
export const useRequest = () => {
  const { scenario, outcome } = useProto();
  const [phase, setPhase] = useState<Phase>("waiting");
  const [problem, setProblem] = useState<string | null>(null);
  /** What the user connected with, as the UI may show it: a login, a token's mask, or nothing for OAuth. */
  const [saved, setSaved] = useState<string | null>(null);
  const [words, setWords] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const connected = (shown: string | null) => {
    setSaved(shown);
    setProblem(null);
    setPhase("connected");
  };
  const oauth = useOAuthWindow({ onDone: () => connected(null), onFallback: () => connected(null) });

  const connect = (draft: Draft) => {
    if (scenario.server.auth === "oauth") {
      oauth.start(scenario.server);
      return;
    }
    setPhase("connecting");
    setProblem(null);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (outcome === "ok") {
        connected(scenario.server.auth === "basic" ? `${draft.login} · ••••••` : hintOf(draft.secret));
      } else {
        setProblem(problemOf(scenario, outcome));
        setPhase("error");
      }
    }, CHECK_MS);
  };
  const dismiss = () => setPhase("dismissed");
  const reopen = () => setPhase("waiting");

  // Connected: the answer carries on by itself, a stream's pace.
  const total = scenario.answer.split(" ").length;
  useEffect(() => {
    if (phase !== "connected" || words >= total) return;
    const t = setTimeout(() => setWords((w) => w + 1), words === 0 ? 700 : WORD_MS);
    return () => clearTimeout(t);
  }, [phase, words, total]);
  useEffect(() => () => clearTimeout(timer.current), []);

  return { connect, dismiss, oauth, phase, problem, reopen, saved, scenario, streaming: phase === "connected" && words < total, words };
};

export type Request = ReturnType<typeof useRequest>;
