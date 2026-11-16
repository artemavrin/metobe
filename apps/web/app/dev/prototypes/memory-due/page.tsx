"use client";

import { Button } from "@metobe/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@metobe/ui/components/dropdown-menu";
import { cn } from "@metobe/ui/lib/utils";
import { CalendarClock, Check, GripVertical, Undo2 } from "lucide-react";
import { useState } from "react";

import { Picker } from "../_shared/picker";
import { ENTER, PRESS, Params, ProtoProvider, useProto } from "../memory/frame";

// P27 · «Сроки» на странице «Память» (Д6): что впереди, а не только что горит. Два вида: «Полоса» — 14 дней колонками,
// просроченное слева, «без срока» справа; на компьютере карточку тянут на другой день, на телефоне колонки уходят
// в ленту и срок переносит меню. «По дням» — список с заголовками дней. Месячной сетки нет. Перенос ничего не пишет
// в память. В адресе: `?v=1&fill=many&sz=phone`.

interface Promise_ {
  id: string;
  text: string;
  who: string;
  /** Смещение срока от сегодня в днях; null — без срока. */
  due: number | null;
  important?: boolean;
}

const BASE: Promise_[] = [
  { due: -3, id: "1", text: "Доделать вторую версию портала", who: "Ирина Белова" },
  { due: -1, id: "2", text: "Согласовать смету на ремонт склада", who: "ООО «Вектор»" },
  { due: 0, id: "3", important: true, text: "Согласовать её отпуск на январь", who: "вы → Ирина Белова" },
  { due: 0, id: "4", text: "Ответить на письмо о поставке", who: "вы → ООО «Вектор»" },
  { due: 2, id: "5", text: "Прислать план работ на декабрь", who: "Ирина Белова" },
  { due: 2, id: "6", text: "Подписать акт сверки", who: "вы → ООО «Вектор»" },
  { due: 3, id: "7", text: "Передать доступы к складской системе", who: "Андрей Седов" },
  { due: 5, id: "8", text: "Подготовить отчёт по закупкам", who: "Ирина Белова" },
  { due: 6, id: "9", text: "Выслать договор на проверку юристам", who: "вы → Ольга Ли" },
  { due: 8, id: "10", text: "Обновить список поставщиков", who: "Игорь Белов" },
  { due: 9, id: "11", text: "Прислать фотографии с приёмки", who: "Андрей Седов" },
  { due: 11, id: "12", text: "Провести пересчёт остатков", who: "Игорь Белов" },
  { due: 13, id: "13", text: "Уточнить сроки по второму этапу", who: "Ольга Ли" },
  { due: null, id: "14", text: "Пересмотреть график дежурств", who: "вы → Игорь Белов" },
  { due: null, id: "15", text: "Заказать новые стеллажи", who: "вы → ООО «Вектор»" },
];
const FEW = new Set(["1", "3", "5", "9", "14"]);

const DAYS = 14;
const weekday = new Intl.DateTimeFormat("ru", { weekday: "short" });
const dayNum = new Intl.DateTimeFormat("ru", { day: "numeric", month: "short" });
const dayAt = (offset: number) => new Date(Date.now() + offset * 86_400_000);
const label = (offset: number) => (offset === 0 ? "Сегодня" : offset === 1 ? "Завтра" : weekday.format(dayAt(offset)));

const MOVES: [string, number | null][] = [["Сегодня", 0], ["Завтра", 1], ["Через неделю", 7], ["Без срока", null]];

const useDue = () => {
  const { knobs } = useProto();
  const [items, setItems] = useState(() => BASE);
  const [done, setDone] = useState<string[]>([]);
  const [last, setLast] = useState<{ id: string; from: number | null; text: string } | null>(null);
  const list = items.filter((i) => (knobs.fill === "few" ? FEW.has(i.id) : true) && !done.includes(i.id));
  return {
    complete: (id: string) => setDone((d) => [...d, id]),
    items: list,
    last,
    move: (id: string, to: number | null) => {
      const was = items.find((i) => i.id === id);
      if (!was || was.due === to) return;
      setItems((all) => all.map((i) => (i.id === id ? { ...i, due: to } : i)));
      setLast({ from: was.due, id, text: was.text });
    },
    undo: () => {
      if (!last) return;
      setItems((all) => all.map((i) => (i.id === last.id ? { ...i, due: last.from } : i)));
      setLast(null);
    },
  };
};
type Due = ReturnType<typeof useDue>;

