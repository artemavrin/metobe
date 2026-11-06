"use client";

import { Button } from "@metobe/ui/components/button";
import { Skeleton } from "@metobe/ui/components/skeleton";
import { Spinner } from "@metobe/ui/components/spinner";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import { Check, ChevronDown, LogIn, Minus, PencilLine, Play, RotateCw, TriangleAlert } from "lucide-react";
import { Fragment, createContext, use, useEffect, useRef, useState } from "react";

import { AssistantMessage } from "@/components/chat/messages";

import { MODEL } from "../first-agent/data";
import { ENTER, PRESS, Shell, usePhone } from "../first-agent/frame";
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

/** Как загрузилась страница задачи: готова, ещё грузится или не загрузилась. */
export type Load = "ready" | "loading" | "error";

/** «Прогнать сейчас» из шапки: идёт, кончился или нет — показывает блок итога, над итогом. */
export const RunNow = createContext<{ run: "idle" | "running" | "done"; quiet: string }>({ quiet: "", run: "idle" });

export const Open = createContext<{ task: Task; open: (id: string) => void; seen: Set<string>; load: Load; setLoad: (l: Load) => void; fixed: Set<string>; fix: (id: string) => void }>(null as never);

export const TaskProvider = ({ children }: { children: React.ReactNode }) => {
  const [id, setId] = useState(TASKS[0]?.id ?? "");
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [load, setLoadState] = useState<Load>("ready");
  const [fixed, setFixed] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const q = p.get("task"), l = p.get("load");
    if (q && TASKS.some((t) => t.id === q)) setId(q);
    if (l === "loading" || l === "error") setLoadState(l);
  }, []);
  const setLoad = (l: Load) => {
    setLoadState(l);
    const url = new URL(window.location.href);
    url.searchParams.set("load", l);
    window.history.replaceState(null, "", url);
  };
  const open = (next: string) => {
    setId(next);
    setSeen((s) => new Set(s).add(next));
    const url = new URL(window.location.href);
    url.searchParams.set("task", next);
    window.history.replaceState(null, "", url);
  };
  const task = TASKS.find((t) => t.id === id) ?? (TASKS[0] as Task);
  return <Open value={{ fix: (x) => setFixed((s) => new Set(s).add(x)), fixed, load, open, seen, setLoad, task }}>{children}</Open>;
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
  const { task, open, load, setLoad } = use(Open);
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
      <div className="flex items-center justify-between gap-4">
        <span>страница</span>
        <div className="flex gap-1">
          {([["ready", "загружена"], ["loading", "грузится"], ["error", "ошибка"]] as const).map(([l, label]) => (
            <Chip active={load === l} key={l} onClick={() => setLoad(l)}>{label}</Chip>
          ))}
        </div>
      </div>
    </>
  );
};

// ── Общее ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Исправление сбоя: кнопка → «Проверяю доступ…» / «Запуск начат…» → итог. Дважды не нажимается, итог остаётся на месте. */
export const Fix = ({ label, onDone }: { label: string; onDone?: () => void }) => {
  const phone = usePhone();
  const login = label.startsWith("Войти");
  const [stage, setStage] = useState<"idle" | "checking" | "running" | "done">("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const start = () => {
    setStage(login ? "checking" : "running");
    timers.current = [
      setTimeout(() => setStage("running"), 1200),
      setTimeout(() => {
        setStage("done");
        onDone?.();
      }, 3000),
    ];
  };
  if (stage === "done" && onDone) return null;
  if (stage === "done")
    return (
      <span className={cn("flex items-center gap-2 text-sm", ENTER)}>
        <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        {login ? "Доступ восстановлен, запуск прошёл" : "Запуск прошёл"}
      </span>
    );
  if (stage !== "idle")
    return (
      <span aria-live="polite" className="text-muted-foreground flex items-center gap-2 text-sm">
        <Spinner className="size-3.5" />
        {stage === "checking" ? "Проверяю доступ…" : login ? "Доступ есть, идёт запуск…" : "Идёт запуск…"}
      </span>
    );
  return (
    <Button className={PRESS} onClick={start} size={phone ? "default" : "sm"} variant="outline">
      {login ? <LogIn /> : <Play />}
      {label}
    </Button>
  );
};

export const Mark = ({ outcome, color }: { outcome: Outcome; color: string }) =>
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

