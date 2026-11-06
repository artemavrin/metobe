"use client";

import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { CalendarClock, ChevronRight, Play, Plus } from "lucide-react";

import { AgentPage, EmptyAgents } from "./agent";
import { AGENTS, agentOf, NOW } from "./data";
import type { Agent, AgentState, Run } from "./data";
import { EnabledSwitch, OutcomeStrip, Page, Panel, reasonRun, Ring, RunIcon, runLook, Shell, STATE, StateDot, statusLine, timeOf, untilOf, whenOf } from "./parts";
import { RunChat, RunTabs, RunTrace } from "./run";
import { useProto } from "./state";

// Три варианта P13. «Карточки» — как в §16.4: сетка карточек с расписанием, отсчётом и лентой исходов; страница
// агента вкладками; запуск — экран чата с плашкой. «Очередь» — ReUI «Run Queue»: агенты сгруппированы по тому, что с
// ними сейчас, у каждого одна нужная кнопка; страница агента — запуски и настройки рядом; запуск — трасса (ReUI «Run
// Step Trace»). «Расписание» — день агентов по часам: что уже было, что идёт, что дальше и что не запустится;
// запуск открывается шторкой (ReUI «Failed Run Triage»).

const runOf = (agent: Agent, id: string) => agent.runs.find((r) => r.id === id) ?? (agent.runs[0] as Run);

const ListHead = ({ sub }: { sub?: string }) => {
  const { say } = useProto();
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Агенты</h1>
        <p className="text-muted-foreground text-sm">{sub ?? "Делают регулярную работу сами и присылают итог во входящие."}</p>
      </div>
      <Button onClick={() => say("Откроется чат: опишите, что поручить, — модель предложит черновик")} size="sm">
        <Plus />
        Новый агент
      </Button>
    </header>
  );
};

/** Сколько каких: «6 агентов · 1 работает · 2 ждут вас · 1 остановлен». */
const countLine = () => {
  const n = (s: AgentState) => AGENTS.filter((a) => a.state === s).length;
  return [`${AGENTS.length} агентов`, n("running") && `${n("running")} работает`, n("waiting") && `${n("waiting")} ждут вас`, n("failed") && `${n("failed")} остановлен`].filter(Boolean).join(" · ");
};

/** Список, страница агента и запуск — общий ход для всех вариантов; разные только сами экраны. */
const useScreens = () => {
  const { nav, go, empty } = useProto();
  const agent = nav.kind === "list" ? null : agentOf(nav.id);
  return {
    agent,
    empty,
    nav,
    openAgent: (a: Agent) => go({ id: a.id, kind: "agent" }),
    openRun: (a: Agent, r: Run) => go({ id: a.id, kind: "run", run: r.id }),
    run: agent && nav.kind === "run" ? runOf(agent, nav.run) : null,
    toAgent: () => agent && go({ id: agent.id, kind: "agent" }),
    toList: () => go({ kind: "list" }),
  };
};

/** «Агенты › Утренняя сводка › сегодня, 09:00» — на компьютере; на телефоне вместо неё строка «назад». */
const Crumbs = ({ items }: { items: [string, (() => void) | undefined][] }) => {
  const { screen } = useProto();
  if (screen === "phone") return null;
  return (
    <nav className="text-muted-foreground flex items-center gap-1 text-sm">
      {items.map(([label, on], i) => (
        <span className="flex items-center gap-1" key={label}>
          {i > 0 && <ChevronRight className="size-3.5" />}
          {on ? (
            <button className="hover:text-foreground transition-colors" onClick={on} type="button">
              {label}
            </button>
          ) : (
            <span className="text-foreground">{label}</span>
          )}
        </span>
      ))}
    </nav>
  );
};

