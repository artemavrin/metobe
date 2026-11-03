"use client";

import { cn } from "@metobe/ui/lib/utils";
import { ChevronRight, CircleAlert, CircleX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { EmptyAgents } from "./agent";
import { AGENTS, agentOf } from "./data";
import type { Agent, Run } from "./data";
import { dayOf, Page, Shell, StateDot, timeOf, whenOf } from "./parts";
import { Steps } from "./run";
import { useProto } from "./state";
import { AgentHeader, Composer, DayLine, entriesOf, NeedsYou, NewAgent, NextLine, plainSentence, PRESS, QuietLine, ReportText, RunMessage, SaidBlock, useSaid, whenOf2 } from "./v2-parts";
import { TALK } from "./v2-data";

// Раунд 2 P13. Агент — беседа, которая просыпается по расписанию (так у ChatGPT Tasks и Gemini: итог — сообщением,
// поменять — словами в том же чате), а его настройки — одна фраза с нажимаемыми кусками. Три способа читать итоги:
// «Беседа» (сообщения снизу, как в чате), «Журнал» (последний итог целиком, раньше — строками), «Сводка» (свежие
// итоги всех агентов на одной странице: агентов у человека немного, ходить в каждого не нужно).

/** Сначала те, кто ждёт вас или стоит после сбоев, потом остальные. */
const ORDER: Record<Agent["state"], number> = { failed: 1, idle: 3, paused: 4, running: 2, waiting: 0 };
const sorted = () => [...AGENTS].sort((a, b) => ORDER[a.state] - ORDER[b.state]);

const lastDone = (a: Agent) => a.runs.find((r) => !r.live && r.outcome !== "nothing");

// ── Список ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const AgentRow = ({ agent, onOpen }: { agent: Agent; onOpen: () => void }) => (
  <li>
    <button className={cn("hover:bg-muted/50 flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors", PRESS, "active:scale-[0.99]")} onClick={onOpen} type="button">
      <StateDot className="mt-2" state={agent.state} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium">{agent.name}</span>
        <span className="text-muted-foreground line-clamp-2 text-sm">{plainSentence(agent)}</span>
        <NextLine agent={agent} className="text-xs" />
      </span>
      <ChevronRight className="text-muted-foreground mt-1 size-4 shrink-0" />
    </button>
  </li>
);

const List = () => {
  const { go, empty } = useProto();
  return (
    <Shell title="">
      <Page className="max-w-2xl">
        {empty ? (
          <EmptyAgents />
        ) : (
          <>
            <header className="flex flex-col gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">Агенты</h1>
              <NewAgent />
            </header>
            <ul className="-mx-3 flex flex-col">
              {sorted().map((a) => (
                <AgentRow agent={a} key={a.id} onOpen={() => go({ id: a.id, kind: "agent" })} />
              ))}
            </ul>
          </>
        )}
      </Page>
    </Shell>
  );
};

const useAgent = () => {
  const { nav, go } = useProto();
  return { agent: nav.kind === "list" ? null : agentOf(nav.id), back: () => go({ kind: "list" }) };
};

// ── Беседа ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Страница агента — его беседа: фраза сверху, итоги сообщениями, внизу то, что ждёт вас, и поле «сказать агенту». */
const Conversation = ({ agent, back }: { agent: Agent; back: () => void }) => {
  const { said, send } = useSaid();
  const end = useRef<HTMLDivElement>(null);
  // Как в чате: открывается на последнем; новая реплика — тоже внизу.
  // Свежий Chrome возвращает из scrollIntoView промис — его нельзя отдавать эффекту как уборку.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [said.length]);
  return (
    <Shell back={back} title={agent.name}>
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 @xl:px-6">
        <div className="border-b pt-6 pb-5">
          <AgentHeader agent={agent} />
        </div>
        <div className="flex flex-1 flex-col gap-5 py-6">
          {entriesOf(agent, said).map((e, i) => {
            if (e.type === "day") return <DayLine key={`d${i}`} label={e.label} />;
            if (e.type === "quiet") return <QuietLine key={(e.runs[0] as Run).id} runs={e.runs} />;
            if (e.type === "said") return <SaidBlock key={`s${i}`} said={e.said} />;
            return e.run.live ? null : <RunMessage key={e.run.id} run={e.run} />;
          })}
          <NeedsYou agent={agent} />
          <div ref={end} />
        </div>
        <div className="bg-background sticky bottom-0 pt-2 pb-4">
          <Composer onSend={send} placeholder="Спросите про итог или скажите, как работать дальше…" />
        </div>
      </div>
    </Shell>
  );
};

export const Talk = () => {
  const { agent, back } = useAgent();
  return agent ? <Conversation agent={agent} back={back} key={agent.id} /> : <List />;
};

// ── Журнал ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const Icon = ({ run }: { run: Run }) =>
  run.outcome === "failed" ? <CircleX className="text-destructive size-4 shrink-0" /> : run.outcome === "attention" ? <CircleAlert className="text-warning size-4 shrink-0" /> : <span className="bg-muted-foreground/40 m-[5px] size-1.5 shrink-0 rounded-full" />;

