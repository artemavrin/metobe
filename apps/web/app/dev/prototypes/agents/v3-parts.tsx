"use client";

import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowUp, Eye, Mail, Newspaper, Receipt, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { AGENTS } from "./data";
import type { Agent } from "./data";
import { dayOf, ProgressLine, SectionLabel, statusLine, timeOf, usePhone } from "./parts";
import { useProto } from "./state";

// Общие части раунда 3 — приёмы из Orbit, переложенные на наш интерфейс: блок «Ждут вас», который есть, только пока
// есть чего ждать; уведомление с главной кнопкой внутри; поле ввода с подсказкой, что будет, и примерами под ним;
// строка агента как строка чата. Одна кривая на всё — cubic-bezier(0.2, 0.8, 0.2, 1): 120 мс на наведение и цвет,
// 280 мс на раскрытие и сворачивание по строкам сетки.

export const CURVE = "ease-[cubic-bezier(0.2,0.8,0.2,1)]";
export const PRESS = "transition-transform duration-[120ms] active:scale-[0.97]";

/** Сворачивание по строкам сетки: уходит плавно, не проваливаясь, и не держит фокус. */
export const Collapse = ({ open, children }: { open: boolean; children: React.ReactNode }) => (
  <div className={cn("grid transition-[grid-template-rows,opacity] duration-[280ms] motion-reduce:transition-none", CURVE, open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")} inert={!open}>
    <div className="min-h-0 overflow-hidden">{children}</div>
  </div>
);

export const Tile = ({ agent, size = 32 }: { agent: Agent; size?: number }) => <BrandLogo label={agent.name} logo={undefined} size={size} />;

// ── Ждут вас ─────────────────────────────────────────────────────────────────────────────────────────────────────────

type Wait = { id: string; agent: Agent; what: string; action: string; done: string; letter?: boolean };

const WAITS: Wait[] = [
  { action: "Отправить", agent: AGENTS.find((a) => a.id === "invoices") as Agent, done: "Письмо «Ромашке» отправлено", id: "invoices", letter: true, what: "Письмо «Ромашке» о счёте № 1182 — отправить с вашей почты?" },
  { action: "Войти", agent: AGENTS.find((a) => a.id === "sales") as Agent, done: "Вошли в «Битрикс24» — отчёт собирается", id: "sales", what: "Нужен вход в «Битрикс24» — без него отчёта в понедельник не будет" },
  { action: "Убрать сайт и продолжить", agent: AGENTS.find((a) => a.id === "prices") as Agent, done: "mebelgrad.ru убран, агент снова включён", id: "prices", what: "Остановлен: mebelgrad.ru не пускает 5 запусков подряд" },
];

const LETTER = "Добрый день!\n\nНапоминаем об оплате счёта № 1182 от 9 октября на 86 400 ₽. Срок оплаты прошёл 23 октября.\nПросим оплатить до 6 ноября или сообщить, если есть вопросы.\n\nС уважением,\nАртём";

/** Общий на страницу: что уже решено — уходит отовсюду сразу (блок, уведомление). */
const useResolved = () => {
  const [done, setDone] = useState<string[]>([]);
  return { done, resolve: (id: string) => setDone((d) => [...d, id]) };
};

export type Resolved = ReturnType<typeof useResolved>;
export { useResolved };

const WaitRow = ({ w, gone, onDone, onOpen }: { w: Wait; gone: boolean; onDone: () => void; onOpen: () => void }) => {
  const [peek, setPeek] = useState(false);
  return (
    <Collapse open={!gone}>
      <div className="flex flex-col gap-2 border-b py-3 last:border-0">
        {/* На узкой странице кнопки уходят под текст: рядом они сжимают его в столбик. */}
        <div className="flex flex-col gap-2 @xl:flex-row @xl:items-center @xl:gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Tile agent={w.agent} size={28} />
            <button className="flex min-w-0 flex-1 flex-col text-left" onClick={onOpen} type="button">
              <span className="text-muted-foreground text-xs">{w.agent.name}</span>
              <span className="text-sm">{w.what}</span>
            </button>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2">
          {w.letter && (
            <Button className={PRESS} onClick={() => setPeek(!peek)} size="sm" variant="ghost">
              {peek ? "Скрыть" : "Посмотреть"}
            </Button>
          )}
          <Button className={PRESS} onClick={onDone} size="sm" variant={w.letter ? "default" : "outline"}>
            {w.action}
          </Button>
          </div>
        </div>
        {w.letter && (
          <Collapse open={peek}>
            <div className="bg-muted/50 ml-10 rounded-lg p-3 text-xs leading-relaxed whitespace-pre-line">
              <span className="text-muted-foreground block pb-1 font-mono">buh@romashka.ru · Счёт № 1182 — напоминание об оплате</span>
              {LETTER}
            </div>
          </Collapse>
        )}
      </div>
    </Collapse>
  );
};

/** «Ждут вас»: есть, пока есть что решить; решённое сворачивается, последнее — вместе с блоком. */
export const Waiting = ({ resolved, onOpen }: { resolved: Resolved; onOpen: (a: Agent) => void }) => {
  const { say } = useProto();
  const left = WAITS.filter((w) => !resolved.done.includes(w.id)).length;
  return (
    <Collapse open={left > 0}>
      <section className="flex flex-col gap-1">
        <SectionLabel count={left}>Ждут вас</SectionLabel>
        <div className="flex flex-col">
          {WAITS.map((w) => (
            <WaitRow
              gone={resolved.done.includes(w.id)}
              key={w.id}
              onDone={() => {
                resolved.resolve(w.id);
                say(w.done);
              }}
              onOpen={() => onOpen(w.agent)}
              w={w}
            />
          ))}
        </div>
      </section>
    </Collapse>
  );
};

/** Уведомление с главной кнопкой внутри: подтвердить, не уходя со страницы. Справа снизу, на телефоне — сверху. */
export const ActionToast = ({ resolved }: { resolved: Resolved }) => {
  const { say } = useProto();
  const phone = usePhone();
  const [shown, setShown] = useState(false);
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 1200);
    return () => clearTimeout(t);
  }, []);
  const agent = AGENTS.find((a) => a.id === "invoices") as Agent;
  const open = shown && !closed && !resolved.done.includes("invoices");
  return (
    <div
      aria-live="polite"
      className={cn(
        "bg-popover absolute z-40 flex items-center gap-3 rounded-xl border p-3 shadow-lg transition-[opacity,transform] duration-200",
        CURVE,
        phone ? "inset-x-3 top-3" : "right-4 bottom-4 w-[22rem]",
        open ? "translate-y-0 opacity-100" : cn("pointer-events-none opacity-0", phone ? "-translate-y-2" : "translate-y-2")
      )}
    >
      <Tile agent={agent} size={28} />
      <span className="flex min-w-0 flex-1 flex-col text-sm">
        <span>
          <b className="font-medium">{agent.name}</b> ждёт вашего «да»
        </span>
        <span className="text-muted-foreground truncate text-xs">Письмо «Ромашке» о счёте № 1182</span>
      </span>
      <Button
        className={PRESS}
        onClick={() => {
          resolved.resolve("invoices");
          say("Письмо «Ромашке» отправлено");
        }}
        size="sm"
      >
        Отправить
      </Button>
      <button aria-label="Закрыть" className="text-muted-foreground hover:text-foreground transition-colors duration-[120ms]" onClick={() => setClosed(true)} type="button">
        <X className="size-4" />
      </button>
    </div>
  );
};

