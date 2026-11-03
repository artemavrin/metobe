"use client";

import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowUp, Bot, MessageSquare, RotateCw } from "lucide-react";
import { useState } from "react";
import { Streamdown } from "streamdown";

import { summary, Timeline } from "../activity/parts";
import type { StepView } from "../activity/run";
import type { Agent, Run, RunStep } from "./data";
import { fmtDur, money, runLook, timeOf, TRIGGER, usePhone, whenOf } from "./parts";
import { useProto } from "./state";

// Запуск агента. Три способа его показать: как чат (§16.4 — обычный экран чата с плашкой, работа свёрнута в ленту,
// ниже отчёт), как трассу (ReUI «Run Step Trace»: шаги слева, свойства справа, у упавшего шага — ошибка и
// «повторить»), и как шторку с вкладками (ReUI «Failed Run Triage»: итог, шаги, попытки). Шаги — та же лента, что в чате.

const Meta = ({ children }: { children: React.ReactNode }) => (
  <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[11px]">{children}</span>
);

/** Письмо, которое ждёт «да»: кому, тема, текст и две кнопки. */
const Letter = ({ step }: { step: RunStep }) => {
  const { say } = useProto();
  const [answer, setAnswer] = useState<"sent" | "kept" | null>(null);
  const mail = step.mail;
  if (!mail) return null;
  const waiting = step.state === "waiting" && !answer;
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border p-3 text-sm", waiting ? "border-warning/40 bg-warning/5" : "bg-muted/40")}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Кому</dt>
        <dd className="font-mono">{mail.to}</dd>
        <dt className="text-muted-foreground">Тема</dt>
        <dd>{mail.subject}</dd>
      </dl>
      <p className="text-muted-foreground border-t pt-2 text-xs leading-relaxed whitespace-pre-line">{mail.body}</p>
      {waiting ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
          <span className="text-warning text-xs">Агент отправит это письмо с вашей почты после вашего «да»</span>
          <span className="flex gap-2">
            <Button
              onClick={() => {
                setAnswer("kept");
                say("Не отправлено — агент закончит запуск без письма");
              }}
              size="sm"
              variant="ghost"
            >
              Не отправлять
            </Button>
            <Button
              onClick={() => {
                setAnswer("sent");
                say("Отправлено — агент продолжает запуск");
              }}
              size="sm"
            >
              Отправить
            </Button>
          </span>
        </div>
      ) : (
        answer && <span className="text-muted-foreground text-xs">{answer === "sent" ? "Отправлено по вашему «да»" : "Не отправлено по вашему решению"}</span>
      )}
    </div>
  );
};

