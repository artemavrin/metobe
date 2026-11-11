"use client";

import { Button } from "@metobe/ui/components/button";
import { Kbd } from "@metobe/ui/components/kbd";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowLeft, Ban, CalendarClock, Check, Clock, Undo2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Picker } from "../_shared/picker";
import { ENTER, PRESS, Params, ProtoProvider, useProto } from "../memory/frame";

// P20 · «Сверка» давно открытых обещаний (В2.1 и Д2): два вида разбора. «Списком» — все давно открытые под рукой,
// у каждого свои кнопки. «По одному» — одно обещание на экране, четыре действия, клавиши 1–4, «Назад» возвращает
// последнее, счёт «3 из 11». Решения здесь ничего не пишут в память. В адресе: `?v=1&fill=many&sz=phone`.

type Choice = "done" | "keep" | "moved" | "cancelled";

interface Item {
  id: string;
  who: string;
  text: string;
  /** Сколько дней назад дано и сколько — без перемен. */
  given: number;
  quiet: number;
  due: string | null;
  from: string;
}

const ITEMS: Item[] = [
  { due: "срок был 28 окт", from: "из чата «Планёрка по порталу»", given: 52, id: "1", quiet: 44, text: "Прислать план работ на декабрь", who: "Ирина Белова → вы" },
  { due: null, from: "из чата «Склад»", given: 47, id: "2", quiet: 47, text: "Передать доступы к складской системе", who: "Андрей Седов → вы" },
  { due: "срок был 2 нояб.", from: "заметка на карточке", given: 41, id: "3", quiet: 36, text: "Подписать акт сверки", who: "вы → ООО «Вектор»" },
  { due: null, from: "из чата «Договор»", given: 39, id: "4", quiet: 39, text: "Выслать договор на проверку юристам", who: "вы → Ольга Ли" },
  { due: "срок был 5 нояб.", from: "из чата «Закупки»", given: 38, id: "5", quiet: 33, text: "Подготовить отчёт по закупкам", who: "Ирина Белова → вы" },
  { due: null, from: "из чата «Планёрка по порталу»", given: 36, id: "6", quiet: 36, text: "Обновить список поставщиков", who: "Игорь Белов → вы" },
  { due: "срок был 7 нояб.", from: "из чата «Склад»", given: 35, id: "7", quiet: 31, text: "Ответить на письмо о поставке", who: "вы → ООО «Вектор»" },
  { due: null, from: "заметка на карточке", given: 34, id: "8", quiet: 34, text: "Согласовать смету на ремонт склада", who: "ООО «Вектор» → вы" },
  { due: null, from: "из чата «Закупки»", given: 33, id: "9", quiet: 33, text: "Прислать фотографии с приёмки", who: "Андрей Седов → вы" },
  { due: "срок был 9 нояб.", from: "из чата «Договор»", given: 32, id: "10", quiet: 32, text: "Уточнить сроки по второму этапу", who: "Ольга Ли → вы" },
  { due: null, from: "из чата «Планёрка по порталу»", given: 31, id: "11", quiet: 31, text: "Пересмотреть график дежурств", who: "вы → Игорь Белов" },
];

const WORDS: Record<Choice, string> = { cancelled: "Отменено", done: "Выполнено", keep: "Жду дальше", moved: "Перенесено" };

const useItems = () => {
  const { knobs } = useProto();
  return ITEMS.slice(0, knobs.fill === "few" ? 4 : ITEMS.length);
};

const age = (i: Item) => `дано ${i.given} дн. назад · без перемен ${i.quiet} дн.`;

// ── «Списком» ────────────────────────────────────────────────────────────────────────────────────────────────────────