/** `onSend` — что делает поле «Что поменять в задаче…» (без него — подсказка про D28); `draft` — что уже написано в
 *  поле; `schedule` и `next` — расписание и следующий запуск в шапке, если их поменяли; `busy` — модель отвечает, поле ждёт; `setup` — строка «Создана … — «просьба»» внизу (у страницы с
 *  карточкой задачи её нет: карточка говорит то же). */
export const TaskPage = ({ children, onSend, draft = "", schedule, next, busy = false, setup = true }: { children: React.ReactNode; onSend?: (text: string) => void; draft?: string; schedule?: string; next?: string; busy?: boolean; setup?: boolean }) => {
  const { say } = useProto();
  const { task, open, seen, load, setLoad, fixed } = use(Open);
  const phone = usePhone();
  const [text, setText] = useState(draft);
  // Выключатель и «Прогнать сейчас» видны в самой странице, а не только тостом: выключена — строкой под шапкой с
  // «Включить»; запуск — строкой над итогом: идёт → чем кончился.
  const [on, setOn] = useState(true);
  const [run, setRun] = useState<"idle" | "running" | "done">("idle");
  const runTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    setOn(true);
    setRun("idle");
    clearTimeout(runTimer.current);
  }, [task.id]);
  useEffect(() => () => clearTimeout(runTimer.current), []);
  const runNow = () => {
    if (run === "running") return;
    setRun("running");
    clearTimeout(runTimer.current);
    runTimer.current = setTimeout(() => setRun("done"), 2600);
  };
  const quiet = task.runs.find((r) => r.outcome === "quiet")?.summary ?? "нового нет";
  useEffect(() => {
    setText(draft);
  }, [draft]);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Свежий запуск — наверху: открыть задачу значит оказаться в начале ленты, под шапкой, а не за ней.
    top.current?.closest(".overflow-y-auto")?.scrollTo({ top: 0 });
  }, [task.id]);
  // В боковой панели — только задачи, которые ждут человека (новый итог, вопрос, решение — здесь сбой, который
  // исправляет человек), с точкой; и открытая сейчас, чтобы было видно, где ты.
  const waiting = (t: Task) => (Boolean(t.unread) && t.id !== task.id && !seen.has(t.id)) || (t.runs[0]?.outcome === "failed" && !fixed.has(t.id));
  const side = TASKS.filter((t) => t.id === task.id || waiting(t)).map((t) => ({ active: t.id === task.id, color: t.color, name: t.name, onSelect: () => open(t.id), unread: waiting(t) }));
  return (
    <Shell area="agents" tasks={side} title={task.name}>
      <header className="bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b px-4 text-sm backdrop-blur @max-md:hidden">
        <span className="size-2 shrink-0 rounded-full" style={{ background: task.color }} />
        <span className="truncate font-medium">{task.name}</span>
        <span className="text-muted-foreground truncate">
          · {(schedule ?? task.schedule).toLowerCase()} · {on ? `следующий ${next ?? task.next}` : "выключена"}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <Button className={PRESS} disabled={run === "running"} onClick={runNow} size="sm" variant="ghost">
            <Play />
            Прогнать сейчас
          </Button>
          <Switch aria-label="Задача включена" checked={on} onCheckedChange={setOn} />
        </span>
      </header>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 pt-6 pb-6" key={task.id} ref={top}>
        {/* На телефоне шапки нет: расписание, запуск и выключатель — здесь. */}
        <div className="hidden items-center gap-2 text-sm @max-md:flex">
          <span className="text-muted-foreground min-w-0 flex-1 truncate">
            {(schedule ?? task.schedule)} · {on ? `след. ${next ?? task.next}` : "выключена"}
          </span>
          <Button aria-label="Прогнать сейчас" className={PRESS} disabled={run === "running"} onClick={runNow} size="icon" variant="outline">
            <Play />
          </Button>
          <Switch aria-label="Задача включена" checked={on} onCheckedChange={setOn} />
        </div>
        {!on && (
          <div className={cn("bg-muted/50 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-3 py-2 text-sm", ENTER)} role="status">
            <span className="min-w-0 flex-1">Задача выключена: запусков по расписанию не будет.</span>
            <Button className={PRESS} onClick={() => setOn(true)} size={phone ? "default" : "sm"} variant="outline">
              Включить
            </Button>
          </div>
        )}
        {load === "loading" && (
          <div aria-busy="true" aria-label="Задача загружается" className="flex flex-col gap-4">
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        )}
        {load === "error" && (
          <div className="bg-card flex flex-col items-start gap-3 rounded-xl border p-4" role="alert">
            <span className="flex items-center gap-2 font-medium">
              <TriangleAlert className="size-4 text-amber-600 dark:text-amber-400" />
              Не удалось загрузить задачу
            </span>
            <p className="text-muted-foreground text-sm">Сервер не ответил за 10 с. Задача при этом запускается по расписанию как обычно.</p>
            <Button
              className={PRESS}
              onClick={() => {
                setLoad("loading");
                setTimeout(() => setLoad("ready"), 900);
              }}
              size={phone ? "default" : "sm"}
              variant="outline"
            >
              <RotateCw />
              Повторить
            </Button>
          </div>
        )}
        {load === "ready" && (
          <>
            <RunNow value={{ quiet, run }}>{children}</RunNow>
            {setup && <Setup task={task} />}
          </>
        )}
      </div>
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 pt-2 pb-3 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl px-4">
          <SlotComposer
            busy={busy}
            onChange={setText}
            onSend={(t) => {
              setText("");
              if (onSend) onSend(t);
              else say("Модель покажет правку карточкой «было → стало» (D28)");
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
/** Сбой после итога — строкой с кнопкой исправления; исправленный становится строкой «исправлено» целиком. */
const Since = ({ run }: { run: Run }) => {
  const { task, fix } = use(Open);
  const [done, setDone] = useState(false);
  if (done)
    return (
      <div className={cn("flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm", ENTER)} role="status">
        <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span className="tabular-nums">{run.day}</span>
        <span className="font-medium">{run.fix?.startsWith("Войти") ? "Доступ восстановлен, повторный запуск прошёл" : "Повторный запуск прошёл"}</span>
      </div>
    );
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-2 rounded-lg px-3 py-2 text-sm", run.outcome === "failed" ? "bg-amber-500/10" : "bg-muted/50 text-muted-foreground")}>
      <Mark color="" outcome={run.outcome} />
      <span className="tabular-nums">{run.day}</span>
      <span className={cn("min-w-48 flex-1", run.outcome === "failed" && "font-medium")}>{run.summary}</span>
      {run.fix && (
        <Fix
          label={run.fix}
          onDone={() => {
            setDone(true);
            fix(task.id);
          }}
        />
      )}
    </div>
  );
};

/** Последний итог целиком, сбой или «нового нет» после него — строкой над ним, прошлые запуски — под спойлером. */
const RunStatus = () => {
  const { run, quiet } = use(RunNow);
  if (run === "idle") return null;
  return (
    <div aria-live="polite" className={cn("text-muted-foreground flex items-center gap-2 text-sm", ENTER)}>
      {run === "running" ? <Spinner className="size-3.5" /> : <Minus className="size-3.5" />}
      {run === "running" ? "Идёт запуск…" : `Запуск завершён: ${quiet.charAt(0).toLowerCase()}${quiet.slice(1)}`}
    </div>
  );
};

export const LatestBody = () => {
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
    <>
      <RunStatus />
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
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 self-start text-sm transition-colors duration-150 @max-md:min-h-11"
            onClick={() => setHistory((h) => !h)}
            type="button"
          >
            <ChevronDown className={cn("size-4 transition-transform duration-200", history && "rotate-180")} />
            Прошлые запуски · {past.length}
          </button>
          {history && (
            <div className={cn("bg-card overflow-hidden rounded-xl border", ENTER)}>
              {past.map((r) => {
                // Изменение задачи — строкой под первым запуском новой версии (список идёт от нового к старому): видно, с какого
                // запуска итоги идут по ней.
                const edit = task.edits?.find((x) => x.before === r.id);
                return (
                  <Fragment key={r.id}>
                    <LogRow color={task.color} onToggle={() => setOpen((o) => (o === r.id ? null : r.id))} open={open === r.id} run={r} />
                    {edit && (
                      <div className="text-muted-foreground flex items-center gap-3 border-b bg-muted/30 px-3 py-2 text-xs">
                        <PencilLine className="size-3.5 shrink-0" />
                        <span className="min-w-0 flex-1">
                          Изменена {edit.day}: {edit.summary}
                        </span>
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
};

export const Latest = () => (
  <TaskPage>
    <LatestBody />
  </TaskPage>
);
