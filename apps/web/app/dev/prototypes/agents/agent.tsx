"use client";

import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowUp, CalendarClock, ChevronRight, Lock, Sparkles } from "lucide-react";
import { useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { TEMPLATES } from "./data";
import type { Agent, Run } from "./data";
import { AgentActions, dayOf, fmtDur, money, OUTCOME, OutcomeStrip, ReasonBanner, reasonRun, RunIcon, runLook, STATE, StateDot, statusLine, timeOf, TRIGGER, untilOf, whenOf } from "./parts";
import { useProto } from "./state";

// Страница агента (§16.4): шапка с состоянием и кнопками, причина, если агент ждёт или стоит, и три вкладки —
// запуски, настройки, статистика. Вариант «Очередь» кладёт настройки и цифры сбоку (ReUI «Agent Settings»),
// остальные — вкладками.

const UPCOMING: Record<string, string[]> = {
  brief: ["2026-11-02T09:00", "2026-11-03T09:00", "2026-11-04T09:00"],
  digest: ["2026-11-06T17:00", "2026-11-13T17:00", "2026-11-20T17:00"],
  invoices: ["2026-11-02T10:00", "2026-11-09T10:00", "2026-11-16T10:00"],
  prices: ["2026-10-31T08:00", "2026-11-01T08:00", "2026-11-02T08:00"],
  sales: ["2026-11-02T08:00", "2026-11-09T08:00", "2026-11-16T08:00"],
  stock: ["2026-10-30T11:00", "2026-10-30T12:00", "2026-10-30T13:00"],
};

// ── Запуски ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const RunRow = ({ run, onOpen, dated = false }: { run: Run; onOpen: () => void; dated?: boolean }) => (
  <button className={cn("hover:bg-muted/60 group grid w-full items-start gap-x-3 rounded-lg px-2 py-2 text-left text-sm transition-colors", dated ? "grid-cols-[1rem_5.5rem_1fr_auto]" : "grid-cols-[1rem_2.75rem_1fr_auto]")} onClick={onOpen} type="button">
    <RunIcon className="mt-0.5" run={run} />
    <span className="text-muted-foreground tabular-nums">{dated ? `${dayOf(run.at).replace(/^./u, (c) => c.toLowerCase())}` : timeOf(run.at)}</span>
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className={cn("line-clamp-2", run.outcome === "nothing" && "text-muted-foreground")}>{run.summary}</span>
      <span className="text-muted-foreground flex flex-wrap gap-x-1.5 text-xs">
        {run.live ? <span className={runLook(run).text}>{runLook(run).label}</span> : <span>{fmtDur(run.ms)}</span>}
        <span>· {money(run.cost, run.currency)}</span>
        {run.trigger !== "schedule" && <span>· {TRIGGER[run.trigger]}</span>}
      </span>
    </span>
    <ChevronRight className="text-muted-foreground mt-0.5 size-4 opacity-0 transition-opacity group-hover:opacity-100" />
  </button>
);