const AsList = () => {
  const items = useItems();
  const [decided, setDecided] = useState<Record<string, Choice>>({});
  const left = items.filter((i) => !decided[i.id]);
  return (
    <div className="bg-background min-h-svh px-4 py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <header className="flex items-baseline justify-between px-2">
          <h1 className="text-lg font-medium">Давно открыто</h1>
          <span className="text-muted-foreground text-sm tabular-nums">{left.length} из {items.length}</span>
        </header>
        <p className="text-muted-foreground px-2 text-sm">Без перемен больше 30 дней и без срока впереди. «Жду дальше» убирает обещание из этого списка на 30 дней.</p>
        <ul className="flex flex-col">
          {items.map((i) => {
            const choice = decided[i.id];
            return (
              <li className={cn("flex flex-col gap-1.5 rounded-lg px-2 py-2.5", ENTER, choice && "opacity-50")} key={i.id}>
                <span className="text-muted-foreground text-xs">{i.who} · {i.due ?? age(i)}</span>
                <span className={cn("text-sm", choice && "line-through")}>{i.text}</span>
                {choice ? (
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground">{WORDS[choice]}</span>
                    <button className="text-muted-foreground hover:text-foreground underline" onClick={() => setDecided((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== i.id)))} type="button">Вернуть</button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {(["done", "keep", "moved", "cancelled"] as Choice[]).map((c) => (
                      <Button className={PRESS} key={c} onClick={() => setDecided((d) => ({ ...d, [i.id]: c }))} size="sm" variant="outline">
                        {WORDS[c === "moved" ? "moved" : c].replace("Перенесено", "Перенести")}
                      </Button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {left.length === 0 && <p className="text-muted-foreground px-2 text-sm">Всё разобрано.</p>}
      </div>
    </div>
  );
};

// ── «По одному» ──────────────────────────────────────────────────────────────────────────────────────────────────────

const ACTIONS: { choice: Choice; label: string; key: string; icon: typeof Check }[] = [
  { choice: "done", icon: Check, key: "1", label: "Выполнено" },
  { choice: "keep", icon: Clock, key: "2", label: "Жду дальше" },
  { choice: "moved", icon: CalendarClock, key: "3", label: "Перенести" },
  { choice: "cancelled", icon: Ban, key: "4", label: "Отменено" },
];
const MOVES = ["Завтра", "Через неделю", "Через две недели", "Без срока"];

const OneByOne = () => {
  const items = useItems();
  const [at, setAt] = useState(0);
  const [history, setHistory] = useState<Choice[]>([]);
  const [moving, setMoving] = useState(false);
  const item = items[at];
  const decide = useCallback(
    (choice: Choice) => {
      setMoving(false);
      setHistory((h) => [...h, choice]);
      setAt((n) => n + 1);
    },
    []
  );
  const back = useCallback(() => {
    setMoving(false);
    setHistory((h) => h.slice(0, -1));
    setAt((n) => Math.max(0, n - 1));
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Backspace" || e.key === "z") back();
      const action = ACTIONS.find((a) => a.key === e.key);
      if (!(action && item)) return;
      // Цифры 1–2 — ещё и переключатель вариантов прототипа: здесь они принадлежат экрану.
      e.stopImmediatePropagation();
      if (action.choice === "moved") setMoving(true);
      else decide(action.choice);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [back, decide, item]);
  const count = (c: Choice) => history.filter((h) => h === c).length;
  return (
    <div className="bg-background min-h-svh px-4 py-10">
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        <header className="flex items-center justify-between">
          <Button className={PRESS} disabled={at === 0} onClick={back} size="sm" variant="ghost">
            <ArrowLeft /> Назад
          </Button>
          <span className="text-muted-foreground text-sm tabular-nums">{item ? `${at + 1} из ${items.length}` : `${items.length} из ${items.length}`}</span>
        </header>
        <div aria-hidden className="bg-muted h-1 overflow-hidden rounded-full">
          <div className="bg-foreground/70 h-full rounded-full transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]" style={{ width: `${(at / items.length) * 100}%` }} />
        </div>
        {item ? (
          <article className={cn("flex flex-col gap-5 rounded-xl border p-5", ENTER)} key={item.id}>
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-sm">{item.who}</span>
              <p className="text-xl leading-snug font-medium">{item.text}</p>
            </div>
            <dl className="text-muted-foreground flex flex-col gap-1 text-sm">
              <div className="flex gap-2"><dt className="w-24 shrink-0">Дано</dt><dd>{item.given} дн. назад, {item.from}</dd></div>
              <div className="flex gap-2"><dt className="w-24 shrink-0">Без перемен</dt><dd>{item.quiet} дн.</dd></div>
              <div className="flex gap-2"><dt className="w-24 shrink-0">Срок</dt><dd>{item.due ?? "не назван"}</dd></div>
            </dl>
            {moving ? (
              <div className={cn("flex flex-wrap gap-2", ENTER)}>
                {MOVES.map((m) => (
                  <Button className={PRESS} key={m} onClick={() => decide("moved")} variant="outline">{m}</Button>
                ))}
                <Button className={PRESS} onClick={() => setMoving(false)} variant="ghost">Отмена</Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
                {ACTIONS.map((a) => (
                  <Button className={cn("justify-start", PRESS)} key={a.choice} onClick={() => (a.choice === "moved" ? setMoving(true) : decide(a.choice))} variant="outline">
                    <a.icon /> {a.label}
                    <Kbd className="ms-auto max-sm:hidden">{a.key}</Kbd>
                  </Button>
                ))}
              </div>
            )}
          </article>
        ) : (
          <div className={cn("flex flex-col items-start gap-3 rounded-xl border p-5", ENTER)}>
            <p className="text-lg font-medium">Всё разобрано</p>
            <p className="text-muted-foreground text-sm">
              Выполнено {count("done")}, ждёте дальше {count("keep")}, перенесено {count("moved")}, отменено {count("cancelled")}.
            </p>
            <Button className={PRESS} onClick={back} size="sm" variant="ghost"><Undo2 /> Вернуть последнее</Button>
          </div>
        )}
        <p className="text-muted-foreground text-xs max-sm:hidden">Клавиши: 1 — выполнено, 2 — жду дальше, 3 — перенести, 4 — отменено, Backspace — назад.</p>
      </div>
    </div>
  );
};

const MemoryReconcilePage = () => (
  <ProtoProvider defaults={{ fill: "many" }}>
    <Picker
      params={<Params rows={[["fill", "обещаний", [["many", "11"], ["few", "4"]]]]} />}
      variants={[
        { Component: AsList, name: "Списком", pickerTop: true },
        { Component: OneByOne, name: "По одному", pickerTop: true },
      ]}
    />
  </ProtoProvider>
);

export default MemoryReconcilePage;