/** Прошлый итог строкой; нажатие раскрывает его тут же. */
const PastRow = ({ run }: { run: Run }) => {
  const [open, setOpen] = useState(false);
  return (
    <li className="flex flex-col">
      <button className="hover:bg-muted/50 grid grid-cols-[1rem_auto_1fr] items-start gap-x-3 rounded-lg px-2 py-2 text-left text-sm transition-colors" onClick={() => setOpen(!open)} type="button">
        <span className="mt-0.5">
          <Icon run={run} />
        </span>
        <span className="text-muted-foreground whitespace-nowrap tabular-nums">
          {dayOf(run.at).replace(/^./u, (c) => c.toLowerCase())}, {timeOf(run.at)}
        </span>
        <span className={cn(open ? "" : "truncate", run.outcome === "nothing" && "text-muted-foreground")}>{run.summary}</span>
      </button>
      {open && (
        <div className="animate-in fade-in slide-in-from-top-1 flex flex-col gap-3 pt-1 pb-3 pl-9 duration-200">
          {run.report && <ReportText run={run} />}
          <Steps run={run} />
        </div>
      )}
    </li>
  );
};

const Journal = ({ agent, back }: { agent: Agent; back: () => void }) => {
  const { said, send } = useSaid();
  const latest = lastDone(agent);
  const past = agent.runs.filter((r) => !r.live && r !== latest);
  const talk = TALK[agent.id] ?? [];
  return (
    <Shell back={back} title={agent.name}>
      <Page className="max-w-2xl">
        <AgentHeader agent={agent} big />
        {said.map((s) => (
          <SaidBlock key={s.said} said={s} />
        ))}
        <NeedsYou agent={agent} />
        {latest && (
          <section className="flex flex-col gap-2">
            <h2 className="text-muted-foreground text-xs font-medium">Последний итог · {whenOf(latest.at)}</h2>
            <div className="rounded-2xl border p-5">
              <RunMessage run={latest} />
            </div>
          </section>
        )}
        {talk.length > 0 && (
          <section className="flex flex-col gap-1">
            <h2 className="text-muted-foreground text-xs font-medium">Вы просили</h2>
            {talk.map((t) => (
              <p className="text-sm" key={t.at}>
                «{t.said}» <span className="text-muted-foreground">— запомнил {whenOf(t.at)}</span>
              </p>
            ))}
          </section>
        )}
        <section className="flex flex-col gap-1">
          <h2 className="text-muted-foreground text-xs font-medium">Раньше</h2>
          <ul className="-mx-2 flex flex-col">
            {past.map((r) => (
              <PastRow key={r.id} run={r} />
            ))}
          </ul>
        </section>
      </Page>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-4">
        <div className="pointer-events-auto mx-auto max-w-2xl">
          <Composer onSend={send} placeholder="Скажите агенту, что поменять…" />
        </div>
      </div>
    </Shell>
  );
};

export const Log = () => {
  const { agent, back } = useAgent();
  return agent ? <Journal agent={agent} back={back} key={agent.id} /> : <List />;
};

// ── Сводка ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Агент в сводке: имя и когда, его свежий итог — коротко; беседа — по нажатию. */
const Fresh = ({ agent, onOpen }: { agent: Agent; onOpen: () => void }) => {
  const run = lastDone(agent);
  return (
    <article className="flex flex-col gap-2 border-b pb-6 last:border-0">
      <button className="group flex items-baseline gap-2 text-left" onClick={onOpen} type="button">
        <span className="font-semibold group-hover:underline">{agent.name}</span>
        <span className="text-muted-foreground text-xs">{run ? whenOf(run.at) : ""}</span>
        <ChevronRight className="text-muted-foreground size-3.5 self-center opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
      {agent.state === "running" && <NeedsYou agent={agent} />}
      {run && <ReportText clamp run={run} />}
      <span className="text-muted-foreground text-xs">
        {whenOf2(agent)} ·{" "}
        <button className="hover:text-foreground underline-offset-2 hover:underline" onClick={onOpen} type="button">
          открыть беседу
        </button>
      </span>
    </article>
  );
};

const Digest = () => {
  const { go, empty } = useProto();
  const open = (a: Agent) => go({ id: a.id, kind: "agent" });
  const waiting = sorted().filter((a) => a.state === "waiting" || a.state === "failed");
  const fresh = sorted().filter((a) => a.state === "idle" || a.state === "running");
  const off = AGENTS.filter((a) => a.state === "paused");
  return (
    <Shell title="">
      <Page className="max-w-2xl">
        {empty ? (
          <EmptyAgents />
        ) : (
          <>
            <header className="flex flex-col gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">Агенты</h1>
              <NewAgent compact />
            </header>
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold">Ждут вас</h2>
              {waiting.map((a) => (
                <div className="flex flex-col gap-1.5" key={a.id}>
                  <button className="text-muted-foreground hover:text-foreground self-start text-xs transition-colors" onClick={() => open(a)} type="button">
                    {a.name}
                  </button>
                  <NeedsYou agent={a} />
                </div>
              ))}
            </section>
            <section className="flex flex-col gap-6">
              <h2 className="text-sm font-semibold">Свежие итоги</h2>
              {fresh.map((a) => (
                <Fresh agent={a} key={a.id} onOpen={() => open(a)} />
              ))}
            </section>
            {off.length > 0 && (
              <p className="text-muted-foreground text-sm">
                Выключены:{" "}
                {off.map((a) => (
                  <button className="hover:text-foreground underline underline-offset-2" key={a.id} onClick={() => open(a)} type="button">
                    {a.name}
                  </button>
                ))}
              </p>
            )}
          </>
        )}
      </Page>
    </Shell>
  );
};

export const Summary = () => {
  const { agent, back } = useAgent();
  return agent ? <Conversation agent={agent} back={back} key={agent.id} /> : <Digest />;
};
