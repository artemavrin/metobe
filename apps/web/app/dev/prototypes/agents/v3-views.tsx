"use client";

import { cn } from "@metobe/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { EmptyAgents } from "./agent";
import { AGENTS, agentOf } from "./data";
import type { Agent, Run } from "./data";
import { EnabledSwitch, Page, ProgressLine, SectionLabel, Shell, StateWord, timeOf, whenOf } from "./parts";
import { useProto } from "./state";
import { AgentMenu, Composer, DayLine, entriesOf, NeedsYou, NextLine, QuietLine, ReportText, RunMessage, SaidBlock, Sentence, useSaid } from "./v2-parts";
import { changesOf, PAGES } from "./v3-data";
import type { Line } from "./v3-data";
import { ActionToast, Ask, ChatRow, Tile, useResolved, Waiting } from "./v3-parts";

// Раунд 3 P13. Три разных ответа на «как читать, что делают агенты» — разных с первого экрана:
// «Беседа» — агенты как чаты в мессенджере, агент — его беседа; «Страница» — агент держит одну страницу «что сейчас»
// и при каждом запуске переписывает её, изменения помечены; «Сводка» — свежие итоги всех агентов на одной странице.
// Общее: фраза агента с нажимаемыми кусками, блок «Ждут вас» (есть, пока есть что решить), уведомление с кнопкой,
// состояние словом и полоска шага в боковой панели, поле «Что поручить?» с подсказкой и примерами.

const ORDER: Record<Agent["state"], number> = { failed: 1, idle: 3, paused: 4, running: 2, waiting: 0 };
const sorted = () => [...AGENTS].sort((a, b) => ORDER[a.state] - ORDER[b.state]);
const lastDone = (a: Agent) => a.runs.find((r) => !r.live && r.outcome !== "nothing");

const useAgent = () => {
  const { nav, go } = useProto();
  return { agent: nav.kind === "list" ? null : agentOf(nav.id), back: () => go({ kind: "list" }), open: (a: Agent) => go({ id: a.id, kind: "agent" }) };
};

/** Список: заголовок, «Что поручить?», «Ждут вас», дальше — своё у каждого варианта. Уведомление — поверх. */
const ListFrame = ({ children, examples = true }: { children: React.ReactNode; examples?: boolean }) => {
  const { empty } = useProto();
  const { open } = useAgent();
  const resolved = useResolved();
  return (
    <Shell panel={!empty && <ActionToast resolved={resolved} />} title="" words>
      <Page className="max-w-2xl gap-8">
        {empty ? (
          <EmptyAgents />
        ) : (
          <>
            <header className="flex flex-col gap-4">
              <h1 className="text-2xl font-semibold tracking-tight">Агенты</h1>
              <Ask examples={examples} />
            </header>
            <Waiting onOpen={open} resolved={resolved} />
            {children}
          </>
        )}
      </Page>
    </Shell>
  );
};

/** Шапка агента: имя, включён ли, меню; фраза; что дальше; полоска шага, если идёт. */
const Head = ({ agent, big = false }: { agent: Agent; big?: boolean }) => (
  <header className="flex flex-col gap-3">
    <div className="flex items-center gap-3">
      <Tile agent={agent} size={big ? 40 : 32} />
      <h1 className={cn("min-w-0 flex-1 truncate font-semibold tracking-tight", big ? "text-2xl" : "text-lg")}>{agent.name}</h1>
      <StateWord agent={agent} />
      <EnabledSwitch agent={agent} />
      <AgentMenu agent={agent} />
    </div>
    <Sentence agent={agent} className="text-[15px] leading-relaxed" />
    <NextLine agent={agent} className="text-sm" />
    <ProgressLine agent={agent} />
  </header>
);

