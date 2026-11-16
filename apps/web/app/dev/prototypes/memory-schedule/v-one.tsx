"use client";

import { CalendarClock, CalendarDays, ListChecks, UserRound } from "lucide-react";

import { Shell } from "../memory/frame";
import { Group, MemoryPage } from "./layout-parts";
import { EMPTY_TEXT, Empty, ItemRow, byNext, isDue, nextDay, useSchedule, whenOf } from "./shared";
import type { Item } from "./shared";

// Вариант 1 · «Расписание». Раздел «Напоминания» становится «Расписанием»: всё, что придёт само, одним списком по
// времени — напоминания, дни рождения и даты, ритмы встреч. Вид строки — значок слева. Сверху то, что ждёт действия:
// пришедшие и не отмеченные напоминания и ритмы, которым пора. Напоминание об обещании — текстом обещания и меткой
// «обещание · Ольга Ли»; «Выполнено» закрывает обещание.

const OneList = () => {
  const { list, actions } = useSchedule();
  const sorted = [...list].sort(byNext);
  const sent = sorted.filter((x) => x.kind === "reminder" && x.sent);
  const due = sorted.filter(isDue);
  const rest = sorted.filter((x) => !(x.kind === "reminder" && x.sent) && !isDue(x));
  const groups: [string, Item[]][] = [
    ["Пришли, не отмечены", sent],
    ["Пора", due],
    ["Сегодня", rest.filter((x) => nextDay(x) <= 0)],
    ["Завтра", rest.filter((x) => nextDay(x) === 1)],
    ["На неделе", rest.filter((x) => nextDay(x) > 1 && nextDay(x) <= 7)],
    ["Позже", rest.filter((x) => nextDay(x) > 7)],
  ];
  let n = 0;
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
        note="Что придёт само: напоминания, дни рождения и даты, ритмы встреч. Напоминания приходят в Telegram и на почту."
        title="Расписание"
      >
        {list.length === 0 ? (
          <Empty text={EMPTY_TEXT} />
        ) : (
          groups.map(([title, items]) => {
            const start = n;
            n += items.length;
            return (
              <Group count={items.length} key={title} title={title}>
                {items.map((item, i) => (
                  <ItemRow actions={actions} i={start + i} item={item} key={item.id} when={whenOf(item)} />
                ))}
              </Group>
            );
          })
        )}
      </MemoryPage>
    </Shell>
  );
};

export default OneList;