const MoveMenu = ({ id, due }: { id: string; due: Due }) => (
  <DropdownMenu>
    <DropdownMenuTrigger render={<Button aria-label="Перенести срок" className="text-muted-foreground size-7" size="icon-sm" variant="ghost" />}>
      <CalendarClock />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {MOVES.map(([text, to]) => (
        <DropdownMenuItem key={text} onClick={() => due.move(id, to)}>{text}</DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);

const Undo = ({ due }: { due: Due }) =>
  due.last ? (
    <div className={cn("bg-popover fixed bottom-24 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-lg border px-3 py-2 text-sm shadow-md", ENTER)} key={due.last.id + String(due.last.from)}>
      Срок перенесён: {due.last.text}
      <Button className={PRESS} onClick={due.undo} size="sm" variant="ghost"><Undo2 /> Вернуть</Button>
    </div>
  ) : null;

const Card = ({ item, due, draggable }: { item: Promise_; due: Due; draggable: boolean }) => (
  <li
    className={cn("bg-card group flex items-start gap-1.5 rounded-lg border p-2 text-sm", draggable && "cursor-grab active:cursor-grabbing")}
    draggable={draggable}
    onDragStart={(e) => e.dataTransfer.setData("text/plain", item.id)}
  >
    {draggable && <GripVertical className="text-muted-foreground/50 mt-0.5 size-3.5 shrink-0" />}
    <button aria-label={`Выполнено: ${item.text}`} className={cn("border-foreground/25 hover:border-foreground/60 mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border", PRESS)} onClick={() => due.complete(item.id)} type="button">
      <Check className="text-foreground/0 group-hover:text-foreground/50 size-3" />
    </button>
    <span className="flex min-w-0 flex-1 flex-col">
      <span className={cn("break-words", item.important && "font-medium")}>{item.text}</span>
      <span className="text-muted-foreground truncate text-xs">{item.who}</span>
    </span>
    {!draggable && <MoveMenu due={due} id={item.id} />}
  </li>
);

// ── «Полоса» ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const Column = ({ title, sub, tone, items, to, due, phone }: { title: string; sub?: string; tone?: "late"; items: Promise_[]; to: number | null; due: Due; phone: boolean }) => {
  const [over, setOver] = useState(false);
  return (
    <section
      className={cn("flex w-44 shrink-0 flex-col gap-2 rounded-xl p-2 transition-colors duration-150 max-sm:w-64", over && "bg-muted/60", phone && "snap-start")}
      onDragLeave={() => setOver(false)}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDrop={(e) => { e.preventDefault(); setOver(false); due.move(e.dataTransfer.getData("text/plain"), to); }}
    >
      <header className="flex items-baseline justify-between px-1">
        <h3 className={cn("text-sm font-medium", tone === "late" && "text-destructive")}>{title}{sub && <span className="text-muted-foreground ms-1.5 text-xs font-normal">{sub}</span>}</h3>
        {items.length > 0 && <span className="text-muted-foreground text-xs tabular-nums">{items.length}</span>}
      </header>
      <ul className="flex min-h-16 flex-col gap-1.5">
        {items.map((i) => <Card draggable={!phone} due={due} item={i} key={i.id} />)}
      </ul>
    </section>
  );
};

const Strip = () => {
  const due = useDue();
  const { screen } = useProto();
  const phone = screen === "phone";
  const late = due.items.filter((i) => i.due !== null && i.due < 0);
  return (
    <div className="bg-background min-h-svh py-10">
      <div className={cn("mx-auto flex flex-col gap-4 px-4", phone ? "w-[390px]" : "max-w-6xl")}>
        <h1 className="text-lg font-medium">Сроки</h1>
        <div className={cn("-mx-2 flex gap-1 overflow-x-auto pb-2", phone && "snap-x snap-mandatory")}>
          {late.length > 0 && <Column due={due} items={late} phone={phone} title="Просрочено" to={0} tone="late" />}
          {Array.from({ length: DAYS }, (_, d) => (
            <Column due={due} items={due.items.filter((i) => i.due === d)} key={d} phone={phone} sub={dayNum.format(dayAt(d))} title={label(d)} to={d} />
          ))}
          <Column due={due} items={due.items.filter((i) => i.due === null)} phone={phone} title="Без срока" to={null} />
        </div>
        <p className="text-muted-foreground text-xs">{phone ? "Срок переносит значок календаря у обещания." : "Обещание можно перетащить на другой день."} Дальше 14 дней — {due.items.filter((i) => i.due !== null && i.due >= DAYS).length}.</p>
      </div>
      <Undo due={due} />
    </div>
  );
};

// ── «По дням» ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const ByDay = () => {
  const due = useDue();
  const { screen } = useProto();
  const groups: { key: string; title: string; sub?: string; tone?: "late"; items: Promise_[] }[] = [
    { items: due.items.filter((i) => i.due !== null && i.due < 0), key: "late", title: "Просрочено", tone: "late" as const },
    ...Array.from({ length: DAYS }, (_, d) => ({ items: due.items.filter((i) => i.due === d), key: String(d), sub: dayNum.format(dayAt(d)), title: label(d) })),
    { items: due.items.filter((i) => i.due === null), key: "none", title: "Без срока" },
  ].filter((g) => g.items.length > 0);
  return (
    <div className="bg-background min-h-svh py-10">
      <div className={cn("mx-auto flex flex-col gap-5 px-4", screen === "phone" ? "w-[390px]" : "max-w-2xl")}>
        <h1 className="text-lg font-medium">Сроки</h1>
        {groups.map((g) => (
          <section className="flex flex-col gap-1" key={g.key}>
            <h3 className={cn("flex items-baseline gap-2 px-2 text-sm font-medium", g.tone === "late" && "text-destructive")}>
              {g.title}{g.sub && <span className="text-muted-foreground text-xs font-normal">{g.sub}</span>}
            </h3>
            <ul className="flex flex-col">
              {g.items.map((i) => (
                <li className="hover:bg-muted/40 flex items-start gap-2.5 rounded-lg px-2 py-1.5" key={i.id}>
                  <button aria-label={`Выполнено: ${i.text}`} className={cn("border-foreground/25 hover:border-foreground/60 mt-1 size-[18px] shrink-0 rounded-full border", PRESS)} onClick={() => due.complete(i.id)} type="button" />
                  <span className="flex min-w-0 flex-1 flex-col"><span className="text-sm break-words">{i.text}</span><span className="text-muted-foreground text-xs">{i.who}</span></span>
                  <MoveMenu due={due} id={i.id} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <Undo due={due} />
    </div>
  );
};

const MemoryDuePage = () => (
  <ProtoProvider defaults={{ fill: "many" }}>
    <Picker
      params={<Params rows={[["fill", "обещаний", [["many", "15"], ["few", "5"]]]]} />}
      variants={[
        { Component: Strip, name: "Полоса", pickerTop: true },
        { Component: ByDay, name: "По дням", pickerTop: true },
      ]}
    />
  </ProtoProvider>
);

export default MemoryDuePage;