// ── Карточки ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const Card = ({ agent, onOpen }: { agent: Agent; onOpen: () => void }) => {
  const { say } = useProto();
  const live = agent.state === "running" && agent.progress;
  return (
    <div className={cn("hover:border-foreground/20 relative flex min-w-0 flex-col gap-3 rounded-xl border p-4 transition-colors", (agent.state === "paused" || agent.state === "failed") && "bg-muted/30")}>
      <button aria-label={`Открыть «${agent.name}»`} className="absolute inset-0 rounded-xl" onClick={onOpen} type="button" />
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate font-medium">{agent.name}</span>
          <span className="text-muted-foreground line-clamp-2 text-sm">{agent.about}</span>
        </div>
        <span className="relative z-10">
          <EnabledSwitch agent={agent} />
        </span>
      </div>
      <div className={cn("flex min-h-5 items-center gap-2 text-sm", agent.reason || live ? STATE[agent.state].text : "text-muted-foreground")}>
        {live ? <Ring of={agent.progress?.of ?? 1} size={16} step={agent.progress?.step ?? 0} /> : agent.reason ? <StateDot state={agent.state} /> : <CalendarClock className="size-4 shrink-0" />}
        <span className="min-w-0 truncate">{agent.reason || live ? statusLine(agent) : `${agent.schedule}${agent.next ? ` · следующий ${untilOf(agent.next, true)}` : ""}`}</span>
      </div>
      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <OutcomeStrip runs={agent.runs} />
        {agent.state !== "running" && (
          <Button className="relative z-10" onClick={() => say(`«${agent.name}» запущен — итог придёт во входящие`)} size="xs" variant="ghost">
            <Play />
            Запустить
          </Button>
        )}
      </div>
    </div>
  );
};

export const Cards = () => {
  const s = useScreens();
  if (s.agent && s.run) {
    return (
      <Shell back={s.toAgent} title={s.agent.name}>
        <RunChat agent={s.agent} run={s.run} />
      </Shell>
    );
  }
  if (s.agent) {
    const agent = s.agent;
    return (
      <Shell back={s.toList} title="Агенты">
        <Page>
          <Crumbs items={[["Агенты", s.toList], [agent.name, undefined]]} />
          <AgentPage agent={agent} onRun={(r) => s.openRun(agent, r)} />
        </Page>
      </Shell>
    );
  }
  return (
    <Shell title="">
      <Page>
        {s.empty ? (
          <EmptyAgents />
        ) : (
          <>
            <ListHead />
            <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
              {AGENTS.map((a) => (
                <Card agent={a} key={a.id} onOpen={() => s.openAgent(a)} />
              ))}
            </div>
          </>
        )}
      </Page>
    </Shell>
  );
};

// ── Очередь ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const GROUPS: [AgentState, string][] = [
  ["waiting", "Ждут вас"],
  ["running", "Работают"],
  ["failed", "Остановлены"],
  ["idle", "По расписанию"],
  ["paused", "На паузе"],
];

/** Одна кнопка, которая нужна агенту сейчас: посмотреть письмо, подключить, разобрать ошибку, запустить, включить. */
const QueueAction = ({ agent, onRun }: { agent: Agent; onRun: (r: Run) => void }) => {
  const { say } = useProto();
  const target = reasonRun(agent);
  if (agent.state === "running") {
    return (
      <Button onClick={() => onRun(agent.runs[0] as Run)} size="sm" variant="ghost">
        Смотреть
      </Button>
    );
  }
  if (agent.id === "sales") {
    return (
      <Button onClick={() => say("Откроется вход в «Битрикс24» — после него агент запустится сам")} size="sm" variant="outline">
        Подключить
      </Button>
    );
  }
  if ((agent.state === "waiting" || agent.state === "failed") && target) {
    return (
      <Button onClick={() => onRun(target)} size="sm" variant={agent.state === "waiting" ? "default" : "outline"}>
        {agent.state === "waiting" ? "Посмотреть" : "Разобрать"}
      </Button>
    );
  }
  if (agent.state === "paused") {
    return (
      <Button onClick={() => say(`«${agent.name}» включён — следующий запуск в пт в 17:00`)} size="sm" variant="ghost">
        Включить
      </Button>
    );
  }
  return (
    <Button onClick={() => say(`«${agent.name}» запущен — итог придёт во входящие`)} size="sm" variant="ghost">
      <Play />
      Запустить
    </Button>
  );
};