// ── Беседа ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const Conversation = ({ agent, back }: { agent: Agent; back: () => void }) => {
  const { said, send } = useSaid();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [said.length]);
  return (
    <Shell back={back} title={agent.name} words>
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 @xl:px-6">
        <div className="border-b pt-6 pb-5">
          <Head agent={agent} />
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

export const Chats = () => {
  const { agent, back, open } = useAgent();
  if (agent) return <Conversation agent={agent} back={back} key={agent.id} />;
  return (
    <ListFrame>
      <section className="flex flex-col gap-1">
        <SectionLabel count={AGENTS.length}>Все агенты</SectionLabel>
        <ul className="-mx-3 flex flex-col">
          {sorted().map((a) => (
            <ChatRow agent={a} key={a.id} onOpen={() => open(a)} />
          ))}
        </ul>
      </section>
    </ListFrame>
  );
};

// ── Страница ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Строка страницы: новое — с зелёной чертой, ушедшее — зачёркнуто, изменившееся — с «было». */
const PageLine = ({ line, marks }: { line: Line; marks: boolean }) => {
  const m = marks ? line.mark : undefined;
  return (
    <li className="grid grid-cols-[3px_1fr_auto] items-start gap-x-3 py-2">
      <span className={cn("mt-0.5 h-[1.15rem] rounded-full transition-colors duration-[120ms]", m === "new" ? "bg-success" : m === "changed" ? "bg-warning" : "bg-transparent")} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={cn("text-[15px]", m === "gone" && "text-muted-foreground line-through decoration-1")}>
          {line.text}
          {m === "new" && <span className="text-success ml-2 text-xs no-underline">новое</span>}
          {m === "gone" && <span className="text-muted-foreground ml-2 inline-block text-xs">ушло</span>}
        </span>
        {m === "changed" && line.was && <span className="text-muted-foreground text-xs">было: {line.was}</span>}
      </span>
      <span className={cn("text-muted-foreground font-mono text-xs whitespace-nowrap", m === "gone" && "line-through")}>{line.aside}</span>
    </li>
  );
};

const changesText = (agentId: string) => {
  const page = PAGES[agentId];
  if (!page) return "";
  const c = changesOf(page);
  return [c.fresh && `+${c.fresh} новое`, c.changed && `${c.changed} изменилось`, c.gone && `${c.gone} ушло`].filter(Boolean).join(" · ");
};

/** Страница агента: что сейчас — заголовком, ниже разделы; переключатель «изменения», версии страницы. */
const AgentPageView = ({ agent, back }: { agent: Agent; back: () => void }) => {
  const page = PAGES[agent.id];
  const { said, send } = useSaid();
  const [marks, setMarks] = useState(true);
  const [version, setVersion] = useState(0);
  if (!page) return null;
  const latest = version === 0;
  return (
    <Shell back={back} title={agent.name} words>
      <Page className="max-w-2xl gap-8">
        <Head agent={agent} />
        {said.map((s) => (
          <SaidBlock key={s.said} said={s} />
        ))}
        {(agent.state === "waiting" || agent.state === "failed") && <NeedsYou agent={agent} />}
        <article className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            {page.stale && <span className="text-warning text-xs">{page.stale}</span>}
            <h2 className="text-xl leading-snug font-semibold tracking-tight text-balance">{page.headline}</h2>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="font-mono">обновлено {whenOf(page.versions[version] ?? page.updated)}</span>
              {latest && (
                <button
                  aria-pressed={marks}
                  className={cn("rounded-full border px-2 py-0.5 transition-colors duration-[120ms]", marks ? "bg-foreground text-background border-foreground" : "hover:bg-muted")}
                  onClick={() => setMarks(!marks)}
                  type="button"
                >
                  Изменения с {page.since} · {changesText(agent.id) || "нет"}
                </button>
              )}
            </div>
          </div>
          {page.sections.map((s) => (
            <section className="flex flex-col" key={s.title}>
              <SectionLabel className="pb-1">{s.title}</SectionLabel>
              <ul className="divide-y">
                {s.lines.map((l) => (
                  <PageLine key={l.text} line={l} marks={marks && latest} />
                ))}
              </ul>
            </section>
          ))}
          <section className="flex flex-col gap-2">
            <SectionLabel count={page.versions.length}>Версии страницы</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {page.versions.map((v, i) => (
                <button
                  className={cn("rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors duration-[120ms]", i === version ? "bg-muted border-foreground/20" : "text-muted-foreground hover:bg-muted")}
                  key={v}
                  onClick={() => setVersion(i)}
                  type="button"
                >
                  {whenOf(v)}
                </button>
              ))}
            </div>
          </section>
        </article>
      </Page>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-4">
        <div className="pointer-events-auto mx-auto max-w-2xl">
          <Composer onSend={send} placeholder="Скажите, что поменять на странице…" />
        </div>
      </div>
    </Shell>
  );
};

/** Карточка в списке — заголовок страницы агента: что сейчас, когда обновлено, сколько изменилось. */
const PageCard = ({ agent, onOpen }: { agent: Agent; onOpen: () => void }) => {
  const page = PAGES[agent.id];
  const changes = changesText(agent.id);
  return (
    <button className={cn("hover:border-foreground/20 flex min-w-0 flex-col gap-2 rounded-xl border p-4 text-left transition-[border-color,transform] duration-[120ms] active:scale-[0.99]", agent.state === "paused" && "opacity-70")} onClick={onOpen} type="button">
      <span className="flex items-center gap-2">
        <Tile agent={agent} size={20} />
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">{agent.name}</span>
        <StateWord agent={agent} />
      </span>
      <span className="text-[15px] leading-snug font-medium text-pretty">{page?.headline}</span>
      <span className="text-muted-foreground mt-auto flex items-center gap-2 text-xs">
        {page?.stale ? <span className="text-warning truncate">{page.stale.split(" — ")[0]}</span> : <span className="font-mono">{page ? whenOf(page.updated) : ""}</span>}
        {!page?.stale && changes && <span className="text-success">{changes}</span>}
      </span>
      <ProgressLine agent={agent} />
    </button>
  );
};

export const Pages = () => {
  const { agent, back, open } = useAgent();
  if (agent) return <AgentPageView agent={agent} back={back} key={agent.id} />;
  return (
    <ListFrame>
      <section className="flex flex-col gap-2">
        <SectionLabel count={AGENTS.length}>Что сейчас</SectionLabel>
        <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2">
          {sorted().map((a) => (
            <PageCard agent={a} key={a.id} onOpen={() => open(a)} />
          ))}
        </div>
      </section>
    </ListFrame>
  );
};

// ── Сводка ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Свежий итог агента в общей сводке: коротко, «читать целиком» раскрывает на месте. */
const Fresh = ({ agent, onOpen }: { agent: Agent; onOpen: () => void }) => {
  const run = lastDone(agent);
  const [full, setFull] = useState(false);
  return (
    <article className="flex flex-col gap-2 border-b pb-6 last:border-0">
      <div className="flex items-center gap-2.5">
        <Tile agent={agent} size={24} />
        <button className="min-w-0 flex-1 truncate text-left font-semibold hover:underline" onClick={onOpen} type="button">
          {agent.name}
        </button>
        {agent.state === "running" && <StateWord agent={agent} />}
        <span className="text-muted-foreground font-mono text-[11px]">{run ? timeOf(run.at) : ""}</span>
      </div>
      <ProgressLine agent={agent} />
      {run && (
        <div className={cn("relative", !full && "max-h-28 overflow-hidden")}>
          <ReportText run={run} />
          {!full && <div className="from-background pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t" />}
        </div>
      )}
      <div className="text-muted-foreground flex gap-3 text-xs">
        <button className="hover:text-foreground transition-colors duration-[120ms]" onClick={() => setFull(!full)} type="button">
          {full ? "Свернуть" : "Читать целиком"}
        </button>
        <button className="hover:text-foreground flex items-center gap-0.5 transition-colors duration-[120ms]" onClick={onOpen} type="button">
          Беседа <ChevronRight className="size-3" />
        </button>
      </div>
    </article>
  );
};

export const Digest = () => {
  const { agent, back, open } = useAgent();
  if (agent) return <Conversation agent={agent} back={back} key={agent.id} />;
  const fresh = sorted().filter((a) => a.state === "idle" || a.state === "running");
  const off = AGENTS.filter((a) => a.state === "paused");
  return (
    <ListFrame examples={false}>
      <section className="flex flex-col gap-6">
        <SectionLabel count={fresh.length}>Свежие итоги</SectionLabel>
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
    </ListFrame>
  );
};
