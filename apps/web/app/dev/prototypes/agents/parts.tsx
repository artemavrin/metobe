"use client";

import { Button } from "@metobe/ui/components/button";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowLeft, Bot, CircleAlert, CircleCheck, CircleMinus, CircleX, Clock, Inbox, Pause, Pencil, Play, SquarePen, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";

import { AGENTS, NOW } from "./data";
import type { Agent, AgentState, Outcome, Run } from "./data";
import { useProto } from "./state";

// Общее для всех вариантов: время словами, исходы и состояния (цвет, значок, слово), лента исходов, кольцо шага,
// оболочка приложения с боковой панелью (раздел «Агенты» в ней всегда виден), шторка поверх страницы, кнопки агента.

// ── Время и деньги ───────────────────────────────────────────────────────────────────────────────────────────────────

const TODAY = NOW.slice(0, 10);
const dayNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86_400_000);
const minutesOf = (at: string) => Date.parse(`${at}:00Z`) / 60_000;
const WEEKDAY = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", weekday: "short" });
const DATE = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });

export const timeOf = (at: string) => at.slice(11, 16);

/** «Сегодня», «Вчера», «пн, 26 окт». */
export const dayOf = (at: string) => {
  const d = at.slice(0, 10);
  const diff = dayNum(TODAY) - dayNum(d);
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Вчера";
  const date = new Date(`${d}T00:00:00Z`);
  return `${WEEKDAY.format(date)}, ${DATE.format(date).replace(".", "")}`;
};

/** «сегодня, 09:00», «вчера, 18:00», «пн, 26 окт, 10:00». */
export const whenOf = (at: string) => `${dayOf(at).replace(/^./u, (c) => c.toLowerCase())}, ${timeOf(at)}`;

/** До следующего запуска: вблизи — обратный отсчёт («через 18 мин», «через 2 ч 14 мин»), дальше — день и час. */
export const untilOf = (next: string, short = false) => {
  const m = minutesOf(next) - minutesOf(NOW);
  if (m < 60) return `через ${m} мин`;
  if (m < 6 * 60) return `через ${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ""}`;
  const diff = dayNum(next.slice(0, 10)) - dayNum(TODAY);
  const day = diff === 0 ? "сегодня" : diff === 1 ? "завтра" : `в ${WEEKDAY.format(new Date(`${next.slice(0, 10)}T00:00:00Z`))}`;
  return short ? day : `${day} в ${timeOf(next)}`;
};

export const fmtDur = (ms: number) => {
  const s = ms / 1000;
  if (s < 60) return `${s.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} с`;
  return `${Math.floor(s / 60)} мин ${Math.round(s % 60)} с`;
};

export const money = (v: number, c: Run["currency"]) =>
  new Intl.NumberFormat("ru-RU", { currency: c, ...(v < 0.01 ? { maximumSignificantDigits: 2 } : { maximumFractionDigits: 2, minimumFractionDigits: 2 }), style: "currency" }).format(v);

export const TRIGGER: Record<Run["trigger"], string> = { manual: "вручную", schedule: "по расписанию", test: "тестовый прогон" };

// ── Исходы и состояния ───────────────────────────────────────────────────────────────────────────────────────────────

type Look = { label: string; icon: LucideIcon; text: string; bg: string };

export const OUTCOME: Record<Outcome, Look> = {
  attention: { bg: "bg-warning", icon: CircleAlert, label: "Нужно внимание", text: "text-warning" },
  done: { bg: "bg-success", icon: CircleCheck, label: "Сделано", text: "text-success" },
  failed: { bg: "bg-destructive", icon: CircleX, label: "Сбой", text: "text-destructive" },
  nothing: { bg: "bg-muted-foreground/35", icon: CircleMinus, label: "Ничего нового", text: "text-muted-foreground" },
};

