"use client";

import { Button } from "@metobe/ui/components/button";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import { ChevronDown, LogIn, Minus, Play, TriangleAlert } from "lucide-react";
import { createContext, use, useEffect, useRef, useState } from "react";

import { AssistantMessage } from "@/components/chat/messages";

import { MODEL } from "../first-agent/data";
import { ENTER, PRESS, Shell } from "../first-agent/frame";
import { SlotComposer } from "../first-agent/round3";
import { useProto } from "../first-agent/state";
import { TASKS, asMessage } from "./data";
import type { Outcome, Run, Task } from "./data";

// Чат задачи после запусков. Свежий запуск сверху, история — ниже, листается; в самом низу — разговор, в котором задачу
// создали, свёрнутый в строку «Создана 3 ноя — «просьба»». Итог запуска — обычный ответ модели, как в чате (текст, таблица, список, виджет
// показателей); у него только своя строка: когда, чем кончился, сколько шёл. Задачи переключаются в боковой панели.
// «Лента» — каждый итог целиком, пустые запуски подряд — одной строкой. «Журнал» — запуски строками, раскрыт свежий.
// «Последний итог» — последний ответ, где есть что читать, целиком; сбой или «нового нет» после него — строкой над ним;
// прошлые запуски — под спойлером, строками журнала.

// ── Какая задача открыта ────────────────────────────────────────────────────────────────────────────────────────────

const Open = createContext<{ task: Task; open: (id: string) => void; seen: Set<string> }>(null as never);

export const TaskProvider = ({ children }: { children: React.ReactNode }) => {
  const [id, setId] = useState(TASKS[0]?.id ?? "");
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("task");
    if (q && TASKS.some((t) => t.id === q)) setId(q);
  }, []);
  const open = (next: string) => {
    setId(next);
    setSeen((s) => new Set(s).add(next));
    const url = new URL(window.location.href);
    url.searchParams.set("task", next);
    window.history.replaceState(null, "", url);
  };
  const task = TASKS.find((t) => t.id === id) ?? (TASKS[0] as Task);
  return <Open value={{ open, seen, task }}>{children}</Open>;
};

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

/** Экран и задача: на телефоне боковой панели нет, задачу выбирают здесь. */
export const Params = () => {
  const { screen, setScreen } = useProto();
  const { task, open } = use(Open);
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <span>экран</span>
        <div className="flex gap-1">
          <Chip active={screen === "desktop"} onClick={() => setScreen("desktop")}>компьютер</Chip>
          <Chip active={screen === "phone"} onClick={() => setScreen("phone")}>телефон</Chip>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span>задача</span>
        <div className="flex gap-1">
          {TASKS.map((t) => (
            <Chip active={task.id === t.id} key={t.id} onClick={() => open(t.id)}>{t.name.split(" ")[0]}</Chip>
          ))}
        </div>
      </div>
    </>
  );
};

// ── Общее ────────────────────────────────────────────────────────────────────────────────────────────────────────────

const Fix = ({ label }: { label: string }) => {
  const { say } = useProto();
  const login = label.startsWith("Войти");
  return (
    <Button className={PRESS} onClick={() => say(login ? "Откроется вход в почту, затем запуск повторится" : "Запуск начат")} size="sm" variant="outline">
      {login ? <LogIn /> : <Play />}
      {label}
    </Button>
  );
};

const Mark = ({ outcome, color }: { outcome: Outcome; color: string }) =>
  outcome === "failed" ? (
    <TriangleAlert className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
  ) : outcome === "quiet" ? (
    <Minus className="text-muted-foreground size-3.5 shrink-0" />
  ) : (
    <span className="flex size-3.5 shrink-0 items-center justify-center">
      <span className="size-2 rounded-full" style={{ background: color }} />
    </span>
  );

/** Разговор, в котором задачу создали: самое старое в этом чате, поэтому в самом низу и свёрнуто. */
const Setup = ({ task }: { task: Task }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3 border-t pt-5">
      {/* С какой просьбы задача началась: это и есть её начало, а разговор под ней — по нажатию. */}
      <button
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground flex max-w-full min-w-0 items-center gap-1.5 self-center text-xs transition-colors duration-150"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <span className="shrink-0">Создана {task.created} —</span>
        <span className="min-w-0 truncate">«{task.asked}»</span>
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && (
        <div className={cn("flex flex-col gap-3", ENTER)}>
          <div className="bg-muted ml-auto max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-6">{task.asked}</div>
          <p className="text-sm leading-6">
            Задача «{task.name}» создана: {task.schedule.toLowerCase()}. Итоги запусков приходят в этот чат.
          </p>
        </div>
      )}
    </div>
  );
};

