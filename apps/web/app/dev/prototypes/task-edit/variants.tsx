"use client";

import { Button } from "@metobe/ui/components/button";
import { Switch } from "@metobe/ui/components/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@metobe/ui/components/sheet";
import { cn } from "@metobe/ui/lib/utils";
import { ChevronDown, Play, Undo2 } from "lucide-react";
import { use, useEffect, useRef, useState } from "react";

import { ENTER, PRESS, Thinking, usePhone } from "../first-agent/frame";
import { useProto } from "../first-agent/state";
import { LatestBody, Open, TaskPage } from "../task-results/variants";
import { EDITS, FIELDS } from "./data";
import type { Change, Edit } from "./data";

// P15 · изменение задачи словами. Страница задачи — выбранный «Последний итог» (/task-results); в поле внизу уже
// написана просьба. Модель не меняет задачу сама: отвечает предложением «было → стало», применяет человек (D28).
// Варианты — где это предложение появляется:
// «Сверху» — над последним итогом, там, куда смотрят первым; применённое — строкой «Изменена … · Вернуть как было».
// «Панель» — сбоку (на телефоне снизу), страница под ней не меняется, пока не применили.
// «Карточка задачи» — у задачи наверху своя карточка (что делает, когда, откуда, итог), свёрнутая в строку; изменение
// раскрывает её и показывается в тех же строках. Выбрана (P15): строки «Создана … — «просьба»» внизу у неё нет.

type Stage = "idle" | "thinking" | "proposed" | "applied";

/** Ход изменения для открытой задачи; новая задача — с чистого листа. */
const useEdit = () => {
  const { task } = use(Open);
  const { say } = useProto();
  const edit = EDITS[task.id] as Edit;
  const [stage, setStage] = useState<Stage>("idle");
  const [asked, setAsked] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    setStage("idle");
    setAsked("");
    return () => clearTimeout(timer.current);
  }, [task.id]);
  return {
    apply: () => setStage("applied"),
    asked,
    cancel: () => setStage("idle"),
    edit,
    revert: () => {
      setStage("idle");
      say("Задача возвращена к прошлой версии");
    },
    send: (text: string) => {
      setAsked(text);
      setStage("thinking");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setStage("proposed"), 900);
    },
    stage,
    test: () => say("Тестовый запуск с изменениями: без уведомлений, итог появится сверху"),
  };
};

// ── Общее ────────────────────────────────────────────────────────────────────────────────────────────────────────────

const After = ({ change }: { change: Change }) => {
  if (!change.added) return <span className="rounded bg-emerald-500/15 px-1 font-medium">{change.after}</span>;
  const at = change.after.indexOf(change.added);
  return (
    <span className="font-medium">
      {change.after.slice(0, at)}
      <span className="rounded bg-emerald-500/15 px-0.5">{change.added}</span>
      {change.after.slice(at + change.added.length)}
    </span>
  );
};

/** Что меняется: по строке на поле, было зачёркнуто, стало — новое выделено. */
const Changes = ({ edit }: { edit: Edit }) => (
  <div className="flex flex-col divide-y">
    {edit.changes.map((c) => (
      <div className="grid grid-cols-[7rem_1fr] gap-3 py-2.5 text-sm @max-md:grid-cols-1 @max-md:gap-1" key={c.label}>
        <span className="text-muted-foreground">{c.label}</span>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground line-through decoration-1">{c.before}</span>
          <After change={c} />
        </div>
      </div>
    ))}
  </div>
);

const Actions = ({ onApply, onCancel, onTest }: { onApply: () => void; onCancel: () => void; onTest: () => void }) => (
  <div className="flex flex-wrap items-center gap-2">
    <Button className={PRESS} onClick={onApply} size="sm">
      Применить
    </Button>
    <Button className={PRESS} onClick={onTest} size="sm" variant="outline">
      <Play />
      Тестовый запуск
    </Button>
    <Button className={cn("ml-auto", PRESS)} onClick={onCancel} size="sm" variant="ghost">
      Отменить
    </Button>
  </div>
);

