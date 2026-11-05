"use client";

import type { ChatMessage } from "@metobe/contracts/chat";
import { Button } from "@metobe/ui/components/button";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import { ChevronDown, Minus, Play, TriangleAlert } from "lucide-react";
import { createContext, use, useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";

import { AssistantMessage } from "@/components/chat/messages";

import { MODEL } from "../first-agent/data";
import { ENTER, PRESS, Shell } from "../first-agent/frame";
import { SlotComposer } from "../first-agent/round3";
import { useProto } from "../first-agent/state";
import { LAST, OTHER_TASKS, TASK, runsFor } from "./data";
import type { Outcome, Run } from "./data";

// Три способа показать запуск в чате задачи. Общее: шапка (название, расписание, следующий запуск, «Прогнать сейчас»,
// выключатель), разговор, в котором задачу настроили, — свёрнут в строку, внизу то же поле ввода: задачу меняют словами.
// «Сообщения» — запуск пишет обычным ответом под разделителем с датой, пустые запуски — одной строкой.
// «Журнал» — запуски строками с исходом; последний раскрыт, остальные раскрываются по нажатию.
// «Только новое» — в ленте только итоги, где есть что сказать; пустые запуски не пишут ничего, о них — строка над полем.

// ── Ручка: чем кончился последний запуск ────────────────────────────────────────────────────────────────────────────

const Last = createContext<{ last: Outcome; setLast: (o: Outcome) => void }>(null as never);

export const LastProvider = ({ children }: { children: React.ReactNode }) => {
  const [last, setLastState] = useState<Outcome>("changes");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("last");
    if (LAST.some((l) => l.id === q)) setLastState(q as Outcome);
  }, []);
  const setLast = (o: Outcome) => {
    setLastState(o);
    const url = new URL(window.location.href);
    url.searchParams.set("last", o);
    window.history.replaceState(null, "", url);
  };
  return <Last value={{ last, setLast }}>{children}</Last>;
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

export const Params = () => {
  const { screen, setScreen } = useProto();
  const { last, setLast } = use(Last);
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
        <span>последний запуск</span>
        <div className="flex gap-1">
          {LAST.map((l) => (
            <Chip active={last === l.id} key={l.id} onClick={() => setLast(l.id)}>{l.label}</Chip>
          ))}
        </div>
      </div>
    </>
  );
};

// ── Общее ────────────────────────────────────────────────────────────────────────────────────────────────────────────

const asMessage = (id: string, text: string): ChatMessage => ({ id, metadata: { createdAt: "2026-11-30T07:00:00Z", modelId: MODEL.id }, parts: [{ text, type: "text" }], role: "assistant" });

const MD = "text-sm leading-relaxed [&_p]:my-2 [&_table]:my-2 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0";

const RunNow = ({ variant = "ghost" }: { variant?: "ghost" | "outline" }) => {
  const { say } = useProto();
  return (
    <Button className={PRESS} onClick={() => say("Запуск начат — итог придёт сюда же")} size="sm" variant={variant}>
      <Play />
      Прогнать сейчас
    </Button>
  );
};

/** Разговор, в котором задачу настроили: он в этом же чате, но свёрнут — это уже прошлое. */
const Setup = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <button
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 self-center text-xs transition-colors duration-150"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        Задачу настроили здесь {TASK.created}
        <ChevronDown className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && (
        <div className={cn("flex flex-col gap-3", ENTER)}>
          <div className="bg-muted ml-auto max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-6">{TASK.asked}</div>
          <p className="text-sm leading-6">
            Задача «{TASK.name}» создана: {TASK.schedule.toLowerCase()}, {TASK.tools.join(" и ").toLowerCase()} — {TASK.sites}. Итоги — сюда.
          </p>
        </div>
      )}
    </div>
  );
};