export const STATE: Record<AgentState, { label: string; dot: string; text: string }> = {
  failed: { dot: "bg-destructive", label: "Остановлен", text: "text-destructive" },
  idle: { dot: "bg-success", label: "По расписанию", text: "text-muted-foreground" },
  paused: { dot: "bg-transparent ring-1 ring-inset ring-muted-foreground/60", label: "На паузе", text: "text-muted-foreground" },
  running: { dot: "bg-info", label: "Работает", text: "text-info" },
  waiting: { dot: "bg-warning", label: "Ждёт вас", text: "text-warning" },
};

/** Исход запуска, а у идущего и ждущего — их состояние. */
export const runLook = (run: Run): Look => {
  if (run.live === "running") return { bg: "bg-info", icon: Clock, label: "Идёт", text: "text-info" };
  if (run.live === "waiting") return { bg: "bg-warning", icon: Clock, label: "Ждёт вас", text: "text-warning" };
  return OUTCOME[run.outcome ?? "done"];
};

export const StateDot = ({ state, className }: { state: AgentState; className?: string }) => (
  <span className={cn("relative inline-flex size-2 shrink-0", className)}>
    {state === "running" && <span className="bg-info absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:animate-none" />}
    <span className={cn("relative size-2 rounded-full", STATE[state].dot)} />
  </span>
);

export const RunIcon = ({ run, className }: { run: Run; className?: string }) => {
  const look = runLook(run);
  const Icon = look.icon;
  return <Icon className={cn("size-4 shrink-0", look.text, className)} />;
};

/** Последние запуски столбиками, от старых к новым: что было сделано, что прошло впустую, где сбой. */
export const OutcomeStrip = ({ runs, count = 10, tall = false }: { runs: Run[]; count?: number; tall?: boolean }) => {
  const list = runs.slice(0, count).reverse();
  return (
    <span aria-label="Последние запуски" className="flex items-end gap-[3px]" role="img">
      {list.map((run) => (
        <span
          className={cn("w-1.5 rounded-full", tall ? "h-5" : "h-3.5", runLook(run).bg, run.live && "animate-pulse motion-reduce:animate-none")}
          key={run.id}
          title={`${whenOf(run.at)} — ${runLook(run).label}`}
        />
      ))}
    </span>
  );
};

/** Кольцо шага идущего запуска: «шаг 4 из 5». */
export const Ring = ({ step, of, size = 20 }: { step: number; of: number; size?: number }) => {
  const r = size / 2 - 2;
  const c = 2 * Math.PI * r;
  return (
    <svg aria-hidden className="shrink-0 -rotate-90" height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
      <circle className="stroke-muted" cx={size / 2} cy={size / 2} fill="none" r={r} strokeWidth="2.5" />
      <circle
        className="stroke-info transition-[stroke-dashoffset] duration-500"
        cx={size / 2}
        cy={size / 2}
        fill="none"
        r={r}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - (step - 0.5) / of)}
        strokeLinecap="round"
        strokeWidth="2.5"
      />
    </svg>
  );
};

/** Одна строка о том, что с агентом сейчас: что делает, чего ждёт, почему стоит, когда следующий запуск. */
export const statusLine = (a: Agent) => {
  if (a.state === "running" && a.progress) return `Шаг ${a.progress.step} из ${a.progress.of} · ${a.progress.doing}`;
  if (a.reason) return a.reason.text;
  return a.next ? `Следующий запуск ${untilOf(a.next)}` : "";
};

// ── Оболочка ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export const usePhone = () => useProto().screen === "phone";

const CHATS = ["Договор с «Лесторгом»", "Прайс для дилеров", "Как посчитать маржу в 1С", "Письмо «Ромашке»"];