const Proposal = ({ edit, onApply, onCancel, onTest, framed = true }: { edit: Edit; onApply: () => void; onCancel: () => void; onTest: () => void; framed?: boolean }) => (
  <div className={cn("flex flex-col gap-3", framed && "bg-card rounded-xl border p-4", ENTER)}>
    {framed && <span className="text-muted-foreground text-xs">Изменение задачи · не применено</span>}
    <Changes edit={edit} />
    <p className="text-muted-foreground text-xs">
      {edit.same}
      {edit.note && ` ${edit.note}`}
    </p>
    <Actions onApply={onApply} onCancel={onCancel} onTest={onTest} />
  </div>
);

const Asked = ({ text }: { text: string }) => <div className={cn("bg-muted ml-auto max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-6", ENTER)}>{text}</div>;

const Applied = ({ edit, onRevert }: { edit: Edit; onRevert: () => void }) => (
  <div className={cn("text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm", ENTER)}>
    <span className="text-foreground min-w-0 flex-1">Изменена 30 ноя: {edit.summary}</span>
    <Button className={PRESS} onClick={onRevert} size="sm" variant="ghost">
      <Undo2 />
      Вернуть как было
    </Button>
  </div>
);

// ── «Сверху» ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export const Top = () => {
  const e = useEdit();
  return (
    <TaskPage busy={e.stage === "thinking"} draft={e.stage === "idle" ? e.edit.ask : ""} onSend={e.send} next={e.stage === "applied" ? e.edit.next : undefined} schedule={e.stage === "applied" ? e.edit.schedule : undefined}>
      {(e.stage === "thinking" || e.stage === "proposed") && (
        <div className="flex flex-col gap-3">
          <Asked text={e.asked} />
          {e.stage === "thinking" ? <Thinking>Готовлю изменение…</Thinking> : <Proposal edit={e.edit} onApply={e.apply} onCancel={e.cancel} onTest={e.test} />}
        </div>
      )}
      {e.stage === "applied" && <Applied edit={e.edit} onRevert={e.revert} />}
      <LatestBody />
    </TaskPage>
  );
};

// ── «Панель» ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export const Panel = () => {
  const e = useEdit();
  const phone = usePhone();
  const { task } = use(Open);
  const open = e.stage === "thinking" || e.stage === "proposed";
  return (
    <TaskPage busy={e.stage === "thinking"} draft={e.stage === "idle" ? e.edit.ask : ""} onSend={e.send} next={e.stage === "applied" ? e.edit.next : undefined} schedule={e.stage === "applied" ? e.edit.schedule : undefined}>
      {e.stage === "applied" && <Applied edit={e.edit} onRevert={e.revert} />}
      <LatestBody />
      <Sheet onOpenChange={(o) => !o && e.cancel()} open={open}>
        <SheetContent className={cn("@container gap-0", phone ? "max-h-[85dvh]" : "sm:max-w-md")} side={phone ? "bottom" : "right"}>
          <SheetHeader className="border-b">
            <SheetTitle>Изменение задачи</SheetTitle>
            <SheetDescription>{task.name}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 overflow-y-auto p-4">
            <Asked text={e.asked} />
            {e.stage === "thinking" ? <Thinking>Готовлю изменение…</Thinking> : <Proposal edit={e.edit} framed={false} onApply={e.apply} onCancel={e.cancel} onTest={e.test} />}
          </div>
        </SheetContent>
      </Sheet>
    </TaskPage>
  );
};

// ── «Карточка задачи» ────────────────────────────────────────────────────────────────────────────────────────────────

