"use client";

import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { Bell, Check, Clock, HandHeart, Trash2, UserRound } from "lucide-react";
import { useState } from "react";

import { PRESS } from "../memory/frame";
import { DayButton, Stage, TimeField, Window, dayLabel, nameOf, useDraft } from "./shared";
import type { Draft } from "./shared";

// Вариант 4 · «Фраза». Вместо формы одна строка, как у быстрого добавления в списках дел: пишете «напомни завтра в
// 10 позвонить в сервис», а под ней по мере набора собираются значки — когда, во сколько, кому, обещание это или
// напоминание. Любой значок можно поправить рукой. Разбор здесь — упрощённый, для вида: в продукте фразу разбирает
// то же, что и записи из чата.

const DAYS: [RegExp, number][] = [
  [/послезавтра/iu, 2],
  [/завтра/iu, 1],
  [/сегодня/iu, 0],
];
const TIME = /(?:^|\s)в\s+(\d{1,2})(?:[:.](\d{2}))?(\s*(?:утра|вечера|дня))?/iu;
const WHO: [RegExp, string][] = [
  [/ольг/iu, "olga"],
  [/игор/iu, "igor"],
  [/вектор/iu, "vector"],
];

/** Что нашлось во фразе; остальное — текст дела. */
const parse = (phrase: string): Partial<Draft> & { title: string } => {
  let title = phrase;
  const found: Partial<Draft> = {};
  if (/напомн/iu.test(phrase)) {
    found.kind = "reminder";
    found.remind = true;
    found.side = "mine";
    title = title.replace(/напомн\S*\s*(мне)?/iu, "");
  }
  for (const [re, day] of DAYS) {
    if (re.test(title)) {
      found.day = day;
      title = title.replace(re, "");
      break;
    }
  }
  const t = TIME.exec(title);
  if (t) {
    let h = Number(t[1]);
    if (/вечера|дня/iu.test(t[3] ?? "") && h < 12) h += 12;
    found.time = `${String(Math.min(h, 23)).padStart(2, "0")}:${t[2] ?? "00"}`;
    found.remind = true;
    title = title.replace(TIME, "");
  }
  for (const [re, id] of WHO) {
    if (re.test(title)) {
      found.card = id;
      break;
    }
  }
  return { ...found, title: title.replace(/\s+/gu, " ").trim() };
};

const Pill = ({ icon: Icon, on, children, onClick }: { icon: typeof Bell; on?: boolean; children: React.ReactNode; onClick?: () => void }) => (
  <button
    className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", on ? "bg-secondary font-medium" : "text-muted-foreground border-dashed", onClick && PRESS)}
    onClick={onClick}
    type="button"
  >
    <Icon className="size-3.5" />
    {children}
  </button>
);

const Phrase = () => {
  const { draft, mode, set } = useDraft();
  const [phrase, setPhrase] = useState("");
  const edit = mode === "edit";
  const reminder = draft.kind === "reminder";
  const typed = (value: string) => {
    setPhrase(value);
    const { title, ...found } = parse(value);
    set({ ...found, text: title });
  };
  return (
    <Stage dim>
      <Window className="w-[34rem] overflow-hidden">
        <input
          autoFocus
          className="placeholder:text-muted-foreground/50 w-full bg-transparent px-5 pt-5 pb-3 text-lg outline-none"
          onChange={(e) => typed(e.target.value)}
          placeholder={edit ? draft.text : "Напомни завтра в 10 позвонить в сервис"}
          value={edit && !phrase ? draft.text : phrase}
        />
        <div className="flex flex-wrap items-center gap-1.5 px-5 pb-4">
          <Pill
            icon={reminder ? Bell : HandHeart}
            on
            onClick={edit ? undefined : () => set(reminder ? { kind: "promise" } : { day: 0, kind: "reminder", remind: true, side: "mine" })}
          >
            {reminder ? "Напоминание" : "Обещание"}
          </Pill>
          <DayButton className="h-7 rounded-full px-2.5 text-xs" onChange={(day) => set({ day })} prefix={reminder ? "" : "до "} value={draft.day} variant="secondary" />
          {(reminder || draft.remind) && <TimeField className="h-7 w-24 rounded-full text-xs" onChange={(time) => set({ time })} value={draft.time} />}
          {!reminder && (
            <Pill icon={UserRound} on={draft.card !== null}>
              {nameOf(draft.card) ?? "кому"}
            </Pill>
          )}
          {!reminder && !draft.remind && <Pill icon={Clock}>без напоминания</Pill>}
        </div>
        <div className="bg-muted/40 flex items-center gap-2 border-t px-5 py-3 text-xs">
          <span className="text-muted-foreground min-w-0 flex-1 truncate">
            {draft.text.trim()
              ? `Запишу: «${draft.text.trim()}» — ${dayLabel(draft.day)}${reminder || draft.remind ? `, ${draft.time}` : ""}`
              : "Пишите как говорите: когда, во сколько, кому."}
          </span>
          {edit && (
            <>
              <Button aria-label="Выполнено" size="icon-sm" title="Выполнено" variant="ghost"><Check /></Button>
              <Button aria-label="Удалить" className="text-destructive" size="icon-sm" title="Удалить" variant="ghost"><Trash2 /></Button>
            </>
          )}
          <Button className={PRESS} disabled={!edit && !draft.text.trim()} size="sm">
            {edit ? "Сохранить" : "Добавить"}
          </Button>
        </div>
      </Window>
    </Stage>
  );
};

export default Phrase;