// ── Поле «поручить» ──────────────────────────────────────────────────────────────────────────────────────────────────

const EXAMPLES = [
  { icon: Mail, text: "Каждое утро — что важного в почте" },
  { icon: Eye, text: "Следить за страницей и писать, если поменялась" },
  { icon: Newspaper, text: "По пятницам — главное по теме" },
  { icon: Receipt, text: "Напоминать клиентам о просроченных счетах" },
];

/** Поле с подсказкой внутри — что будет после «↵», — и примерами под ним. */
export const Ask = ({ examples = true }: { examples?: boolean }) => {
  const { say } = useProto();
  const phone = usePhone();
  const [text, setText] = useState("");
  const send = (t: string) => {
    say(`Откроется чат: «${t}» — модель предложит агента одной фразой`);
    setText("");
  };
  return (
    <div className="flex flex-col gap-3">
      <form
        className="focus-within:border-foreground/25 flex flex-col gap-2 rounded-2xl border p-3 shadow-sm transition-colors duration-[120ms]"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) send(text.trim());
        }}
      >
        <input className="placeholder:text-muted-foreground bg-transparent px-1 text-[15px] outline-none" onChange={(e) => setText(e.target.value)} placeholder="Что поручить агенту?" value={text} />
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground flex min-w-0 flex-1 items-center gap-1.5 px-1 text-xs">
            <Sparkles className="size-3.5 shrink-0" />
            <span className="truncate">Модель предложит агента — вы проверите до первого запуска</span>
          </span>
          {!phone && <span className="text-muted-foreground font-mono text-[11px]">↵ создать</span>}
          <Button aria-label="Создать" className={PRESS} disabled={!text.trim()} size="icon-sm" type="submit">
            <ArrowUp />
          </Button>
        </div>
      </form>
      {examples && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map(({ icon: Icon, text: t }) => (
            <button className={cn("hover:bg-muted text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors duration-[120ms]", PRESS)} key={t} onClick={() => setText(t)} type="button">
              <Icon className="size-3.5" />
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Строка агента как строка чата ────────────────────────────────────────────────────────────────────────────────────

/** Как в мессенджере: сегодня — время, вчера — «вчера», раньше — день недели. */
const shortWhen = (at: string) => {
  const d = dayOf(at);
  if (d === "Сегодня") return timeOf(at);
  return d === "Вчера" ? "вчера" : d.split(",")[0];
};

const UNREAD: Record<string, number> = { brief: 1, invoices: 1, prices: 1, stock: 1 };

/** Как чат в мессенджере: имя, время последнего, последняя строка; у идущего — полоска шага, у ждущего — что ждёт. */
export const ChatRow = ({ agent, onOpen, active }: { agent: Agent; onOpen: () => void; active?: boolean }) => {
  const last = agent.runs.find((r) => !r.live && r.outcome !== "nothing") ?? agent.runs[0];
  const unread = UNREAD[agent.id];
  const line = agent.state === "running" || agent.state === "waiting" || agent.state === "failed" ? statusLine(agent) : last?.summary;
  const tone = agent.state === "waiting" ? "text-warning" : agent.state === "failed" ? "text-destructive" : agent.state === "running" ? "text-info" : "text-muted-foreground";
  return (
    <li>
      <button className={cn("hover:bg-muted/50 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-[120ms]", active && "bg-muted")} onClick={onOpen} type="button">
        <Tile agent={agent} size={40} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline gap-2">
            <span className={cn("min-w-0 flex-1 truncate", unread ? "font-semibold" : "font-medium")}>{agent.name}</span>
            <span className="text-muted-foreground shrink-0 font-mono text-[11px]">{last ? shortWhen(last.at) : ""}</span>
          </span>
          <span className="flex items-center gap-2">
            <span className={cn("min-w-0 flex-1 truncate text-sm", tone, agent.state === "paused" && "opacity-70")}>{agent.state === "paused" ? `На паузе · ${last?.summary ?? ""}` : line}</span>
            {unread ? <span className="bg-primary text-primary-foreground shrink-0 rounded-full px-1.5 font-mono text-[11px]">{unread}</span> : null}
          </span>
          <ProgressLine agent={agent} className="mt-1" />
        </span>
      </button>
    </li>
  );
};