/** Лента запусков по дням. «Ничего нового» подряд складывается в одну строку — иначе часовой агент тонет в них. */
export const RunsList = ({ agent, onOpen }: { agent: Agent; onOpen: (run: Run) => void }) => {
  const [quiet, setQuiet] = useState(false);
  const days = new Map<string, Run[]>();
  for (const run of agent.runs) {
    const d = dayOf(run.at);
    days.set(d, [...(days.get(d) ?? []), run]);
  }
  // Раз в день и реже — заголовок над каждой строкой лишний: день встаёт на место часа.
  if ([...days.values()].every((runs) => runs.length === 1)) {
    return (
      <div className="flex flex-col">
        {agent.runs.map((run) => (
          <RunRow dated key={run.id} onOpen={() => onOpen(run)} run={run} />
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {[...days].map(([day, runs]) => {
        const items: (Run | Run[])[] = [];
        for (const run of runs) {
          const last = items.at(-1);
          if (!quiet && run.outcome === "nothing") {
            if (Array.isArray(last)) last.push(run);
            else items.push([run]);
          } else items.push(run);
        }
        return (
          <section className="flex flex-col" key={day}>
            <h3 className="text-muted-foreground px-2 pb-1 text-xs font-medium">{day}</h3>
            {items.map((it) =>
              Array.isArray(it) ? (
                it.length === 1 ? (
                  <RunRow key={(it[0] as Run).id} onOpen={() => onOpen(it[0] as Run)} run={it[0] as Run} />
                ) : (
                  <button className="text-muted-foreground hover:bg-muted/60 flex items-center gap-3 rounded-lg px-2 py-2 text-left text-sm" key={(it[0] as Run).id} onClick={() => setQuiet(true)} type="button">
                    <OUTCOME.nothing.icon className="size-4 shrink-0" />
                    <span>
                      {timeOf((it.at(-1) as Run).at)}–{timeOf((it[0] as Run).at)} · ничего нового, {it.length} запуска
                    </span>
                  </button>
                )
              ) : (
                <RunRow key={it.id} onOpen={() => onOpen(it)} run={it} />
              )
            )}
          </section>
        );
      })}
    </div>
  );
};

// ── Настройки ────────────────────────────────────────────────────────────────────────────────────────────────────────

const Block = ({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) => (
  <section className="flex flex-col gap-2">
    <div className="flex flex-col">
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
    {children}
  </section>
);

/** Настройки агента. Права — по ReUI «Tool Access Matrix», но три режима вместо матрицы; правило админа — с замком. */
export const SettingsBody = ({ agent }: { agent: Agent }) => (
  <div className="flex flex-col gap-6">
    <Block hint="Как сформулировали при создании. Поменять — словами в чате: «Изменить» сверху." title="Задание">
      <p className="bg-muted/50 rounded-lg p-3 text-sm leading-relaxed">{agent.instructions}</p>
    </Block>
    <Block title="Расписание">
      <div className="flex flex-col gap-1.5 text-sm">
        <span className="flex flex-wrap items-center gap-2">
          <CalendarClock className="text-muted-foreground size-4" />
          {agent.schedule}
          <code className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[11px]">{agent.cron}</code>
        </span>
        <span className="text-muted-foreground text-xs">Ближайшие: {(UPCOMING[agent.id] ?? []).map(whenOf).join(" · ")}</span>
      </div>
    </Block>
    <Block hint="Агент работает вашими подключениями и ничего не спрашивает — кроме того, что админ велел подтверждать." title="Инструменты">
      <ul className="flex flex-col divide-y rounded-lg border">
        {agent.tools.map((t) => (
          <li className="flex items-center gap-3 px-3 py-2.5 text-sm" key={t}>
            <BrandLogo label={t} logo={undefined} size={24} />
            <span className="flex-1">{t}</span>
            <span className="text-muted-foreground text-xs">читать и менять</span>
          </li>
        ))}
        {agent.tools.includes("Почта") && (
          <li className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <Lock className="text-muted-foreground size-4" />
            <span className="flex-1">Отправка писем</span>
            <span className="bg-warning/10 text-warning rounded-full px-2 py-0.5 text-xs">спрашивает · правило админа</span>
          </li>
        )}
      </ul>
    </Block>
    <Block title="Уведомления">
      <p className="text-sm">{agent.notify}</p>
    </Block>
    <Block hint="Сверх них запуск останавливается — сделанное остаётся в его чате." title="Модель и лимиты">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Модель</dt>
        <dd>{agent.model}</dd>
        <dt className="text-muted-foreground">За запуск</dt>
        <dd>до 20 шагов · до 5 мин · до $0,50</dd>
        <dt className="text-muted-foreground">Версия</dt>
        <dd>{agent.version} · изменён 20 окт</dd>
      </dl>
    </Block>
  </div>
);

// ── Статистика ───────────────────────────────────────────────────────────────────────────────────────────────────────

export const StatsBody = ({ agent, column = false }: { agent: Agent; column?: boolean }) => {
  const finished = agent.runs.filter((r) => r.outcome);
  const ok = finished.filter((r) => r.outcome !== "failed").length;
  const spent = agent.runs.reduce((s, r) => s + r.cost, 0);
  const avg = finished.reduce((s, r) => s + r.ms, 0) / Math.max(1, finished.length);
  const tiles: [string, string][] = [
    ["Без сбоев", `${Math.round((ok / Math.max(1, finished.length)) * 100)}%`],
    ["Запусков", String(agent.runs.length)],
    ["Потрачено", money(spent, "USD")],
    ["В среднем", fmtDur(avg)],
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className={cn("grid grid-cols-2 gap-2", !column && "@2xl:grid-cols-4")}>
        {tiles.map(([k, v]) => (
          <div className="flex flex-col gap-0.5 rounded-xl border px-3 py-2.5" key={k}>
            <span className="text-muted-foreground text-xs">{k}</span>
            <span className="text-lg font-semibold tabular-nums">{v}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 rounded-xl border p-3">
        <span className="text-muted-foreground text-xs">Последние запуски</span>
        <OutcomeStrip count={30} runs={agent.runs} tall />
        <span className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {Object.values(OUTCOME).map((o) => (
            <span className="flex items-center gap-1.5" key={o.label}>
              <span className={cn("size-2 rounded-full", o.bg)} />
              {o.label}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
};

// ── Страница ─────────────────────────────────────────────────────────────────────────────────────────────────────────

type Tab = "runs" | "settings" | "stats";

const Tabs = ({ value, onChange }: { value: Tab; onChange: (t: Tab) => void }) => (
  <div className="flex gap-4 border-b text-sm">
    {(
      [
        ["runs", "Запуски"],
        ["settings", "Настройки"],
        ["stats", "Статистика"],
      ] as [Tab, string][]
    ).map(([id, label]) => (
      <button
        className={cn("-mb-px border-b-2 pb-2 transition-colors", value === id ? "border-foreground font-medium" : "text-muted-foreground hover:text-foreground border-transparent")}
        key={id}
        onClick={() => onChange(id)}
        type="button"
      >
        {label}
      </button>
    ))}
  </div>
);

export const AgentHead = ({ agent }: { agent: Agent }) => (
  <header className="flex flex-col gap-3">
    <div className="flex flex-col gap-1">
      <span className={cn("flex items-center gap-1.5 text-xs font-medium", STATE[agent.state].text)}>
        <StateDot state={agent.state} />
        {STATE[agent.state].label}
        {agent.state !== "failed" && agent.state !== "paused" && agent.next && <span className="text-muted-foreground font-normal">· следующий {untilOf(agent.next)}</span>}
      </span>
      <h1 className="text-xl font-semibold tracking-tight">{agent.name}</h1>
      <p className="text-muted-foreground text-sm">{agent.about}</p>
    </div>
    <AgentActions agent={agent} />
  </header>
);

/**
 * `aside` — настройки и цифры сбоку от запусков (ReUI «Agent Settings»); иначе три вкладки. Кнопка в причине ведёт
 * в тот запуск, где всё видно: письмо, ошибка.
 */
export const AgentPage = ({ agent, onRun, aside = false }: { agent: Agent; onRun: (run: Run) => void; aside?: boolean }) => {
  const [tab, setTab] = useState<Tab>("runs");
  const { say } = useProto();
  const target = reasonRun(agent);
  const onAction = agent.state === "waiting" && agent.id === "sales" ? () => say("Откроется вход в «Битрикс24» — после него агент запустится сам") : target ? () => onRun(target) : undefined;
  const running = agent.state === "running" && agent.progress;
  return (
    <div className="flex flex-col gap-5">
      <AgentHead agent={agent} />
      <ReasonBanner agent={agent} onAction={onAction} />
      {running && (
        <button className="border-info/30 bg-info/5 flex items-center gap-3 rounded-xl border p-3 text-left text-sm" onClick={() => onRun(agent.runs[0] as Run)} type="button">
          <span className="bg-info size-2 shrink-0 animate-pulse rounded-full motion-reduce:animate-none" />
          <span className="min-w-0 flex-1 truncate">{statusLine(agent)}</span>
          <span className="text-muted-foreground shrink-0 text-xs">с {timeOf((agent.runs[0] as Run).at)}</span>
          <ChevronRight className="text-muted-foreground size-4" />
        </button>
      )}
      {aside ? (
        <div className="grid gap-6 @3xl:grid-cols-[1fr_18rem]">
          <section className="flex min-w-0 flex-col gap-2">
            <h2 className="text-sm font-semibold">Запуски</h2>
            <RunsList agent={agent} onOpen={onRun} />
          </section>
          <aside className="flex flex-col gap-6 @3xl:border-l @3xl:pl-6">
            <StatsBody agent={agent} column />
            <SettingsBody agent={agent} />
          </aside>
        </div>
      ) : (
        <>
          <Tabs onChange={setTab} value={tab} />
          {tab === "runs" && <RunsList agent={agent} onOpen={onRun} />}
          {tab === "settings" && <SettingsBody agent={agent} />}
          {tab === "stats" && <StatsBody agent={agent} />}
        </>
      )}
    </div>
  );
};

// ── Пусто ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Агентов ещё нет: что это такое одной фразой, поле «опишите своими словами» и шаблоны. Всё ведёт в чат. */
export const EmptyAgents = () => {
  const { say } = useProto();
  const [text, setText] = useState("");
  const create = (what: string) => say(`Откроется чат: «${what}» — модель предложит черновик агента`);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 pt-6 @xl:pt-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="bg-muted grid size-11 place-items-center rounded-xl">
          <Sparkles className="size-5" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">Поручите регулярную работу</h1>
        <p className="text-muted-foreground max-w-md text-sm text-balance">Агент сам по расписанию смотрит почту, 1С или сайты и присылает итог во входящие — только когда есть что сказать.</p>
      </div>
      <form
        className="flex items-end gap-2 rounded-2xl border p-2 pl-3.5 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) create(text.trim());
        }}
      >
        <textarea
          className="placeholder:text-muted-foreground min-h-12 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none"
          onChange={(e) => setText(e.target.value)}
          placeholder="Например: каждое утро присылай, что важного в почте"
          rows={2}
          value={text}
        />
        <Button aria-label="Создать" disabled={!text.trim()} size="icon-sm" type="submit">
          <ArrowUp />
        </Button>
      </form>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs">Или начните с готового</span>
        <div className="grid gap-2 @xl:grid-cols-2">
          {TEMPLATES.map((t) => (
            <button className="hover:border-foreground/20 flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors" key={t.name} onClick={() => create(t.name)} type="button">
              <span className="text-sm font-medium">{t.name}</span>
              <span className="text-muted-foreground text-xs">{t.about}</span>
              <span className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                <CalendarClock className="size-3" />
                {t.when}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
