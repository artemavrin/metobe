"use client";

import { Button } from "@metobe/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@metobe/ui/components/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@metobe/ui/components/popover";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowUp, Check, ChevronRight, CircleAlert, CircleX, FlaskConical, History, MoreHorizontal, Play, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { Streamdown } from "streamdown";

import type { Agent, Run } from "./data";
import { dayOf, EnabledSwitch, fmtDur, money, statusLine, timeOf, untilOf, usePhone, whenOf } from "./parts";
import { Steps } from "./run";
import { useProto } from "./state";
import { CONNECTIONS, SENTENCE, TALK, WHEN } from "./v2-data";
import type { Token } from "./v2-data";

// Общие части раунда 2. Главное — фраза агента: настройки читаются как одно предложение, а выделенные куски
// (когда, чем, куда) меняются нажатием тут же, без отдельной формы. Задание целиком меняют словами — в беседе.
// Движение (Эмиль): нажатие — scale 0.97, поповеры растут от своего куска (origin), раскрытие — по строкам сетки,
// 200 мс, сильный ease-out; ничего не анимируется с клавиатуры.

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";
export const PRESS = "transition-transform duration-150 active:scale-[0.97]";

// ── Фраза ────────────────────────────────────────────────────────────────────────────────────────────────────────────

const TOKEN = cn(
  "decoration-foreground/30 hover:bg-muted data-popup-open:bg-muted -mx-[0.15em] rounded-[0.3em] px-[0.15em] font-medium underline decoration-dashed decoration-1 underline-offset-[0.28em] transition-colors duration-150 hover:decoration-foreground/60",
  "focus-visible:ring-ring/50 outline-none focus-visible:ring-2"
);

const Row = ({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick: () => void }) => (
  <button className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors" onClick={onClick} type="button">
    <span className="flex-1">{children}</span>
    {active && <Check className="size-4" />}
  </button>
);

const NEXT: Record<string, string> = {
  "Каждый день в 8:00": "завтра в 8:00",
  "Каждый час с 9 до 18 по будням": "через 18 мин",
  "По будням в 9:00": "в пн в 9:00",
  "По понедельникам в 10:00": "в пн в 10:00",
  "По пятницам в 17:00": "в пт в 17:00",
};

/** Когда: готовые расписания и «своими словами». Даты ближайших запусков считает сервер, а не модель. */
const WhenPop = ({ value, onPick }: { value: string; onPick: (v: string) => void }) => {
  const [own, setOwn] = useState("");
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground px-2 pt-1 text-xs">Когда запускать</span>
      {WHEN.map((w) => (
        <Row active={w === value} key={w} onClick={() => onPick(w)}>
          {w}
        </Row>
      ))}
      <form
        className="mt-1 flex flex-col gap-1 border-t px-2 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (own.trim()) onPick(own.trim());
        }}
      >
        <input className="placeholder:text-muted-foreground bg-transparent py-1 text-sm outline-none" onChange={(e) => setOwn(e.target.value)} placeholder="Или словами: «каждые 2 часа по будням»" value={own} />
        {own.trim() && <span className="text-muted-foreground text-xs">↵ — сохранить; ближайшие запуски посчитаются сразу</span>}
      </form>
    </div>
  );
};

type Access = "read" | "write" | "ask";
const ACCESS: [Access, string, string][] = [
  ["read", "Только смотреть", "ничего не меняет"],
  ["ask", "Менять с вашего «да»", "спросит во входящих"],
  ["write", "Менять самому", "как вы"],
];

/** Чем: подключение, его состояние и что агенту с ним можно. */
const ToolPop = ({ id, onDone }: { id: string; onDone: (text: string) => void }) => {
  const conn = CONNECTIONS.find((c) => c.id === id) ?? CONNECTIONS[0];
  const [access, setAccess] = useState<Access>(id === "mail" ? "ask" : "read");
  const stale = conn?.note === "вход устарел";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 px-2 pt-1">
        <span className="text-sm font-medium">{conn?.name}</span>
        <span className={cn("text-xs", stale ? "text-warning" : "text-muted-foreground")}>{conn?.note}</span>
      </div>
      {stale && (
        <Button className={cn("mx-2 my-1", PRESS)} onClick={() => onDone("Откроется вход в «Битрикс24» — своей учётной записью")} size="sm">
          Войти заново
        </Button>
      )}
      <span className="text-muted-foreground px-2 pt-1 text-xs">Агенту можно</span>
      {ACCESS.map(([a, label, hint]) => (
        <Row
          active={a === access}
          key={a}
          onClick={() => {
            setAccess(a);
            onDone(`${conn?.name}: ${label.toLowerCase()}`);
          }}
        >
          {label} <span className="text-muted-foreground text-xs">· {hint}</span>
        </Row>
      ))}
    </div>
  );
};

