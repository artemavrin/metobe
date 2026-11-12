"use client";

import { Button } from "@metobe/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@metobe/ui/components/tabs";
import { Textarea } from "@metobe/ui/components/textarea";
import { cn } from "@metobe/ui/lib/utils";
import { X } from "lucide-react";

import { ENTER, PRESS, Shell, usePhone } from "../memory/frame";
import { DayButton, FauxWeek, TimeField, dayLabel, nameOf, useDraft } from "./shared";
import type { Draft } from "./shared";
import { CardMenu } from "./v-rows";

// Вариант 3 · «Панель». Справа открывается панель на всю высоту, а календарь остаётся рядом, не затемнён, и на нём
// сразу видно, где встанет то, что вы вводите: пунктирная плашка двигается вслед за днём и временем. Места много,
// поэтому поля с подписями и ничего не прячется. На телефоне панель — отдельный экран.

const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-muted-foreground text-xs font-medium">{label}</span>
    {children}
  </div>
);

const Whose = ({ draft, edit, set }: { draft: Draft; edit: boolean; set: (p: Partial<Draft>) => void }) => (
  <Section label="Чьё обещание">
    {edit ? (
      <span className="text-sm">
        {draft.side === "mine" ? "Я обещал" : "Мне обещала"} {nameOf(draft.card)}
      </span>
    ) : (
      <div className="flex items-center gap-2">
        <Button onClick={() => set({ side: draft.side === "mine" ? "theirs" : "mine" })} variant="outline">
          {draft.side === "mine" ? "Я обещал" : "Мне обещали"}
        </Button>
        <CardMenu className="border" draft={draft} set={set} />
      </div>
    )}
  </Section>
);

const Remind = ({ draft, set }: { draft: Draft; set: (p: Partial<Draft>) => void }) => {
  const reminder = draft.kind === "reminder";
  return (
    <Section label={reminder ? "Когда напомнить" : "Напоминание"}>
      {reminder || draft.remind ? (
        <div className="flex items-center gap-2">
          <DayButton
            className="min-w-0 flex-1"
            onChange={(day) => set(reminder ? { day } : { remindDay: day })}
            value={reminder ? draft.day : draft.remindDay}
          />
          <TimeField onChange={(time) => set({ time })} value={draft.time} />
          {!reminder && (
            <Button aria-label="Не напоминать" onClick={() => set({ remind: false })} size="icon" variant="ghost">
              <X />
            </Button>
          )}
        </div>
      ) : (
        <Button className="self-start" onClick={() => set({ remind: true })} variant="outline">
          Напомнить
        </Button>
      )}
    </Section>
  );
};

const Fields = ({ draft, edit, set }: { draft: Draft; edit: boolean; set: (p: Partial<Draft>) => void }) => {
  const reminder = draft.kind === "reminder";
  return (
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
      {!edit && (
        <Tabs
          onValueChange={(v) =>
            set(v === "reminder" ? { day: 0, kind: "reminder", remind: true, side: "mine" } : { kind: "promise" })
          }
          value={draft.kind}
        >
          <TabsList className="w-full">
            <TabsTrigger value="promise">Обещание</TabsTrigger>
            <TabsTrigger value="reminder">Напоминание</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      <Section label={reminder ? "О чём напомнить" : "Что обещано"}>
        <Textarea
          autoFocus
          onChange={(e) => set({ text: e.target.value })}
          placeholder={reminder ? "Например: позвонить в сервис" : "Например: прислать договор"}
          rows={2}
          value={draft.text}
        />
      </Section>
      {reminder ? null : <Whose draft={draft} edit={edit} set={set} />}
      {reminder ? null : (
        <Section label="Срок">
          <DayButton onChange={(day) => set({ day })} value={draft.day} />
        </Section>
      )}
      <Remind draft={draft} set={set} />
    </div>
  );
};

const Footer = ({ draft, edit, set }: { draft: Draft; edit: boolean; set: (p: Partial<Draft>) => void }) => {
  const reminder = draft.kind === "reminder";
  const day = reminder ? draft.day : draft.remindDay;
  const showAt = reminder || draft.remind;
  return (
    <div className="flex shrink-0 items-center gap-2 border-t p-4">
      {edit ? (
        <>
          <Button className="text-destructive" variant="ghost">
            Удалить
          </Button>
          <Button variant="outline">Выполнено</Button>
        </>
      ) : (
        <span className="text-muted-foreground text-xs">{showAt ? `Встанет: ${dayLabel(day)}, ${draft.time}` : ""}</span>
      )}
      <Button className={cn("ms-auto", PRESS)} disabled={!edit && !draft.text.trim()}>
        {edit ? "Сохранить" : "Добавить"}
      </Button>
    </div>
  );
};

const Panel = () => {
  const phone = usePhone();
  const { draft, mode, set } = useDraft();
  const edit = mode === "edit";
  const reminder = draft.kind === "reminder";
  const showAt = reminder || draft.remind;
  const ghost = showAt ? { day: reminder ? draft.day : draft.remindDay, label: draft.text, time: draft.time } : null;
  let title = "Новое обещание";
  if (edit) {
    title = "Обещание";
  } else if (reminder) {
    title = "Новое напоминание";
  }
  return (
    <Shell area="memory" title="Календарь">
      <div className="flex min-h-0 flex-1">
        {phone ? null : <FauxWeek className="flex-1" ghost={ghost} />}
        <aside className={cn("bg-background flex flex-col border-s", phone ? "w-full" : "w-[22rem] shrink-0", ENTER)}>
          <div className="flex h-14 shrink-0 items-center justify-between border-b px-5">
            <h2 className="text-sm font-medium">{title}</h2>
            <Button aria-label="Закрыть" size="icon-sm" variant="ghost">
              <X />
            </Button>
          </div>
          <Fields draft={draft} edit={edit} set={set} />
          <Footer draft={draft} edit={edit} set={set} />
        </aside>
      </div>
    </Shell>
  );
};

export default Panel;
