"use client";

import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { Check, ChevronDown, Trash2, X } from "lucide-react";
import { useState } from "react";

import { ENTER, PRESS, Shell, usePhone } from "../memory/frame";
import { DayButton, FauxWeek, TimeField, nameOf, topOf, useDraft } from "./shared";
import type { Draft } from "./shared";
import { CardMenu } from "./v-rows";

// Вариант 2 · «У места». Окна нет: на месте клика в сетке открывается маленькая карточка, календарь вокруг остаётся
// на виду и не затемнён. В ней только то, без чего не обойтись — что и когда; «Ещё» раскрывает, чьё это, кому и
// напоминание. На телефоне та же карточка становится листом снизу.

const Kinds = ({ draft, set }: { draft: Draft; set: (p: Partial<Draft>) => void }) => (
  <div className="bg-muted flex rounded-lg p-0.5 text-xs">
    {(["promise", "reminder"] as const).map((kind) => (
      <button
        className={cn(
          "rounded-md px-2.5 py-1 transition-colors duration-150",
          draft.kind === kind ? "bg-background font-medium shadow-sm" : "text-muted-foreground"
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

const More = ({ draft, set }: { draft: Draft; set: (p: Partial<Draft>) => void }) => (
  <div className="flex flex-col gap-2 border-t pt-3 text-sm">
    <div className="flex items-center gap-1">
      <Button onClick={() => set({ side: draft.side === "mine" ? "theirs" : "mine" })} size="sm" variant="outline">
        {draft.side === "mine" ? "Я обещал" : "Мне обещали"}
      </Button>
      <CardMenu className="h-7" draft={draft} set={set} />
    </div>
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-20 shrink-0 text-xs">Напомнить</span>
      {draft.remind ? (
        <>
          <DayButton className="h-8 min-w-0 flex-1" onChange={(day) => set({ remindDay: day })} value={draft.remindDay} />
          <TimeField className="w-24" onChange={(time) => set({ time })} value={draft.time} />
        </>
      ) : (
        <Button onClick={() => set({ remind: true })} size="sm" variant="outline">
          Включить
        </Button>
      )}
    </div>
  </div>
);

const Head = ({ draft, edit, set }: { draft: Draft; edit: boolean; set: (p: Partial<Draft>) => void }) => (
  <div className="flex items-center justify-between gap-2">
    {edit ? (
      <span className="text-muted-foreground px-1 text-xs">
        {draft.side === "mine" ? "Я обещал" : "Мне обещала"} {nameOf(draft.card)}
      </span>
    ) : (
      <Kinds draft={draft} set={set} />
    )}
    {edit ? (
      <div className="flex">
        <Button aria-label="Выполнено" size="icon-sm" title="Выполнено" variant="ghost">
          <Check />
        </Button>
        <Button aria-label="Удалить" className="text-destructive" size="icon-sm" title="Удалить" variant="ghost">
          <Trash2 />
        </Button>
      </div>
    ) : (
      <Button aria-label="Закрыть" size="icon-sm" variant="ghost">
        <X />
      </Button>
    )}
  </div>
);

const Card = () => {
  const { draft, mode, set } = useDraft();
  const [more, setMore] = useState(false);
  const edit = mode === "edit";
  const reminder = draft.kind === "reminder";
  return (
    <div className="bg-popover text-popover-foreground flex w-80 flex-col gap-3 rounded-xl border p-3 shadow-xl">
      <Head draft={draft} edit={edit} set={set} />
      <input
        autoFocus
        className="placeholder:text-muted-foreground/50 w-full bg-transparent px-1 text-base outline-none"
        onChange={(e) => set({ text: e.target.value })}
        placeholder={reminder ? "О чём напомнить" : "Что обещано"}
        value={draft.text}
      />
      <div className="flex items-center gap-2">
        <DayButton className="h-8 min-w-0 flex-1" onChange={(day) => set({ day })} prefix={reminder ? "" : "до "} value={draft.day} />
        {reminder && <TimeField className="w-24" onChange={(time) => set({ time })} value={draft.time} />}
      </div>
      {more && !reminder && <More draft={draft} set={set} />}
      <div className="flex items-center justify-between">
        {reminder ? (
          <span />
        ) : (
          <button
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
            onClick={() => setMore((m) => !m)}
            type="button"
          >
            Ещё <ChevronDown className={cn("size-3 transition-transform duration-200", more && "rotate-180")} />
          </button>
        )}
        <Button className={PRESS} disabled={!edit && !draft.text.trim()} size="sm">
          {edit ? "Сохранить" : "Добавить"}
        </Button>
      </div>
    </div>
  );
};

const Popover2 = () => {
  const phone = usePhone();
  const { draft } = useDraft();
  if (phone) {
    return (
      <Shell area="memory" title="Календарь">
        <FauxWeek />
        <div className={cn("absolute inset-x-2 bottom-2 z-40 [&>div]:w-full", ENTER)}>
          <Card />
        </div>
      </Shell>
    );
  }
  // Время клика: у обещания без напоминания окно стоит у утра его дня.
  const at = draft.kind === "reminder" || draft.remind ? draft.time : "10:00";
  const day = draft.kind === "promise" && draft.remind ? draft.remindDay : draft.day;
  const left = 3 + day >= 4;
  return (
    <Shell area="memory" title="Календарь">
      <FauxWeek anchor={{ day, time: at }}>
        <div
          className={cn("absolute z-30", left ? "right-[calc(100%+0.5rem)]" : "left-[calc(100%+0.5rem)]", ENTER)}
          style={{ top: topOf(at) }}
        >
          <Card />
        </div>
      </FauxWeek>
    </Shell>
  );
};

export default Popover2;