const CHANNELS: [string, string][] = [
  ["inbox", "во входящие"],
  ["push", "push"],
  ["mail", "на почту"],
];

/** Куда: каналы (входящие — всегда) и «только если есть новое». */
const DeliverPop = ({ onPick }: { onPick: (label: string) => void }) => {
  const [on, setOn] = useState<string[]>(["inbox", "push"]);
  const [onlyNew, setOnlyNew] = useState(true);
  const label = (list: string[], only: boolean) => {
    const words = CHANNELS.filter(([id]) => list.includes(id)).map(([, w]) => w);
    const joined = words.length > 1 ? `${words.slice(0, -1).join(", ")} и ${words.at(-1)}` : (words[0] ?? "");
    return only ? `${joined}, если есть новое` : joined;
  };
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground px-2 pt-1 text-xs">Куда присылать</span>
      {CHANNELS.map(([id, w]) => (
        <Row
          active={on.includes(id)}
          key={id}
          onClick={() => {
            if (id === "inbox") return;
            const next = on.includes(id) ? on.filter((x) => x !== id) : [...on, id];
            setOn(next);
            onPick(label(next, onlyNew));
          }}
        >
          {w === "push" ? "Push на телефон и в браузер" : w === "на почту" ? "На почту" : "Во входящие"}
          {id === "inbox" && <span className="text-muted-foreground text-xs"> · всегда</span>}
        </Row>
      ))}
      <div className="mt-1 border-t pt-1">
        <Row
          active={onlyNew}
          onClick={() => {
            setOnlyNew(!onlyNew);
            onPick(label(on, !onlyNew));
          }}
        >
          Только если есть что-то новое
        </Row>
      </div>
    </div>
  );
};

/** Кусок фразы, который меняется нажатием. */
const TokenPop = ({ token, onChange }: { token: Token; onChange: (label: string, note: string) => void }) => {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(token.label);
  const done = (next: string, note: string) => {
    setLabel(next);
    setOpen(false);
    onChange(next, note);
  };
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger className={TOKEN}>{label}</PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1">
        {token.kind === "when" && <WhenPop onPick={(v) => done(v, `Сохранено — следующий запуск ${NEXT[v] ?? "посчитан"}`)} value={label} />}
        {token.kind === "tool" && (
          <ToolPop
            id={token.id}
            onDone={(text) => {
              setOpen(false);
              onChange(label, text);
            }}
          />
        )}
        {token.kind === "deliver" && <DeliverPop onPick={(v) => done(v, "Сохранено — так придёт следующий итог")} />}
      </PopoverContent>
    </Popover>
  );
};

/** Агент одной фразой. `size` — крупно на странице агента, мельче в списке. */
export const Sentence = ({ agent, className }: { agent: Agent; className?: string }) => {
  const { say } = useProto();
  const parts = SENTENCE[agent.id] ?? [agent.about];
  return (
    <p className={cn("text-pretty", className)}>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          // biome-ignore lint: static parts
          <span key={i}>{p}</span>
        ) : (
          // biome-ignore lint: static parts
          <TokenPop key={i} onChange={(_, note) => say(note)} token={p} />
        )
      )}
    </p>
  );
};

/** Фраза без кнопок — для строки списка. */
export const plainSentence = (agent: Agent) => (SENTENCE[agent.id] ?? [agent.about]).map((p) => (typeof p === "string" ? p : p.label)).join("");

/** «По будням в 9:00» — когда, из фразы. */
export const whenOf2 = (agent: Agent) => {
  const t = (SENTENCE[agent.id] ?? []).find((p) => typeof p !== "string" && p.kind === "when");
  return typeof t === "object" ? t.label : agent.schedule;
};

// ── Шапка агента ─────────────────────────────────────────────────────────────────────────────────────────────────────