/** Состояние агента словом, как в Orbit: «Работает ···», «Ждёт вас», «Сбой»; у ждущего расписания — когда. */
export const StateWord = ({ agent }: { agent: Agent }) => {
  if (agent.state === "running")
    return (
      <span className="text-info flex items-center gap-1 text-xs">
        Работает
        <span aria-hidden className="flex gap-px">
          {[0, 1, 2].map((i) => (
            <span className="size-[3px] animate-pulse rounded-full bg-current motion-reduce:animate-none" key={i} style={{ animationDelay: `${i * 160}ms` }} />
          ))}
        </span>
      </span>
    );
  if (agent.state === "waiting") return <span className="text-warning text-xs">Ждёт вас</span>;
  if (agent.state === "failed") return <span className="text-destructive text-xs">Сбой</span>;
  if (agent.state === "paused") return <span className="text-muted-foreground text-xs">Пауза</span>;
  return <span className="text-muted-foreground font-mono text-[11px]">{agent.next ? `${WEEKDAY.format(new Date(`${agent.next.slice(0, 10)}T00:00:00Z`))} ${timeOf(agent.next)}` : ""}</span>;
};

/** Тонкая полоска прогресса под строкой идущего агента — читается боковым зрением, места не занимает. */
export const ProgressLine = ({ agent, className }: { agent: Agent; className?: string }) =>
  agent.state === "running" && agent.progress ? (
    <span aria-hidden className={cn("bg-border relative block h-0.5 overflow-hidden rounded-full", className)}>
      <span className="bg-info absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]" style={{ width: `${((agent.progress.step - 0.5) / agent.progress.of) * 100}%` }} />
    </span>
  ) : null;

/** Подпись секции: мелкие прописные, счётчик моноширинным справа. */
export const SectionLabel = ({ children, count, className }: { children: React.ReactNode; count?: number; className?: string }) => (
  <span className={cn("text-muted-foreground flex items-center justify-between text-[11px] font-medium tracking-wider uppercase", className)}>
    {children}
    {count !== undefined && <span className="font-mono tracking-normal tabular-nums">{count}</span>}
  </span>
);