const TaskChat = ({ next, children, foot }: { next: string; children: React.ReactNode; foot?: React.ReactNode }) => {
  const { say } = useProto();
  const { last } = use(Last);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [last]);
  return (
    <Shell area="agents" tasks={[{ active: true, color: TASK.color, name: TASK.name }, ...OTHER_TASKS]} title={TASK.name}>
      <header className="bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b px-4 text-sm backdrop-blur @max-md:hidden">
        <span className="size-2 shrink-0 rounded-full" style={{ background: TASK.color }} />
        <span className="truncate font-medium">{TASK.name}</span>
        <span className="text-muted-foreground truncate">
          · {TASK.schedule.toLowerCase()} · следующий {next}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <RunNow />
          <Switch aria-label="Задача включена" defaultChecked />
        </span>
      </header>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 pt-8 pb-6">
        <Setup />
        {children}
        <div ref={end} />
      </div>
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 pt-2 pb-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-4">
          {foot}
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

/** Подряд идущие пустые запуски — одной группой: «16 и 23 ноя — нового нет». */
type Piece = { kind: "run"; run: Run } | { kind: "quiet"; runs: Run[] };
const pieces = (runs: Run[]): Piece[] =>
  runs.reduce<Piece[]>((out, r) => {
    const prev = out[out.length - 1];
    if (r.outcome !== "quiet") return [...out, { kind: "run", run: r }];
    if (prev?.kind === "quiet") return [...out.slice(0, -1), { kind: "quiet", runs: [...prev.runs, r] }];
    return [...out, { kind: "quiet", runs: [r] }];
  }, []);

const days = (runs: Run[]) => (runs.length === 1 ? runs[0]?.at ?? "" : `${runs.slice(0, -1).map((r) => r.day.split(" ")[0]).join(", ")} и ${runs[runs.length - 1]?.day}`);

// ── «Сообщения» ──────────────────────────────────────────────────────────────────────────────────────────────────────

const Divider = ({ children, tone }: { children: React.ReactNode; tone?: "quiet" }) => (
  <div className={cn("text-muted-foreground flex items-center gap-3 text-xs", tone === "quiet" && "text-muted-foreground/70")}>
    <span className="bg-border h-px flex-1" />
    <span className="flex items-center gap-1.5">
      {tone === "quiet" ? <Minus className="size-3" /> : <span className="size-1.5 rounded-full" style={{ background: TASK.color }} />}
      {children}
    </span>
    <span className="bg-border h-px flex-1" />
  </div>
);

export const Messages = () => {
  const { last } = use(Last);
  const { runs, next } = runsFor(last);
  return (
    <TaskChat next={next}>
      {pieces(runs).map((p) =>
        p.kind === "quiet" ? (
          <Divider key={p.runs[0]?.id} tone="quiet">
            {days(p.runs)} — нового нет
          </Divider>
        ) : (
          <div className="flex flex-col gap-4" key={p.run.id}>
            <Divider>Запуск · {p.run.at}</Divider>
            <div className="[&_[data-slot=message-footer]]:hidden">
              <AssistantMessage label={MODEL} live={false} message={asMessage(p.run.id, p.run.text ?? "")} />
            </div>
            {p.run.outcome === "failed" && (
              <div className="-mt-2">
                <RunNow variant="outline" />
              </div>
            )}
          </div>
        )
      )}
    </TaskChat>
  );
};

// ── «Журнал» ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const Mark = ({ outcome }: { outcome: Outcome }) =>
  outcome === "failed" ? (
    <TriangleAlert className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
  ) : outcome === "quiet" ? (
    <Minus className="text-muted-foreground size-3.5 shrink-0" />
  ) : (
    <span className="flex size-3.5 shrink-0 items-center justify-center">
      <span className="size-2 rounded-full" style={{ background: TASK.color }} />
    </span>
  );

const LogRow = ({ run, open, onToggle }: { run: Run; open: boolean; onToggle: () => void }) => {
  const quiet = run.outcome === "quiet";
  return (
    <div className={cn("border-b last:border-b-0", open && "bg-muted/30")}>
      <button
        aria-expanded={quiet ? undefined : open}
        className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm", quiet ? "cursor-default" : "hover:bg-muted/50 transition-colors duration-150")}
        disabled={quiet}
        onClick={onToggle}
        type="button"
      >
        <Mark outcome={run.outcome} />
        <span className="text-muted-foreground w-24 shrink-0 tabular-nums @max-md:w-14">{run.day}</span>
        <span className={cn("min-w-0 flex-1 truncate", quiet ? "text-muted-foreground" : "font-medium")}>{run.summary}</span>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums @max-md:hidden">{run.took}</span>
        {!quiet && <ChevronDown className={cn("text-muted-foreground size-4 shrink-0 transition-transform duration-200", open && "rotate-180")} />}
      </button>
      {open && run.text && (
        <div className={cn("flex flex-col gap-3 px-3 pt-1 pb-4 pl-[3.25rem] @max-md:pl-3", ENTER)}>
          <div className={MD}>
            <Streamdown>{run.text}</Streamdown>
          </div>
          {run.outcome === "failed" && (
            <div>
              <RunNow variant="outline" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const Log = () => {
  const { last } = use(Last);
  const { runs, next } = runsFor(last);
  const [open, setOpen] = useState<string | null>(null);
  // Раскрыт последний запуск, в котором есть что прочитать.
  const latest = [...runs].reverse().find((r) => r.outcome !== "quiet")?.id ?? null;
  useEffect(() => {
    setOpen(latest);
  }, [latest]);
  return (
    <TaskChat next={next}>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground px-1 text-xs">Запуски</span>
        <div className="bg-card overflow-hidden rounded-xl border">
          {runs.map((r) => (
            <LogRow key={r.id} onToggle={() => setOpen((o) => (o === r.id ? null : r.id))} open={open === r.id} run={r} />
          ))}
        </div>
      </div>
    </TaskChat>
  );
};

// ── «Только новое» ───────────────────────────────────────────────────────────────────────────────────────────────────

const Report = ({ run }: { run: Run }) => (
  <article className={cn("bg-card flex flex-col gap-2 rounded-xl border p-4", run.outcome === "failed" && "border-amber-500/40")}>
    <header className="text-muted-foreground flex items-center gap-2 text-xs">
      <Mark outcome={run.outcome} />
      <span>Итог · {run.at}</span>
      <span className="ml-auto tabular-nums">{run.took}</span>
    </header>
    <h3 className="font-medium text-balance">{run.summary}</h3>
    {run.text && (
      <div className={cn(MD, "text-foreground/90")}>
        <Streamdown>{run.text}</Streamdown>
      </div>
    )}
    {run.outcome === "failed" && (
      <div className="pt-1">
        <RunNow variant="outline" />
      </div>
    )}
  </article>
);

export const OnlyNew = () => {
  const { last } = use(Last);
  const { runs, next } = runsFor(last);
  const said = runs.filter((r) => r.outcome !== "quiet");
  // Сколько пустых запусков было после последнего итога: о них не пишет никто, кроме этой строки.
  const after = runs.slice(runs.findIndex((r) => r.id === said[said.length - 1]?.id) + 1);
  const lastRun = runs[runs.length - 1];
  return (
    <TaskChat
      foot={
        <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-center text-xs">
          {after.length > 0 ? (
            <>
              <Minus className="size-3" />
              {after.length === 1 ? `Запуск ${lastRun?.at} — нового нет` : `После итога ещё ${after.length} запуска — нового нет`} · следующий {next}
            </>
          ) : (
            <>Следующий запуск — {next}</>
          )}
        </p>
      }
      next={next}
    >
      {said.map((r) => (
        <Report key={r.id} run={r} />
      ))}
    </TaskChat>
  );
};