export const Card = () => {
  const e = useEdit();
  const { task } = use(Open);
  const { say } = useProto();
  const [open, setOpen] = useState(false);
  // Письма по задаче: у каждой своя настройка. В прототипе у «Продаж» выключены, у остальных включены.
  const [mailOn, setMailOn] = useState<Record<string, boolean>>({ mail: true, prices: true, sales: false });
  const mail = mailOn[task.id] ?? false;
  const setMail = (v: boolean) => setMailOn((m) => ({ ...m, [task.id]: v }));
  useEffect(() => {
    setOpen(false);
  }, [task.id]);
  const editing = e.stage === "thinking" || e.stage === "proposed";
  const shown = open || editing;
  const changed = new Map(e.edit.changes.map((c) => [c.label, c]));
  // Последняя строка — когда задачу создали: строки «Создана … — «просьба»» внизу страницы больше нет.
  const fields = [...(FIELDS[task.id] ?? []), { label: "Создана", value: task.created }].map((f) => {
    const c = changed.get(f.label);
    return { ...f, change: c, value: c && e.stage === "applied" ? c.after : f.value };
  });
  return (
    <TaskPage busy={e.stage === "thinking"} draft={e.stage === "idle" ? e.edit.ask : ""} onSend={e.send} next={e.stage === "applied" ? e.edit.next : undefined} schedule={e.stage === "applied" ? e.edit.schedule : undefined} setup={false}>
      <section className={cn("bg-card rounded-xl border", editing && "ring-foreground/10 ring-2")}>
        <button
          aria-expanded={shown}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm"
          disabled={editing}
          onClick={() => setOpen((o) => !o)}
          type="button"
        >
          <span className="text-muted-foreground shrink-0">О задаче</span>
          <span className="min-w-0 flex-1 truncate">{fields[0]?.value}</span>
          {e.stage === "applied" && <span className="text-muted-foreground shrink-0 text-xs">изменена 30 ноя</span>}
          {!editing && <ChevronDown className={cn("text-muted-foreground size-4 shrink-0 transition-transform duration-200", shown && "rotate-180")} />}
        </button>
        {shown && (
          <div className={cn("flex flex-col gap-3 border-t px-4 pt-1 pb-4", ENTER)}>
            {editing && (
              <p className="text-muted-foreground pt-2 text-xs">
                Изменение по просьбе «{e.asked}» · не применено
              </p>
            )}
            <div className="flex flex-col divide-y">
              {fields.map((f) =>
                e.stage === "proposed" && f.change ? (
                  <div className="grid grid-cols-[7rem_1fr] gap-3 py-2.5 text-sm @max-md:grid-cols-1 @max-md:gap-1" key={f.label}>
                    <span className="text-muted-foreground">{f.label}</span>
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground line-through decoration-1">{f.change.before}</span>
                      <After change={f.change} />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-[7rem_1fr] gap-3 py-2.5 text-sm @max-md:grid-cols-1 @max-md:gap-1" key={f.label}>
                    <span className="text-muted-foreground">{f.label}</span>
                    <span className={cn(e.stage === "proposed" && "text-muted-foreground")}>{f.value}</span>
                  </div>
                )
              )}
              {/* Письма — для каждой задачи свои: только когда задача ждёт человека; «нового нет» не приходит. */}
              <div className="grid grid-cols-[7rem_1fr] items-center gap-3 py-2.5 text-sm @max-md:grid-cols-[1fr_auto]">
                <span className="text-muted-foreground @max-md:col-span-2">На почту</span>
                <label className="flex cursor-pointer items-center justify-between gap-3 @max-md:col-span-2">
                  <span className={cn(!mail && "text-muted-foreground")}>
                    {mail ? "Новые итоги, вопросы и сбои" : "Не присылать"}
                    <span className="text-muted-foreground block text-xs">«Нового нет» на почту не приходит никогда</span>
                  </span>
                  <Switch
                    aria-label="Письма по этой задаче"
                    checked={mail}
                    onCheckedChange={(v) => {
                      setMail(v);
                      say(v ? `Письма по задаче «${task.name}» включены` : `Письма по задаче «${task.name}» выключены`);
                    }}
                  />
                </label>
              </div>
            </div>
            {e.stage === "thinking" && <Thinking>Готовлю изменение…</Thinking>}
            {e.stage === "proposed" && (
              <>
                {e.edit.note && <p className="text-muted-foreground text-xs">{e.edit.note}</p>}
                <Actions onApply={e.apply} onCancel={e.cancel} onTest={e.test} />
              </>
            )}
            {e.stage === "applied" && (
              <div>
                <Button className={PRESS} onClick={e.revert} size="sm" variant="ghost">
                  <Undo2 />
                  Вернуть как было
                </Button>
              </div>
            )}
          </div>
        )}
      </section>
      <LatestBody />
    </TaskPage>
  );
};