/** `inbox` — сайдбар прототипа входящих: его пункты ведут в прототип агентов, и обратно. `words` — состояние словом. */
const Sidebar = ({ area, words = false }: { area: "agents" | "inbox"; words?: boolean }) => {
  const { go: goHere, nav, empty } = useProto();
  const inbox = area === "inbox";
  const go = (n: Parameters<typeof goHere>[0]) => {
    if (!inbox) return goHere(n);
    window.location.href = `/dev/prototypes/agents${n.kind === "list" ? "" : `?a=${n.id}`}`;
  };
  const current = inbox || nav.kind === "list" ? null : nav.id;
  return (
    <aside className="bg-sidebar text-sidebar-foreground flex w-60 shrink-0 flex-col gap-4 border-r p-2 text-sm">
      <div className="flex flex-col gap-0.5">
        <button className="hover:bg-sidebar-accent flex items-center gap-2 rounded-md px-2 py-1.5" type="button">
          <SquarePen className="size-4" />
          Новый чат
        </button>
        <button
          className={cn("hover:bg-sidebar-accent flex items-center gap-2 rounded-md px-2 py-1.5", inbox && "bg-sidebar-accent font-medium")}
          onClick={() => {
            if (!inbox) window.location.href = "/dev/prototypes/inbox";
          }}
          type="button"
        >
          <Inbox className="size-4" />
          Входящие
          {!empty &&
            (words ? (
              <span className="text-warning ml-auto font-mono text-[11px]">3 ждут</span>
            ) : (
              <span className="bg-primary text-primary-foreground ml-auto rounded-full px-1.5 text-[11px] font-medium tabular-nums">4</span>
            ))}
        </button>
        <button
          className={cn("hover:bg-sidebar-accent flex items-center gap-2 rounded-md px-2 py-1.5", !inbox && nav.kind === "list" && "bg-sidebar-accent font-medium")}
          onClick={() => go({ kind: "list" })}
          type="button"
        >
          <Bot className="size-4" />
          Агенты
        </button>
      </div>
      {!empty && (
        <div className="flex flex-col gap-0.5">
          {words ? <SectionLabel className="px-2 pb-1" count={AGENTS.length}>Агенты</SectionLabel> : <span className="text-muted-foreground px-2 pb-1 text-xs">Агенты</span>}
          {AGENTS.map((a) => (
            <button
              className={cn("hover:bg-sidebar-accent flex flex-col gap-1 rounded-md px-2 py-1.5 text-left transition-colors duration-[120ms]", current === a.id && "bg-sidebar-accent font-medium")}
              key={a.id}
              onClick={() => go({ id: a.id, kind: "agent" })}
              type="button"
            >
              <span className="flex w-full items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                {words ? <StateWord agent={a} /> : <StateDot state={a.state} />}
              </span>
              {words && <ProgressLine agent={a} className="w-full" />}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-0.5">
        <span className="text-muted-foreground px-2 pb-1 text-xs">Чаты</span>
        {CHATS.map((c) => (
          <span className="text-muted-foreground truncate rounded-md px-2 py-1.5" key={c}>
            {c}
          </span>
        ))}
      </div>
    </aside>
  );
};

const Toast = () => {
  const { note } = useProto();
  if (!note) return null;
  return (
    <div className="bg-foreground text-background animate-in fade-in slide-in-from-bottom-1 absolute bottom-20 left-1/2 z-50 max-w-[90%] -translate-x-1/2 rounded-full px-3 py-1.5 text-xs duration-200">
      {note}
    </div>
  );
};

/**
 * Приложение вокруг страницы. Компьютер — боковая панель и страница; телефон — кадр 390 px со строкой «назад»
 * сверху. `panel` — шторка поверх страницы (справа или снизу), она живёт внутри кадра.
 */
export const Shell = ({ title, back, children, panel, area = "agents", words = false }: { title: string; back?: () => void; children: React.ReactNode; panel?: React.ReactNode; area?: "agents" | "inbox"; words?: boolean }) => {
  const phone = usePhone();
  if (phone) {
    return (
      <div className="bg-muted/40 flex min-h-dvh justify-center py-8">
        <div className="bg-background relative flex h-[812px] w-[390px] flex-col overflow-hidden rounded-[2.5rem] border pt-6 shadow-xl">
          {/* Без заголовка и «назад» строка не нужна: страница сама начинается с заголовка. */}
          {(title || back) && (
          <div className="flex h-12 shrink-0 items-center gap-1 border-b px-3 pt-1">
            {back ? (
              <Button aria-label="Назад" onClick={back} size="icon-sm" variant="ghost">
                <ArrowLeft />
              </Button>
            ) : (
              <span className="w-1" />
            )}
            <span className="truncate text-sm font-medium">{title}</span>
          </div>
          )}
          <div className="@container min-h-0 flex-1 overflow-y-auto [scrollbar-width:none]">{children}</div>
          {panel}
          <Toast />
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar area={area} words={words} />
      <main className="relative min-w-0 flex-1">
        <div className="@container h-full overflow-y-auto">{children}</div>
        {panel}
        <Toast />
      </main>
    </div>
  );
};

/** Страница внутри оболочки: ширина как у настроек. */
export const Page = ({ children, wide = false, className }: { children: React.ReactNode; wide?: boolean; className?: string }) => (
  <div className={cn("mx-auto flex w-full flex-col gap-6 px-4 pt-5 pb-32 @xl:px-8 @xl:pt-8", wide ? "max-w-6xl" : "max-w-4xl", className)}>{children}</div>
);

/** Шторка поверх страницы: справа на компьютере, снизу на телефоне. */
export const Panel = ({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode }) => {
  const phone = usePhone();
  if (!open) return null;
  return (
    <>
      <button aria-label="Закрыть" className="animate-in fade-in absolute inset-0 z-30 bg-black/25 duration-200" onClick={onClose} type="button" />
      <section
        className={cn(
          "bg-popover animate-in absolute z-40 flex flex-col shadow-xl duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
          phone ? "slide-in-from-bottom-8 inset-x-0 bottom-0 max-h-[88%] rounded-t-3xl" : "slide-in-from-right-8 inset-y-0 right-0 w-[min(34rem,100%)] border-l"
        )}
      >
        {phone && <div className="bg-muted-foreground/30 mx-auto mt-2 h-1 w-9 shrink-0 rounded-full" />}
        <header className="flex items-start gap-2 px-5 pt-4 pb-3">
          <div className="min-w-0 flex-1">{title}</div>
          {!phone && (
            <Button aria-label="Закрыть" className="-mt-1 -mr-2" onClick={onClose} size="icon-sm" variant="ghost">
              <X />
            </Button>
          )}
        </header>
        <div className="@container min-h-0 flex-1 overflow-y-auto px-5 pb-6">{children}</div>
      </section>
    </>
  );
};

// ── Агент: включён ли, запустить, изменить ───────────────────────────────────────────────────────────────────────────

/** Включён ли агент. У остановленного после сбоев переключатель выключен: включить — значит попробовать снова. */
export const EnabledSwitch = ({ agent, label = false }: { agent: Agent; label?: boolean }) => {
  const { say } = useProto();
  const [on, setOn] = useState(agent.state !== "paused" && agent.state !== "failed");
  const sw = (
    <Switch
      aria-label={on ? "Выключить агента" : "Включить агента"}
      checked={on}
      onCheckedChange={(v) => {
        setOn(v);
        say(v ? `«${agent.name}» включён — ${agent.next ? `следующий запуск ${untilOf(agent.next)}` : "следующий запуск по расписанию"}` : `«${agent.name}» на паузе — запусков по расписанию не будет`);
      }}
    />
  );
  if (!label) return sw;
  return (
    <label className="text-muted-foreground flex items-center gap-2 text-sm">
      {sw}
      {on ? "Включён" : "Выключен"}
    </label>
  );
};

export const AgentActions = ({ agent, compact = false }: { agent: Agent; compact?: boolean }) => {
  const { say } = useProto();
  const running = agent.state === "running";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <EnabledSwitch agent={agent} label={!compact} />
      <span className="flex-1" />
      <Button onClick={() => say("Откроется чат, в котором уже есть настройки агента")} size="sm" variant="outline">
        <Pencil />
        Изменить
      </Button>
      {running ? (
        <Button onClick={() => say("Запуск остановлен — сделанное сохранится в его чате")} size="sm" variant="outline">
          <Pause />
          Остановить
        </Button>
      ) : (
        <Button onClick={() => say(`«${agent.name}» запущен — итог придёт во входящие`)} size="sm">
          <Play />
          Запустить сейчас
        </Button>
      )}
    </div>
  );
};

/** Почему агент ждёт или стоит, и одна кнопка, которая это чинит. */
export const ReasonBanner = ({ agent, onAction }: { agent: Agent; onAction?: () => void }) => {
  const { say } = useProto();
  if (!agent.reason) return null;
  const tone = agent.state === "failed" ? "border-destructive/30 bg-destructive/5" : agent.state === "waiting" ? "border-warning/40 bg-warning/5" : "bg-muted/50";
  const Icon = agent.state === "failed" ? CircleX : agent.state === "waiting" ? CircleAlert : Pause;
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border p-3 @xl:flex-row @xl:items-center", tone)}>
      <div className="flex min-w-0 flex-1 gap-2.5">
        <Icon className={cn("mt-0.5 size-4 shrink-0", STATE[agent.state].text)} />
        <div className="flex min-w-0 flex-col gap-0.5 text-sm">
          <span className="font-medium">{agent.reason.text}</span>
          {agent.reason.since && <span className="text-muted-foreground text-xs">с {whenOf(agent.reason.since)}</span>}
        </div>
      </div>
      {agent.reason.action && (
        <Button className="self-start @xl:self-auto" onClick={onAction ?? (() => say(`${agent.reason?.action}…`))} size="sm" variant="outline">
          {agent.reason.action}
        </Button>
      )}
    </div>
  );
};

/** Запуск, к которому ведёт кнопка из причины: ждущий или упавший последним. */
export const reasonRun = (agent: Agent) => agent.runs.find((r) => r.live === "waiting" || r.outcome === "failed" || r.outcome === "attention");