const TaskPage = ({ children }: { children: React.ReactNode }) => {
  const { say } = useProto();
  const { task, open, seen } = use(Open);
  const [text, setText] = useState("");
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Свежий запуск — наверху: открыть задачу значит оказаться в начале ленты, под шапкой, а не за ней.
    top.current?.closest(".overflow-y-auto")?.scrollTo({ top: 0 });
  }, [task.id]);
  const side = TASKS.map((t) => ({ active: t.id === task.id, color: t.color, name: t.name, onSelect: () => open(t.id), unread: t.unread && t.id !== task.id && !seen.has(t.id) }));
  return (
    <Shell area="agents" tasks={side} title={task.name}>
      <header className="bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b px-4 text-sm backdrop-blur @max-md:hidden">
        <span className="size-2 shrink-0 rounded-full" style={{ background: task.color }} />
        <span className="truncate font-medium">{task.name}</span>
        <span className="text-muted-foreground truncate">
          · {task.schedule.toLowerCase()} · следующий {task.next}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <Button className={PRESS} onClick={() => say("Запуск начат")} size="sm" variant="ghost">
            <Play />
            Прогнать сейчас
          </Button>
          <Switch aria-label="Задача включена" defaultChecked />
        </span>
      </header>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 pt-6 pb-6" key={task.id} ref={top}>
        {children}
        <Setup task={task} />
      </div>
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 pt-2 pb-3 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl px-4">
          <SlotComposer
            busy={false}
            onChange={setText}
            onSend={() => {
              setText("");
              say("Модель покажет правку карточкой «было → стало» (D28)");
            }}
            placeholder="Что поменять в задаче…"
            value={text}
          />
        </div>
      </div>
    </Shell>
  );
};

// ── «Лента» ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Подряд идущие пустые запуски — одной группой. */
type Piece = { kind: "run"; run: Run } | { kind: "quiet"; runs: Run[] };
const pieces = (runs: Run[]): Piece[] =>
  runs.reduce<Piece[]>((out, r) => {
    const prev = out[out.length - 1];
    if (r.outcome !== "quiet") return [...out, { kind: "run", run: r }];
    if (prev?.kind === "quiet") return [...out.slice(0, -1), { kind: "quiet", runs: [...prev.runs, r] }];
    return [...out, { kind: "quiet", runs: [r] }];
  }, []);

/** «16 и 23 ноя»: группа идёт от нового к старому, а читается по порядку дней. */
const quietDays = (runs: Run[]) => {
  if (runs.length === 1) return runs[0]?.at ?? "";
  const asc = [...runs].reverse();
  return `${asc.slice(0, -1).map((r) => r.day.split(" ")[0]).join(", ")} и ${asc[asc.length - 1]?.day ?? ""}`;
};

export const Feed = () => {
  const { task } = use(Open);
  return (
    <TaskPage>
      {pieces(task.runs).map((p, i) =>
        p.kind === "quiet" ? (
          <p className="text-muted-foreground flex items-center gap-2 border-t pt-5 text-xs" key={p.runs[0]?.id}>
            <Minus className="size-3.5" />
            {quietDays(p.runs)} — нового нет
          </p>
        ) : (
          <section className={cn("flex flex-col gap-2", i > 0 && "border-t pt-5")} key={p.run.id}>
            <header className="text-muted-foreground flex items-center gap-2 text-xs">
              <Mark color={task.color} outcome={p.run.outcome} />
              <span className={cn(i === 0 && "text-foreground font-medium")}>{i === 0 ? `Последний запуск · ${p.run.at}` : p.run.at}</span>
              <span className="ml-auto tabular-nums">{p.run.took}</span>
            </header>
            <div className="[&_[data-slot=message-footer]]:hidden">
              <AssistantMessage label={MODEL} live={false} message={asMessage(p.run)} />
            </div>
            {p.run.fix && (
              <div>
                <Fix label={p.run.fix} />
              </div>
            )}
          </section>
        )
      )}
    </TaskPage>
  );
};