export const AgentMenu = ({ agent }: { agent: Agent }) => {
  const { say } = useProto();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button aria-label="Ещё" className={PRESS} size="icon-sm" variant="ghost" />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => say("Тестовый прогон: итог придёт только сюда, без push и писем")}>
          <FlaskConical />
          Тестовый прогон
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => say(`Версии: 3 изменения, последнее — 27 окт. Любую можно вернуть`)}>
          <History />
          История изменений
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => say(`«${agent.name}» удалён — его итоги остались во входящих`)} variant="destructive">
          <Trash2 />
          Удалить агента
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/** Что дальше: следующий запуск, а если агент стоит или ждёт — почему. */
export const NextLine = ({ agent, className }: { agent: Agent; className?: string }) => {
  if (agent.state === "running") return <span className={cn("text-info", className)}>{statusLine(agent)}</span>;
  if (agent.state === "failed" || agent.state === "paused") return <span className={cn(agent.state === "failed" ? "text-destructive" : "text-muted-foreground", className)}>{agent.reason?.text}</span>;
  if (agent.state === "waiting") return <span className={cn("text-warning", className)}>{agent.reason?.text}</span>;
  return <span className={cn("text-muted-foreground", className)}>Следующий запуск {agent.next ? untilOf(agent.next) : ""}</span>;
};

/** Имя, включён ли, «Запустить», меню; ниже — фраза. */
export const AgentHeader = ({ agent, big = false }: { agent: Agent; big?: boolean }) => {
  const { say } = useProto();
  const phone = usePhone();
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h1 className={cn("min-w-0 flex-1 truncate font-semibold tracking-tight", big ? "text-2xl" : "text-lg")}>{agent.name}</h1>
        <EnabledSwitch agent={agent} />
        {agent.state !== "running" && (
          <Button className={PRESS} onClick={() => say(`«${agent.name}» запущен — итог придёт сюда`)} size="sm" variant="outline">
            <Play />
            {phone ? "" : "Запустить"}
          </Button>
        )}
        <AgentMenu agent={agent} />
      </div>
      <Sentence agent={agent} className={big ? "text-lg leading-relaxed" : "text-[15px] leading-relaxed"} />
      <NextLine agent={agent} className="text-sm" />
    </header>
  );
};

// ── Беседа: запуски, реплики, изменения ──────────────────────────────────────────────────────────────────────────────

export type Said = { at: string; said: string; before?: string; now: string; draft?: boolean };

export type Entry =
  | { type: "day"; label: string }
  | { type: "run"; run: Run }
  | { type: "quiet"; runs: Run[] }
  | { type: "said"; said: Said };

/** Запуски от старых к новым, «ничего нового» подряд — одной строкой, сказанное — после своего запуска, дни — разделителями. */
export const entriesOf = (agent: Agent, extra: Said[] = []): Entry[] => {
  const out: Entry[] = [];
  let day = "";
  const talk = TALK[agent.id] ?? [];
  for (const run of [...agent.runs].reverse()) {
    const d = dayOf(run.at);
    if (d !== day) {
      out.push({ label: d, type: "day" });
      day = d;
    }
    const last = out.at(-1);
    if (run.outcome === "nothing") {
      if (last?.type === "quiet") last.runs.push(run);
      else out.push({ runs: [run], type: "quiet" });
    } else out.push({ run, type: "run" });
    for (const t of talk.filter((x) => x.after === run.id)) out.push({ said: { at: t.at, before: t.before, now: t.now, said: t.said }, type: "said" });
  }
  for (const s of extra) out.push({ said: s, type: "said" });
  return out;
};

export const DayLine = ({ label }: { label: string }) => (
  <div className="text-muted-foreground flex items-center gap-3 py-1 text-xs">
    <span className="bg-border h-px flex-1" />
    {label}
    <span className="bg-border h-px flex-1" />
  </div>
);

export const QuietLine = ({ runs }: { runs: Run[] }) => (
  <p className="text-muted-foreground text-center text-xs">
    {runs.length === 1 ? `${timeOf((runs[0] as Run).at)} — ничего нового` : `${timeOf((runs[0] as Run).at)}–${timeOf((runs.at(-1) as Run).at)} — ${runs.length} запуска, ничего нового`}
  </p>
);

