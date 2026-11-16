"use client";

import { Button } from "@metobe/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@metobe/ui/components/dropdown-menu";
import { cn } from "@metobe/ui/lib/utils";
import { Bell, CalendarDays, Check, ChevronDown, Trash2, UserRound, X } from "lucide-react";

import { PRESS } from "../memory/frame";
import { CARDS, DayButton, Stage, TimeField, Window, nameOf, useDraft } from "./shared";
import type { Draft } from "./shared";

// Вариант 1 · «Строки». То же модальное окно, но без подписей над полями и без больших кнопок: заголовок крупно прямо
// в поле, каждая строка — значок и значение (как в календарях, к которым привыкли). Тип — две подписи сверху, не
// переключатель на всю ширину. Напоминание у обещания включается строкой «Напомнить…», а не выключателем.

export const CardMenu = ({ draft, set, className }: { draft: Draft; set: (p: Partial<Draft>) => void; className?: string }) => (
  <DropdownMenu>
    <DropdownMenuTrigger render={<Button className={cn("font-normal", className)} variant="ghost" />}>
      {nameOf(draft.card) ?? "Никому конкретно"}
      <ChevronDown className="opacity-50" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      {draft.side === "mine" && <DropdownMenuItem onClick={() => set({ card: null })}>Никому конкретно</DropdownMenuItem>}
      {CARDS.map((c) => (
        <DropdownMenuItem key={c.id} onClick={() => set({ card: c.id })}>
          {c.name}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

const Row = ({ icon: Icon, children }: { icon: typeof Bell; children: React.ReactNode }) => (
  <div className="flex min-h-9 items-center gap-3 text-sm">
    <Icon className="text-muted-foreground size-4 shrink-0" />
    <div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
  </div>
);

const Kind = ({ draft, set }: { draft: Draft; set: (p: Partial<Draft>) => void }) => (
  <div className="flex gap-4 text-sm">
    {(["promise", "reminder"] as const).map((kind) => (
      <button
        className={cn(
          "-mb-px border-b-2 pb-1.5 transition-colors duration-150",
          draft.kind === kind ? "border-foreground font-medium" : "text-muted-foreground hover:text-foreground border-transparent",
        )}
        key={kind}
        onClick={() => set(kind === "reminder" ? { day: 0, kind, remind: true, side: "mine" } : { kind })}
        type="button"
      >
        {kind === "promise" ? "Обещание" : "Напоминание"}
      </button>
    ))}
  </div>
);

const Rows = () => {
  const { draft, mode, set } = useDraft();
  const edit = mode === "edit";
  const reminder = draft.kind === "reminder";
  return (
    <Stage dim>
      <Window className="flex flex-col gap-4 p-5 pb-4">
        <div className="flex items-start justify-between">
          {edit ? <span className="text-muted-foreground text-xs">Обещание</span> : <Kind draft={draft} set={set} />}
          <button aria-label="Закрыть" className="text-muted-foreground hover:text-foreground -me-1 -mt-1 p-1" type="button">
            <X className="size-4" />
          </button>
        </div>
        <input
          autoFocus
          className="placeholder:text-muted-foreground/50 w-full bg-transparent text-lg font-medium outline-none"
          onChange={(e) => set({ text: e.target.value })}
          placeholder={reminder ? "О чём напомнить" : "Что обещано"}
          value={draft.text}
        />
        <div className="flex flex-col">
          {!reminder && (
            <Row icon={UserRound}>
              {edit ? (
                <span className="px-2.5">{draft.side === "mine" ? "Я обещал" : "Мне обещала"} {nameOf(draft.card)}</span>
              ) : (
                <>
                  <Button className="font-normal" onClick={() => set({ side: draft.side === "mine" ? "theirs" : "mine" })} variant="ghost">
                    {draft.side === "mine" ? "Я обещал" : "Мне обещали"}
                  </Button>
                  <CardMenu draft={draft} set={set} />
                </>
              )}
            </Row>
          )}
          {!reminder && (
            <Row icon={CalendarDays}>
              <DayButton onChange={(day) => set({ day, remindDay: Math.min(draft.remindDay, day) })} prefix="до " value={draft.day} variant="ghost" />
            </Row>
          )}
          <Row icon={Bell}>
            {reminder || draft.remind ? (
              <>
                <DayButton
                  onChange={(day) => set(reminder ? { day } : { remindDay: day })}
                  value={reminder ? draft.day : draft.remindDay}
                  variant="ghost"
                />
                <TimeField className="w-24 border-0 shadow-none" onChange={(time) => set({ time })} value={draft.time} />
                {!reminder && (
                  <button aria-label="Не напоминать" className="text-muted-foreground hover:text-foreground ms-auto p-1" onClick={() => set({ remind: false })} type="button">
                    <X className="size-3.5" />
                  </button>
                )}
              </>
            ) : (
              <Button className="text-muted-foreground font-normal" onClick={() => set({ remind: true })} variant="ghost">
                Напомнить…
              </Button>
            )}
          </Row>
        </div>
        <div className="flex items-center justify-between border-t pt-3">
          {edit ? (
            <div className="flex gap-1">
              <Button aria-label="Выполнено" className={PRESS} size="icon-sm" title="Выполнено" variant="ghost">
                <Check />
              </Button>
              <Button aria-label="Удалить" className={cn("text-destructive", PRESS)} size="icon-sm" title="Удалить" variant="ghost">
                <Trash2 />
              </Button>
            </div>
          ) : (
            <span className="text-muted-foreground text-xs">Enter — добавить</span>
          )}
          <Button className={PRESS} disabled={!edit && !draft.text.trim()}>
            {edit ? "Сохранить" : "Добавить"}
          </Button>
        </div>
      </Window>
    </Stage>
  );
};

export default Rows;