const QueueRow = ({ agent, onOpen, onRun }: { agent: Agent; onOpen: () => void; onRun: (r: Run) => void }) => (
  <li className="hover:bg-muted/40 relative flex items-center gap-3 px-3 py-3 transition-colors">
    <button aria-label={`Открыть «${agent.name}»`} className="absolute inset-0" onClick={onOpen} type="button" />
    <span className="grid size-5 shrink-0 place-items-center">
      {agent.state === "running" && agent.progress ? <Ring of={agent.progress.of} step={agent.progress.step} /> : <StateDot state={agent.state} />}
    </span>
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="truncate text-sm font-medium">{agent.name}</span>
      <span className={cn("line-clamp-2 text-xs @xl:truncate", agent.state === "idle" || agent.state === "paused" ? "text-muted-foreground" : STATE[agent.state].text)}>{statusLine(agent)}</span>
    </span>
    <span className="hidden @xl:flex">
      <OutcomeStrip runs={agent.runs} />
    </span>
    <span className="relative z-10 shrink-0">
      <QueueAction agent={agent} onRun={onRun} />
    </span>
  </li>
);

export const Queue = () => {
  const s = useScreens();
  if (s.agent && s.run) {
    const agent = s.agent;
    const run = s.run;
    return (
      <Shell back={s.toAgent} title={agent.name}>
        <Page wide>
          <Crumbs items={[["Агенты", s.toList], [agent.name, s.toAgent], [whenOf(run.at), undefined]]} />
          <header className="flex flex-col gap-1">
            <span className={cn("flex items-center gap-1.5 text-xs font-medium", runLook(run).text)}>
              <RunIcon className="size-3.5" run={run} />
              {runLook(run).label}
            </span>
            <h1 className="text-xl font-semibold tracking-tight">{run.summary}</h1>
          </header>
          <RunTrace agent={agent} run={run} />
        </Page>
      </Shell>
    );
  }
  if (s.agent) {
    const agent = s.agent;
    return (
      <Shell back={s.toList} title="Агенты">
        <Page wide>
          <Crumbs items={[["Агенты", s.toList], [agent.name, undefined]]} />
          <AgentPage agent={agent} aside onRun={(r) => s.openRun(agent, r)} />
        </Page>
      </Shell>
    );
  }
  return (
    <Shell title="">
      <Page>
        {s.empty ? (
          <EmptyAgents />
        ) : (
          <>
            <ListHead sub={countLine()} />
            {GROUPS.map(([state, label]) => {
              const list = AGENTS.filter((a) => a.state === state);
              if (list.length === 0) return null;
              return (
                <section className="flex flex-col gap-2" key={state}>
                  <h2 className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
                    <StateDot state={state} />
                    {label} · {list.length}
                  </h2>
                  <ul className="divide-y overflow-hidden rounded-xl border">
                    {list.map((a) => (
                      <QueueRow agent={a} key={a.id} onOpen={() => s.openAgent(a)} onRun={(r) => s.openRun(a, r)} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </>
        )}
      </Page>
    </Shell>
  );
};

// ── Расписание ───────────────────────────────────────────────────────────────────────────────────────────────────────

const TODAY = NOW.slice(0, 10);

type Slot = { at: string; agent: Agent; run?: Run; later?: string };

/** Строка дня: время, агент, что вышло (или что будет). Будущие — бледнее. */
const SlotRow = ({ slot, onOpen }: { slot: Slot; onOpen: () => void }) => {
  const { agent, run } = slot;
  const look = run ? runLook(run) : null;
  return (
    <li>
      <button className={cn("hover:bg-muted/60 grid w-full grid-cols-[3rem_1rem_1fr] items-start gap-x-3 rounded-lg px-2 py-2 text-left text-sm transition-colors", !run && "text-muted-foreground")} onClick={onOpen} type="button">
        <span className="tabular-nums">{timeOf(slot.at)}</span>
        {run ? <RunIcon className="mt-0.5" run={run} /> : <CalendarClock className="mt-0.5 size-4" />}
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={cn("font-medium", !run && "font-normal")}>{agent.name}</span>
          {run ? (
            <span className="text-muted-foreground line-clamp-2 text-xs">
              <span className={look?.text}>{look?.label}</span> · {run.live === "running" ? statusLine(agent) : run.live === "waiting" ? agent.reason?.text : run.summary}
            </span>
          ) : (
            <span className="text-xs">{slot.later}</span>
          )}
        </span>
      </button>
    </li>
  );
};

const Now = () => (
  <li className="text-info flex items-center gap-2 py-1 pl-2 text-xs font-medium" aria-label="Сейчас">
    <span className="w-12 tabular-nums">{timeOf(NOW)}</span>
    <span className="bg-info h-px flex-1" />
    сейчас
  </li>
);

export const Agenda = () => {
  const s = useScreens();
  const { say } = useProto();
  const runPanel = s.agent && s.run && (
    <Panel
      onClose={s.toAgent}
      open
      title={
        <div className="flex flex-col gap-0.5">
          <span className={cn("flex items-center gap-1.5 text-xs font-medium", runLook(s.run).text)}>
            <RunIcon className="size-3.5" run={s.run} />
            {runLook(s.run).label} · {whenOf(s.run.at)}
          </span>
          <h2 className="text-base font-semibold">{s.agent.name}</h2>
        </div>
      }
    >
      <RunTabs agent={s.agent} run={s.run} key={s.run.id} />
    </Panel>
  );
  if (s.agent) {
    const agent = s.agent;
    return (
      <Shell back={s.toList} panel={runPanel} title="Агенты">
        <Page>
          <Crumbs items={[["Агенты", s.toList], [agent.name, undefined]]} />
          <AgentPage agent={agent} onRun={(r) => s.openRun(agent, r)} />
        </Page>
      </Shell>
    );
  }
  const done: Slot[] = AGENTS.flatMap((agent) => agent.runs.filter((r) => r.at.startsWith(TODAY)).map((run) => ({ agent, at: run.at, run })));
  done.sort((a, b) => a.at.localeCompare(b.at));
  const stock = agentOf("stock");
  const next: Slot[] = [
    { agent: stock, at: "2026-10-30T11:00", later: "через 18 мин" },
    { agent: stock, at: "2026-10-30T12:00", later: "и каждый час до 18:00 — ещё 7 раз" },
  ];
  const monday: Slot[] = [
    { agent: agentOf("sales"), at: "2026-11-02T08:00", later: "не сможет без «Битрикс24» — подключите до понедельника" },
    { agent: agentOf("brief"), at: "2026-11-02T09:00", later: "пн" },
    { agent: agentOf("invoices"), at: "2026-11-02T10:00", later: "пн" },
  ];
  const stopped = AGENTS.filter((a) => a.state === "failed" || a.state === "paused");
  return (
    <Shell title="">
      <Page>
        {s.empty ? (
          <EmptyAgents />
        ) : (
          <>
            <ListHead sub={countLine()} />
            <section className="flex flex-col gap-1">
              <h2 className="px-2 text-sm font-semibold">Сегодня, пятница</h2>
              <ul className="flex flex-col">
                {done.map((slot) => (
                  <SlotRow key={`${slot.agent.id}-${slot.at}`} onOpen={() => slot.run && s.openRun(slot.agent, slot.run)} slot={slot} />
                ))}
                <Now />
                {next.map((slot) => (
                  <SlotRow key={slot.at} onOpen={() => s.openAgent(slot.agent)} slot={slot} />
                ))}
              </ul>
            </section>
            <section className="flex flex-col gap-1">
              <h2 className="px-2 text-sm font-semibold">Понедельник, 2 ноября</h2>
              <ul className="flex flex-col">
                {monday.map((slot) => (
                  <SlotRow key={slot.agent.id} onOpen={() => s.openAgent(slot.agent)} slot={{ ...slot, later: slot.agent.id === "sales" ? slot.later : undefined }} />
                ))}
              </ul>
            </section>
            <section className="flex flex-col gap-2">
              <h2 className="px-2 text-sm font-semibold">Не запустятся</h2>
              <ul className="divide-y rounded-xl border">
                {stopped.map((a) => (
                  <li className="relative flex items-center gap-3 px-3 py-2.5" key={a.id}>
                    <button aria-label={`Открыть «${a.name}»`} className="absolute inset-0" onClick={() => s.openAgent(a)} type="button" />
                    <StateDot state={a.state} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-medium">{a.name}</span>
                      <span className={cn("truncate text-xs", STATE[a.state].text)}>{a.reason?.text}</span>
                    </span>
                    <Button
                      className="relative z-10"
                      onClick={() => {
                        const r = reasonRun(a);
                        if (a.state === "failed" && r) s.openRun(a, r);
                        else say(`«${a.name}» включён — следующий запуск в пт в 17:00`);
                      }}
                      size="sm"
                      variant="outline"
                    >
                      {a.state === "failed" ? "Разобрать" : "Включить"}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </Page>
    </Shell>
  );
};