const Expand = ({ open, children }: { open: boolean; children: React.ReactNode }) => (
  <div className={cn("grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none", EASE, open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")} inert={!open}>
    <div className="min-h-0 overflow-hidden">{children}</div>
  </div>
);

export const ReportText = ({ run, clamp = false }: { run: Run; clamp?: boolean }) => (
  <div className={cn("text-[15px] leading-relaxed [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5", clamp && "line-clamp-4")}>
    <Streamdown>{run.report ?? run.summary}</Streamdown>
  </div>
);

/** Итог запуска как сообщение агента: когда, сам итог, как работал (свёрнуто), 👍/👎. */
export const RunMessage = ({ run }: { run: Run }) => {
  const { say } = useProto();
  const [steps, setSteps] = useState(false);
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const failed = run.outcome === "failed";
  return (
    <article className="group flex flex-col gap-1.5">
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
        {failed && <CircleX className="text-destructive size-3.5" />}
        {run.outcome === "attention" && <CircleAlert className="text-warning size-3.5" />}
        <span className="tabular-nums">{timeOf(run.at)}</span>
        {run.trigger !== "schedule" && <span>· {run.trigger === "test" ? "тестовый прогон" : "запущен вручную"}</span>}
      </span>
      {failed ? <p className="text-[15px]">Не получилось: {run.summary}.</p> : <ReportText run={run} />}
      <div className="text-muted-foreground -ml-1.5 flex items-center gap-0.5 text-xs">
        <button className="hover:bg-muted hover:text-foreground flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors" onClick={() => setSteps(!steps)} type="button">
          <ChevronRight className={cn("size-3.5 transition-transform duration-200", EASE, steps && "rotate-90")} />
          Как работал · {fmtDur(run.ms)} · {money(run.cost, run.currency)}
        </button>
        <span className="flex-1" />
        {!failed && (
          <span className={cn("flex gap-0.5 transition-opacity", vote ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100")}>
            <button aria-label="Хорошо" className={cn("hover:bg-muted rounded-md p-1", vote === "up" && "text-foreground")} onClick={() => setVote("up")} type="button">
              <ThumbsUp className="size-3.5" />
            </button>
            <button
              aria-label="Плохо"
              className={cn("hover:bg-muted rounded-md p-1", vote === "down" && "text-foreground")}
              onClick={() => {
                setVote("down");
                say("Напишите ниже, что не так, — агент предложит, что поменять в задании");
              }}
              type="button"
            >
              <ThumbsDown className="size-3.5" />
            </button>
          </span>
        )}
        {failed && (
          <Button className={PRESS} onClick={() => say("Запуск повторён — итог придёт сюда")} size="xs" variant="outline">
            Повторить
          </Button>
        )}
      </div>
      <Expand open={steps}>
        <div className="pt-1">
          <Steps retry run={run} />
        </div>
      </Expand>
    </article>
  );
};

/** Реплика человека справа и то, что агент из неё запомнил: «было → стало». Черновик ждёт «Запомнить». */
export const SaidBlock = ({ said, onApply }: { said: Said; onApply?: () => void }) => {
  const { say } = useProto();
  const [state, setState] = useState<"draft" | "applied" | "once">(said.draft ? "draft" : "applied");
  return (
    <div className="flex flex-col gap-2">
      <div className="bg-muted ml-auto max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px]">{said.said}</div>
      <div className={cn("flex max-w-md flex-col gap-2 rounded-xl border p-3 text-sm", state === "draft" && "border-foreground/20 shadow-sm")}>
        <span className="text-muted-foreground text-xs">{state === "draft" ? "Запомнить для следующих запусков?" : state === "once" ? "Только для следующего запуска" : `Запомнил · ${whenOf(said.at)}`}</span>
        {said.before && <span className="text-muted-foreground line-through decoration-1">{said.before}</span>}
        <span>{said.now}</span>
        {state === "draft" && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              className={PRESS}
              onClick={() => {
                setState("applied");
                onApply?.();
                say("Запомнил — действует со следующего запуска. Вернуть можно в «Истории изменений»");
              }}
              size="sm"
            >
              Запомнить
            </Button>
            <Button className={PRESS} onClick={() => setState("once")} size="sm" variant="ghost">
              Только в этот раз
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

/** Что агенту нужно от вас сейчас — внизу беседы, над полем ввода. */
export const NeedsYou = ({ agent }: { agent: Agent }) => {
  const { say } = useProto();
  const [answer, setAnswer] = useState<string | null>(null);
  const live = agent.runs.find((r) => r.live);
  const letter = live?.steps?.find((s) => s.mail)?.mail;
  if (answer) {
    return (
      <p className="text-success flex items-center gap-1.5 text-sm">
        <Check className="size-4" />
        {answer}
      </p>
    );
  }
  if (agent.state === "running" && agent.progress) {
    return (
      <p className="flex items-center gap-2 text-sm">
        <span className="bg-info size-2 animate-pulse rounded-full motion-reduce:animate-none" />
        <span className="shimmer">Работает · {statusLine(agent)}</span>
      </p>
    );
  }
  if (letter) {
    return (
      <div className="border-warning/40 bg-warning/5 flex flex-col gap-2 rounded-xl border p-3 text-sm">
        <span className="font-medium">Отправить это письмо с вашей почты?</span>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          <dt className="text-muted-foreground">Кому</dt>
          <dd className="font-mono">{letter.to}</dd>
          <dt className="text-muted-foreground">Тема</dt>
          <dd>{letter.subject}</dd>
        </dl>
        <p className="text-muted-foreground border-t pt-2 text-xs leading-relaxed whitespace-pre-line">{letter.body}</p>
        <div className="flex justify-end gap-2">
          <Button className={PRESS} onClick={() => setAnswer("Не отправлено — агент закончил без письма")} size="sm" variant="ghost">
            Не отправлять
          </Button>
          <Button className={PRESS} onClick={() => setAnswer("Отправлено — агент продолжает")} size="sm">
            Отправить
          </Button>
        </div>
      </div>
    );
  }
  if (agent.id === "sales") {
    return (
      <div className="border-warning/40 bg-warning/5 flex items-center gap-3 rounded-xl border p-3 text-sm">
        <span className="flex-1">Не могу зайти в Битрикс24 — вход устарел. Войдите, и я соберу отчёт сразу.</span>
        <Button className={PRESS} onClick={() => setAnswer("Вошли — собираю отчёт, итог придёт сюда")} size="sm">
          Войти
        </Button>
      </div>
    );
  }
  if (agent.state === "failed") {
    return (
      <div className="border-destructive/30 bg-destructive/5 flex flex-col gap-2 rounded-xl border p-3 text-sm">
        <span>Я остановился после 5 сбоев подряд: mebelgrad.ru перестал пускать автоматические запросы.</span>
        <div className="flex flex-wrap gap-2">
          <Button className={PRESS} onClick={() => setAnswer("Убрал mebelgrad.ru — дальше смотрю двух конкурентов. Включён")} size="sm">
            Убрать этот сайт и продолжить
          </Button>
          <Button className={PRESS} onClick={() => say("Агент остаётся выключенным")} size="sm" variant="ghost">
            Оставить выключенным
          </Button>
        </div>
      </div>
    );
  }
  return null;
};

/** Поле внизу: сказать агенту — вопрос по итогу или как работать дальше. */
export const Composer = ({ onSend, placeholder }: { onSend: (text: string) => void; placeholder: string }) => {
  const [text, setText] = useState("");
  return (
    <form
      className="bg-background flex items-end gap-2 rounded-2xl border p-2 pl-3.5 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onSend(text.trim());
        setText("");
      }}
    >
      <input className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent py-1.5 text-[15px] outline-none" onChange={(e) => setText(e.target.value)} placeholder={placeholder} value={text} />
      <Button aria-label="Отправить" className={PRESS} disabled={!text.trim()} size="icon-sm" type="submit">
        <ArrowUp />
      </Button>
    </form>
  );
};

/** Сказанное в этой вкладке: агент сразу предлагает, что запомнить. */
export const useSaid = () => {
  const [said, setSaid] = useState<Said[]>([]);
  const send = (text: string) => setSaid((s) => [...s, { at: "2026-10-30T10:43", draft: true, now: `+ ${text.replace(/^./u, (c) => c.toUpperCase())}`, said: text }]);
  return { said, send };
};

/** Новый агент: одной фразой — модель предложит черновик в чате. */
export const NewAgent = ({ compact = false }: { compact?: boolean }) => {
  const { say } = useProto();
  return (
    <div className="flex flex-col gap-2">
      <Composer onSend={(t) => say(`Откроется чат: «${t}» — модель предложит черновик агента одной фразой`)} placeholder={compact ? "Поручить новое…" : "Что поручить? Например: каждое утро присылай, что важного в почте"} />
    </div>
  );
};
