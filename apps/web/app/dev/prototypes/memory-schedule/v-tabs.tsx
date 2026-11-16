"use client";

import { Progress } from "@metobe/ui/components/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@metobe/ui/components/tabs";
import { cn } from "@metobe/ui/lib/utils";
import { CalendarClock, CalendarDays, ListChecks, UserRound } from "lucide-react";
import { useState } from "react";

import { ENTER, Shell, rise } from "../memory/frame";
import { Group, MemoryPage } from "./layout-parts";
import { EMPTY_TEXT, Empty, ItemActions, ItemRow, byNext, nextDay, subline, useSchedule, whenOf } from "./shared";
import type { Actions, RhythmItem } from "./shared";

// Вариант 2 · «Вкладки». Один раздел «Расписание», внутри три вкладки — у каждого вида свой порядок и свой вид:
// напоминания — группами по времени, как сейчас; даты — по ближайшему разу, «через 2 дн.»; ритмы — полоской, сколько
// прошло от периода с последней встречи, сначала тем, кому пора.

const RhythmRow = ({ item, actions, i }: { item: RhythmItem; actions: Actions; i: number }) => {
  const passed = item.last ?? item.said;
  const share = Math.min(100, Math.round((passed / item.every) * 100));
  const due = nextDay(item) <= 0;
  return (
    <li className={cn("group hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5", ENTER)} style={rise(i)}>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm">{item.card}</span>
          <span className={cn("shrink-0 text-xs tabular-nums", due ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>{whenOf(item)}</span>
        </div>
        <Progress className={cn("[&_[data-slot=progress-indicator]]:transition-all", due && "[&_[data-slot=progress-indicator]]:bg-amber-500")} value={share} />
        <span className="text-muted-foreground text-xs">{subline(item)}</span>
      </div>
      <ItemActions actions={actions} item={item} />
    </li>
  );
};

const daysWord = (d: number) => (d === 0 ? "сегодня" : d === 1 ? "завтра" : `через ${d} дн.`);

const TabsView = () => {
  const { list, actions } = useSchedule();
  const [tab, setTab] = useState("reminders");
  const sorted = [...list].sort(byNext);
  const reminders = sorted.filter((x) => x.kind === "reminder");
  const dates = sorted.filter((x) => x.kind === "date");
  const rhythms = sorted.filter((x): x is RhythmItem => x.kind === "rhythm");
  const sent = reminders.filter((x) => x.kind === "reminder" && x.sent);
  const ahead = reminders.filter((x) => !(x.kind === "reminder" && x.sent));
  return (
    <Shell area="memory" title="Расписание">
      <MemoryPage
        active="schedule"
        nav={[
          { icon: CalendarDays, id: "calendar", label: "Календарь" },
          { count: list.length, icon: CalendarClock, id: "schedule", label: "Расписание" },
          { icon: UserRound, id: "me", label: "Обо мне" },
          { icon: ListChecks, id: "rules", label: "Правила" },
        ]}
        note="Напоминания отправляются в Telegram и на почту; даты и ритмы — в «Не упустить», когда подойдёт время."
        title="Расписание"
      >
        {list.length === 0 ? (
          <Empty text={EMPTY_TEXT} />
        ) : (
          <Tabs onValueChange={(v) => setTab(String(v))} value={tab}>
            <TabsList className="w-full justify-start border-b" variant="line">
              <TabsTrigger value="reminders">Напоминания {reminders.length}</TabsTrigger>
              <TabsTrigger value="dates">Даты {dates.length}</TabsTrigger>
              <TabsTrigger value="rhythms">Ритмы {rhythms.length}</TabsTrigger>
            </TabsList>
            <TabsContent className="flex flex-col gap-6 pt-4" value="reminders">
              <Group count={sent.length} title="Отправлено, не отмечено">
                {sent.map((x, i) => (
                  <ItemRow actions={actions} i={i} item={x} key={x.id} showKind={false} when={whenOf(x)} />
                ))}
              </Group>
              <Group count={ahead.length} title="Дальше">
                {ahead.map((x, i) => (
                  <ItemRow actions={actions} i={sent.length + i} item={x} key={x.id} showKind={false} when={whenOf(x)} />
                ))}
              </Group>
            </TabsContent>
            <TabsContent className="pt-4" value="dates">
              <ul className="flex flex-col">
                {dates.map((x, i) => (
                  <ItemRow actions={actions} i={i} item={x} key={x.id} showKind={false} when={daysWord(nextDay(x))} />
                ))}
              </ul>
            </TabsContent>
            <TabsContent className="pt-4" value="rhythms">
              <ul className="flex flex-col">
                {rhythms.map((x, i) => (
                  <RhythmRow actions={actions} i={i} item={x} key={x.id} />
                ))}
              </ul>
            </TabsContent>
          </Tabs>
        )}
      </MemoryPage>
    </Shell>
  );
};

export default TabsView;