// ── «Журнал» ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const LogRow = ({ run, color, open, onToggle }: { run: Run; color: string; open: boolean; onToggle: () => void }) => {
  const quiet = run.outcome === "quiet";
  return (
    <div className={cn("border-b last:border-b-0", open && "bg-muted/20")}>
      <button
        aria-expanded={quiet ? undefined : open}
        className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm", quiet ? "cursor-default" : "hover:bg-muted/50 transition-colors duration-150")}
        disabled={quiet}
        onClick={onToggle}
        type="button"
      >
        <Mark color={color} outcome={run.outcome} />
        <span className="text-muted-foreground w-16 shrink-0 tabular-nums">{run.day}</span>
        <span className={cn("min-w-0 flex-1 truncate", quiet ? "text-muted-foreground" : "font-medium")}>{run.summary}</span>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums @max-md:hidden">{run.took}</span>
        {!quiet && <ChevronDown className={cn("text-muted-foreground size-4 shrink-0 transition-transform duration-200", open && "rotate-180")} />}
      </button>
      {open && run.parts && (
        <div className={cn("flex flex-col gap-3 px-3 pt-1 pb-4 pl-[2.75rem] @max-md:pl-3 [&_[data-slot=message-footer]]:hidden", ENTER)}>
          <AssistantMessage label={MODEL} live={false} message={asMessage(run)} />
          {run.fix && (
            <div>
              <Fix label={run.fix} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const Log = () => {
  const { task } = use(Open);
  // Раскрыт самый свежий запуск, в котором есть что прочитать.
  const latest = task.runs.find((r) => r.outcome !== "quiet")?.id ?? null;
  const [open, setOpen] = useState<string | null>(latest);
  useEffect(() => {
    setOpen(latest);
  }, [latest]);
  return (
    <TaskPage>
      <div className="bg-card overflow-hidden rounded-xl border">
        {task.runs.map((r) => (
          <LogRow color={task.color} key={r.id} onToggle={() => setOpen((o) => (o === r.id ? null : r.id))} open={open === r.id} run={r} />
        ))}
      </div>
    </TaskPage>
  );
};

// ── «Последний итог» ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Запуск после последнего итога, в котором нечего читать: сбой или «нового нет» — строкой над итогом. */
const Since = ({ run }: { run: Run }) => (
  <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-2 rounded-lg px-3 py-2 text-sm", run.outcome === "failed" ? "bg-amber-500/10" : "bg-muted/50 text-muted-foreground")}>
    <Mark color="" outcome={run.outcome} />
    <span className="tabular-nums">{run.day}</span>
    <span className={cn("min-w-48 flex-1", run.outcome === "failed" && "font-medium")}>{run.summary}</span>
    {run.fix && <Fix label={run.fix} />}
  </div>
);

export const Latest = () => {
  const { task } = use(Open);
  const at = task.runs.findIndex((r) => r.outcome === "news" || r.outcome === "baseline");
  const result = task.runs[at];
  const since = task.runs.slice(0, Math.max(at, 0));
  const past = task.runs.slice(at + 1);
  const [history, setHistory] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    setHistory(false);
    setOpen(null);
  }, [task.id]);
  return (
    <TaskPage>
      {since.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {since.map((r) => (
            <Since key={r.id} run={r} />
          ))}
        </div>
      )}
      {result && (
        <section className="flex flex-col gap-2">
          <header className="text-muted-foreground flex items-center gap-2 text-xs">
            <Mark color={task.color} outcome={result.outcome} />
            <span className="text-foreground font-medium">Последний итог · {result.at}</span>
            <span className="ml-auto tabular-nums">{result.took}</span>
          </header>
          <div className="[&_[data-slot=message-footer]]:hidden">
            <AssistantMessage label={MODEL} live={false} message={asMessage(result)} />
          </div>
        </section>
      )}
      {past.length > 0 && (
        <div className="flex flex-col gap-2 border-t pt-4">
          <button
            aria-expanded={history}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 self-start text-sm transition-colors duration-150"
            onClick={() => setHistory((h) => !h)}
            type="button"
          >
            <ChevronDown className={cn("size-4 transition-transform duration-200", history && "rotate-180")} />
            Прошлые запуски · {past.length}
          </button>
          {history && (
            <div className={cn("bg-card overflow-hidden rounded-xl border", ENTER)}>
              {past.map((r) => (
                <LogRow color={task.color} key={r.id} onToggle={() => setOpen((o) => (o === r.id ? null : r.id))} open={open === r.id} run={r} />
              ))}
            </div>
          )}
        </div>
      )}
    </TaskPage>
  );
};