/** Что шаг показывает, когда раскрыт. */
const Detail = ({ step, retry }: { step: RunStep; retry?: boolean }) => {
  const { say } = useProto();
  const body = (() => {
    switch (step.kind) {
      case "think":
        return <p className="text-muted-foreground text-sm leading-relaxed">{step.text}</p>;
      case "fetch":
        return (
          <p className="text-sm">
            <span className="text-muted-foreground font-mono text-xs">{step.url?.replace(/^https?:\/\//u, "")}</span>
            <span className="ml-2">{step.title}</span>
          </p>
        );
      case "mail":
        return <Letter step={step} />;
      default:
        return (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Meta>{step.server}</Meta>
              {(step.args ?? []).map(([k, v]) => (
                <Meta key={k}>
                  {k}: {v}
                </Meta>
              ))}
            </div>
            {step.state === "error" && step.fail && (
              <div className="border-destructive/30 bg-destructive/5 flex flex-col gap-1.5 rounded-lg border p-3 text-sm">
                <span className="text-destructive font-medium">{step.fail.reason}</span>
                <span className="text-muted-foreground text-xs">{step.fail.hint}</span>
                {step.input && <pre className="bg-muted text-muted-foreground mt-1 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap">{`${step.input}\n→ ${step.output}`}</pre>}
                {retry && (
                  <Button className="mt-1 w-fit" onClick={() => say("Шаг повторён — снова 403. Агент остаётся остановленным")} size="sm" variant="outline">
                    <RotateCw />
                    Повторить шаг
                  </Button>
                )}
              </div>
            )}
            {step.rows && (
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                {step.rows.map(([k, v]) => (
                  <div className="col-span-2 grid grid-cols-subgrid" key={k}>
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        );
    }
  })();
  return <div className="pt-1 pb-2 pl-7">{body}</div>;
};

const viewsOf = (run: Run): StepView[] => (run.steps ?? []).map((step, index) => ({ index, live: 1, ms: step.ms, state: step.state, step }));

/** Шаги запуска — лента из чата. */
export const Steps = ({ run, surface = "bg-background", retry = false }: { run: Run; surface?: string; retry?: boolean }) => {
  const views = viewsOf(run);
  if (views.length === 0) return <p className="text-muted-foreground text-sm">Шаги этого запуска уже не хранятся — остался отчёт.</p>;
  return <Timeline controls={false} renderDetail={(v) => <Detail retry={retry} step={v.step as RunStep} />} surface={surface} views={views} />;
};

/** Отчёт запуска: полный, если он есть, иначе — его строка. */
export const Report = ({ run }: { run: Run }) => (
  <div className="text-sm leading-relaxed [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
    <Streamdown>{run.report ?? run.summary}</Streamdown>
  </div>
);

/** Свойства запуска: исход, как запущен, когда, сколько шёл и стоил, на какой версии агента. */
export const Facts = ({ agent, run }: { agent: Agent; run: Run }) => {
  const look = runLook(run);
  const Icon = look.icon;
  const rows: [string, React.ReactNode][] = [
    [
      "Исход",
      <span className={cn("inline-flex items-center gap-1.5", look.text)} key="o">
        <Icon className="size-3.5" />
        {look.label}
      </span>,
    ],
    ["Запуск", TRIGGER[run.trigger]],
    ["Начат", whenOf(run.at)],
    ["Длительность", run.live === "waiting" ? "стоит, пока вы не ответите" : fmtDur(run.ms)],
    ["Модель", agent.model],
    ["Токены", new Intl.NumberFormat("ru-RU").format(run.tokens)],
    ["Стоимость", money(run.cost, run.currency)],
    ["Версия агента", `${run.version}${run.version === agent.version ? " — текущая" : ""}`],
    ["Уведомления", run.trigger === "test" ? "только во входящие" : agent.notify],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      {rows.map(([k, v]) => (
        <div className="col-span-2 grid grid-cols-subgrid" key={k}>
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
};

/** Попытки запуска: когда и с какой ошибкой. */
export const Attempts = ({ run }: { run: Run }) =>
  run.attempts ? (
    <ol className="flex flex-col gap-2">
      {run.attempts.map((a, i) => (
        <li className="flex flex-col gap-0.5 rounded-lg border p-3 text-sm" key={a.at}>
          <span className="font-medium">
            Попытка {i + 1} · {timeOf(a.at)}
          </span>
          <span className="text-destructive font-mono text-xs">{a.error}</span>
        </li>
      ))}
    </ol>
  ) : (
    <p className="text-muted-foreground text-sm">Запуск прошёл с первой попытки.</p>
  );

/** Что можно сделать с запуском: повторить упавший, спросить о нём в его чате. */
const RunButtons = ({ run, chat = true }: { run: Run; chat?: boolean }) => {
  const { say } = useProto();
  return (
    <div className="flex flex-wrap gap-2">
      {run.outcome === "failed" && (
        <Button onClick={() => say("Запуск повторён — итог придёт во входящие")} size="sm">
          <RotateCw />
          Повторить запуск
        </Button>
      )}
      {chat && (
        <Button onClick={() => say("Откроется чат запуска — можно спросить о нём или попросить изменить агента")} size="sm" variant="outline">
          <MessageSquare />
          Открыть как чат
        </Button>
      )}
    </div>
  );
};

// ── Как чат ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** §16.4: обычный экран чата с плашкой агента; работа — лентой, ниже отчёт; внизу поле — спросить или поправить агента. */
export const RunChat = ({ agent, run }: { agent: Agent; run: Run }) => {
  const [open, setOpen] = useState(run.live === "waiting" || run.outcome === "failed");
  const views = viewsOf(run);
  const phone = usePhone();
  return (
    <div className="flex min-h-full flex-col">
      <div className="bg-background/90 sticky top-0 z-10 border-b backdrop-blur">
        <div className="text-muted-foreground mx-auto flex max-w-2xl flex-wrap items-center gap-x-1.5 gap-y-0.5 px-4 py-2 text-xs">
          <Bot className="size-3.5" />
          <span className="text-foreground font-medium">{agent.name}</span>
          <span>· {TRIGGER[run.trigger]}</span>
          <span>· {whenOf(run.at)}</span>
          {!run.live && <span>· {fmtDur(run.ms)}</span>}
          <span>· {money(run.cost, run.currency)}</span>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
        <div className="bg-muted text-muted-foreground ml-auto max-w-[85%] rounded-2xl px-3.5 py-2 text-sm">
          <span className="text-foreground/70 mb-0.5 block text-xs font-medium">Задание агента · версия {run.version}</span>
          <span className="line-clamp-3">{agent.instructions}</span>
        </div>
        {views.length > 0 && (
          <div className="flex flex-col gap-1">
            <button className="text-muted-foreground hover:text-foreground self-start text-sm transition-colors" onClick={() => setOpen(!open)} type="button">
              {summary(views, run.ms)} {open ? "▴" : "▾"}
            </button>
            {open && <Steps run={run} retry />}
          </div>
        )}
        {!run.live && run.outcome !== "failed" && <Report run={run} />}
        {!run.live && <RunButtons chat={false} run={run} />}
      </div>
      <div className="bg-background sticky bottom-0 px-4 pt-2 pb-4">
        <div className="mx-auto flex max-w-2xl items-end gap-2 rounded-2xl border p-2 pl-3.5 shadow-sm">
          <span className="text-muted-foreground flex-1 py-1.5 text-sm">{phone ? "Спросите об этом запуске…" : "Спросите об этом запуске или попросите поправить агента…"}</span>
          <Button aria-label="Отправить" disabled size="icon-sm">
            <ArrowUp />
          </Button>
        </div>
      </div>
    </div>
  );
};

// ── Трасса ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** ReUI «Run Step Trace»: слева шаги и итог, справа свойства запуска; на узкой странице свойства уходят вниз. */
export const RunTrace = ({ agent, run }: { agent: Agent; run: Run }) => {
  return (
    <div className="grid gap-4 @3xl:grid-cols-[1fr_17rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <section className="flex flex-col gap-2 rounded-xl border p-4">
          <h2 className="flex items-center justify-between text-sm font-semibold">
            Шаги
            <span className="text-muted-foreground text-xs font-normal">{run.steps ? summary(viewsOf(run), run.ms) : ""}</span>
          </h2>
          <Steps retry run={run} surface="bg-background" />
        </section>
        {/* У упавшего итога нет: ошибка уже стоит в своём шаге. */}
        {!run.live && run.outcome !== "failed" && (
          <section className="flex flex-col gap-2 rounded-xl border p-4">
            <h2 className="text-sm font-semibold">Итог</h2>
            <Report run={run} />
          </section>
        )}
      </div>
      <aside className="flex flex-col gap-4 self-start rounded-xl border p-4 @3xl:sticky @3xl:top-4">
        <h2 className="text-sm font-semibold">Запуск</h2>
        <Facts agent={agent} run={run} />
        <RunButtons run={run} />
      </aside>
    </div>
  );
};

// ── Шторка ───────────────────────────────────────────────────────────────────────────────────────────────────────────

type Tab = "result" | "steps" | "attempts";

/** ReUI «Failed Run Triage»: вкладки итог, шаги, попытки; кнопки внизу. Упавший открывается на шагах — там ошибка. */
export const RunTabs = ({ agent, run }: { agent: Agent; run: Run }) => {
  const [tab, setTab] = useState<Tab>(run.outcome === "failed" || run.live ? "steps" : "result");
  const tabs: [Tab, string][] = [
    ["result", run.outcome === "failed" ? "Ошибка" : "Итог"],
    ["steps", "Шаги"],
    ...(run.attempts ? ([["attempts", `Попытки · ${run.attempts.length}`]] as [Tab, string][]) : []),
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="bg-muted inline-flex self-start rounded-lg p-0.5 text-sm">
        {tabs.map(([id, label]) => (
          <button
            className={cn("rounded-md px-2.5 py-1 transition-colors", tab === id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
            key={id}
            onClick={() => setTab(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "result" && (run.live ? <p className="text-muted-foreground text-sm">Итога ещё нет — запуск {run.live === "running" ? "идёт" : "ждёт вашего ответа"}.</p> : <Report run={run} />)}
      {tab === "steps" && <Steps retry run={run} surface="bg-popover" />}
      {tab === "attempts" && <Attempts run={run} />}
      <div className="border-t pt-4">
        <Facts agent={agent} run={run} />
      </div>
      <RunButtons run={run} />
    </div>
  );
};
