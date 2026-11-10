"use client";

import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { Check, Mail, Pencil, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ENTER, Shell, rise, usePhone, useProto } from "../memory/frame";

// P22 · раунд 2: карточка человека. Раунд 1 («Одной колонкой» взят за основу) — ./round-1.
// Что изменено после разбора (ui-design: спокойная плотность, структура без рамок; emil: отклик на нажатие, движение
// только там, где объясняет):
// — «что сейчас» — не абзац, а три числа в строку: последняя встреча, ритм, открыто. Читается за секунду.
// — обязательство — строка с кружком слева, как дело в списке: нажал — закрыл. Галочка справа терялась.
// — срок — у текста, а не в 500 px от него; просрочка — единственный цвет на странице.
// — история — с датой в левом поле: видно, что это хронология, а не ещё один список.
// — добавление — тихая строка «Записать…» под шапкой, не второе поле чата внизу: его путали бы с чатом.
// — значки у группы и проектов убраны: они ничего не различали.
// «Колонкой» — всё подряд, дела первыми. «Баланс» — «ждёте» и «обещали» рядом: видно, кто кому больше должен.
// Параметры: записей — много или пусто. В адресе: `?v=1&fill=empty&sz=phone`.

interface Item { id: string; text: string; meta?: string; late?: boolean }
type Key = "them" | "me" | "known" | "history";

const PERSON = { initials: "ИБ", name: "Ирина Белова", role: "Заместитель", tags: ["Моя команда", "Портал, вторая версия", "Склад 2.0"] };
const BASE: Record<Key, Item[]> = {
  history: [
    { id: "h1", meta: "6 ноя", text: "Встреча один на один: обсудили сроки портала" },
    { id: "h2", meta: "28 окт", text: "Созвон с поставщиком, вела переговоры" },
    { id: "h3", meta: "14 окт", text: "Встреча один на один" },
  ],
  known: [
    { id: "k1", text: "Сильна в переговорах с поставщиками" },
    { id: "k2", text: "Предпочитает короткие сообщения, не звонки" },
    { id: "k3", meta: "с 3 ноя", text: "Ведёт вторую версию портала" },
  ],
  me: [{ id: "m1", meta: "до ср, 11 ноя", text: "Согласовать её отпуск на январь" }],
  them: [
    { id: "t1", late: true, meta: "просрочено на 2 дн.", text: "Доделать вторую версию портала" },
    { id: "t2", meta: "до пт, 13 ноя", text: "Прислать план работ на декабрь" },
  ],
};
const TITLE: Record<Key, string> = { history: "История", known: "Известно", me: "Вы обещали", them: "Ждёте от неё" };

// Одна кривая на всё: ease-out, быстро начинается. Нажатие — 0.97 за 160 мс.
const OUT = "ease-[cubic-bezier(0.23,1,0.32,1)]";
const PRESS = "transition-transform duration-160 ease-out active:scale-[0.97] motion-reduce:active:scale-100";

const useCard = () => {
  const { knobs, say } = useProto();
  const empty = knobs.fill === "empty";
  const [added, setAdded] = useState<Partial<Record<Key, Item[]>>>({});
  const [closing, setClosing] = useState<string[]>([]);
  const [gone, setGone] = useState<string[]>([]);
  /** Только что записанное — подсветка показывает, куда оно легло. */
  const [fresh, setFresh] = useState<string | null>(null);
  const list = (key: Key) => [...(added[key] ?? []), ...(empty ? [] : BASE[key])].filter((i) => !gone.includes(i.id));
  return {
    add: (key: Key, text: string) => {
      const id = crypto.randomUUID();
      setAdded((a) => ({ ...a, [key]: [{ id, meta: key === "history" ? "сегодня" : undefined, text }, ...(a[key] ?? [])] }));
      setFresh(id);
      say(`Записано в «${TITLE[key]}»`, () => setAdded((a) => ({ ...a, [key]: (a[key] ?? []).filter((i) => i.id !== id) })));
    },
    /** Кружок заполняется сразу, строка уходит чуть позже: видно, что нажатие принято. */
    close: (id: string) => {
      setClosing((c) => [...c, id]);
      setTimeout(() => {
        setGone((g) => [...g, id]);
        setClosing((c) => c.filter((x) => x !== id));
        say("Отмечено выполненным", () => setGone((g) => g.filter((x) => x !== id)));
      }, 450);
    },
    closing,
    empty,
    fresh,
    list,
  };
};
type Card = ReturnType<typeof useCard>;

/** Куда ложится написанное словами — как решила бы служебная модель. */
const sort = (text: string): Key => {
  const t = text.toLowerCase();
  if (/обещаю|я должен|мне нужно|согласую|пришлю/.test(t)) return "me";
  if (/обещал|должн|пришл[её]т|сделает|к пятниц|до \d/.test(t)) return "them";
  if (/встрет|созвон|виделись|говорили|вчера|сегодня/.test(t)) return "history";
  return "known";
};

const FRESH = "animate-[fresh_1400ms_ease-out]";
const CSS = `@keyframes fresh { from { background-color: color-mix(in oklab, var(--primary) 12%, transparent); } to { background-color: transparent; } }`;

const Heading = ({ children, count }: { children: React.ReactNode; count?: number }) => (
  <h3 className="text-muted-foreground flex items-baseline gap-1.5 text-xs font-medium">
    {children}
    {count ? <span className="text-muted-foreground/60 tabular-nums">{count}</span> : null}
  </h3>
);

/** Обязательство: кружок слева закрывает; срок — сразу под текстом на телефоне, рядом — на компьютере. */
const Todo = ({ item, card, n }: { item: Item; card: Card; n: number }) => {
  const closing = card.closing.includes(item.id);
  return (
    <li className={cn("-mx-2 flex items-start gap-2.5 rounded-lg px-2 py-1.5", ENTER, card.fresh === item.id && FRESH)} style={rise(n)}>
      <button
        aria-label={`Выполнено: ${item.text}`}
        className={cn(
          "group/check mt-px flex size-6 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          PRESS
        )}
        disabled={closing}
        onClick={() => card.close(item.id)}
        type="button"
      >
        <span
          className={cn(
            "flex size-[18px] items-center justify-center rounded-full border transition-colors duration-150",
            closing ? "border-foreground bg-foreground text-background" : "border-foreground/25 text-transparent group-hover/check:border-foreground/60 group-hover/check:text-foreground/50"
          )}
        >
          <Check className="size-3" strokeWidth={2.5} />
        </span>
      </button>
      <span className={cn("flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5 pt-0.5 transition-opacity duration-300", closing && "opacity-40")}>
        <span className={cn("text-sm", closing && "line-through")}>{item.text}</span>
        {item.meta && <span className={cn("text-xs tabular-nums", item.late ? "text-destructive font-medium" : "text-muted-foreground")}>{item.meta}</span>}
      </span>
    </li>
  );
};

const Todos = ({ k, card, title = TITLE[k] }: { k: "them" | "me"; card: Card; title?: string }) => {
  const items = card.list(k);
  return (
    <section className="flex flex-col gap-1.5">
      <Heading count={items.length}>{title}</Heading>
      {items.length ? (
        <ul className="flex flex-col">
          {items.map((i, n) => (
            <Todo card={card} item={i} key={i.id} n={n} />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground/70 py-1.5 text-sm">Ничего открытого</p>
      )}
    </section>
  );
};

const Known = ({ card }: { card: Card }) => {
  const items = card.list("known");
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-1.5">
      <Heading>{TITLE.known}</Heading>
      <ul className="flex flex-col">
        {items.map((i, n) => (
          <li className={cn("-mx-2 flex flex-wrap items-baseline gap-x-3 rounded-lg px-2 py-1.5 text-sm", ENTER, card.fresh === i.id && FRESH)} key={i.id} style={rise(n)}>
            {i.text}
            {i.meta && <span className="text-muted-foreground text-xs tabular-nums">{i.meta}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
};

/** Хронология: дата в левом поле одной ширины, текст справа. */
const History = ({ card }: { card: Card }) => {
  const items = card.list("history");
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-1.5">
      <Heading>{TITLE.history}</Heading>
      <ul className="flex flex-col">
        {items.map((i, n) => (
          <li className={cn("-mx-2 grid grid-cols-[3.5rem_1fr] items-baseline gap-3 rounded-lg px-2 py-1.5 text-sm", ENTER, card.fresh === i.id && FRESH)} key={i.id} style={rise(n)}>
            <span className="text-muted-foreground text-xs tabular-nums">{i.meta}</span>
            <span>{i.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};

/** Три числа вместо абзаца; линии вместо плашки. */
const Now = ({ card }: { card: Card }) => {
  const open = card.list("them").length + card.list("me").length;
  const late = card.list("them").filter((i) => i.late).length;
  const cells: [string, React.ReactNode][] = [
    ["Последняя встреча", "4 дня назад"],
    ["Один на один", "раз в 2 недели"],
    ["Открыто", open ? <>{open}{late > 0 && <span className="text-destructive">, просрочено {late}</span>}</> : "нет"],
  ];
  return (
    <dl className="grid grid-cols-3 divide-x border-y @max-md:grid-cols-1 @max-md:divide-x-0 @max-md:divide-y">
      {cells.map(([label, value], i) => (
        <div className={cn("flex flex-col gap-0.5 py-2.5 @max-md:flex-row @max-md:items-baseline @max-md:justify-between", i > 0 && "pl-4 @max-md:pl-0")} key={label}>
          <dt className="text-muted-foreground text-xs">{label}</dt>
          <dd className="text-sm font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
};

const Head = ({ card }: { card: Card }) => {
  const { say } = useProto();
  const phone = usePhone();
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(PERSON.role);
  const theirs = card.list("them").length;
  const remind = (
    <Button className={cn(PRESS, phone && "w-full")} onClick={() => say("Откроется новый чат с черновиком письма по её открытым обещаниям")} size={phone ? "default" : "sm"} variant="outline">
      <Mail /> Напомнить об открытом
    </Button>
  );
  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-start gap-3.5">
        <span aria-hidden className="bg-muted text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-full text-xs font-medium">{PERSON.initials}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="text-xl font-semibold tracking-tight">{PERSON.name}</h2>
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setEditing(false);
                say("Сохранено");
              }}
            >
              {/* biome-ignore lint/a11y/noAutofocus: opened by the person's press. */}
              <input aria-label="Кто это" autoFocus className="border-foreground/30 w-56 border-b bg-transparent text-sm outline-none" onBlur={() => setEditing(false)} onChange={(e) => setRole(e.target.value)} value={role} />
            </form>
          ) : (
            <button className="text-muted-foreground hover:text-foreground group/role flex items-center gap-1.5 self-start text-sm transition-colors duration-150" onClick={() => setEditing(true)} type="button">
              {role || "Кто это?"}
              <Pencil className="size-3 opacity-0 transition-opacity duration-150 group-hover/role:opacity-60" />
            </button>
          )}
          <p className="text-muted-foreground/80 mt-1 text-xs">{PERSON.tags.join(" · ")}</p>
        </div>
        {theirs > 0 && !phone && remind}
      </div>
      {/* На телефоне кнопка — под шапкой, во всю ширину: рядом с именем ей не хватает места. */}
      {theirs > 0 && phone && remind}
      {!card.empty && <Now card={card} />}
    </header>
  );
};

/** Тихая строка: нажал или начал печатать — поле; Enter записывает, раздел выбирается сам. */
const QuickAdd = ({ card }: { card: Card }) => {
  const [text, setText] = useState("");
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // «N» — новая запись, как в списках дел; не мешает набору в других полях.
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      e.preventDefault();
      field.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form
      className="group/add focus-within:border-foreground/30 -mx-2 flex items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 transition-colors duration-150 hover:bg-muted/40 focus-within:hover:bg-transparent"
      onSubmit={(e) => {
        e.preventDefault();
        const t = text.trim();
        if (!t) return;
        card.add(sort(t), t);
        setText("");
      }}
    >
      <span className="text-muted-foreground flex size-6 shrink-0 items-center justify-center">
        <Plus className="size-4" />
      </span>
      <input
        aria-label="Записать об Ирине Беловой"
        className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
        onChange={(e) => setText(e.target.value)}
        placeholder={card.empty ? "Записать: кто это, что обещала, когда виделись" : "Записать: «обещала отчёт к пятнице», «вчера виделись»"}
        ref={field}
        value={text}
      />
      <kbd className={cn("text-muted-foreground/70 rounded border px-1.5 text-[10px] leading-5 transition-opacity duration-150 @max-md:hidden", text ? "opacity-100" : "group-focus-within/add:opacity-0")}>
        {text ? "Enter" : "N"}
      </kbd>
    </form>
  );
};

const Page = ({ wide, children, card }: { wide?: boolean; children: React.ReactNode; card: Card }) => (
  <Shell area="memory" title="Память">
    <style>{CSS}</style>
    <div className={cn("mx-auto flex w-full flex-col gap-7 px-4 pt-20 pb-10 @max-md:gap-6 @max-md:pt-5", wide ? "max-w-3xl" : "max-w-2xl")}>
      <Head card={card} />
      <QuickAdd card={card} />
      {children}
    </div>
  </Shell>
);

// ── Варианты ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export const Column = () => {
  const card = useCard();
  return (
    <Page card={card}>
      <Todos card={card} k="them" />
      <Todos card={card} k="me" />
      <Known card={card} />
      <History card={card} />
    </Page>
  );
};

/** «Ждёте» и «обещали» рядом, ниже — известное и история рядом. */
export const Balance = () => {
  const card = useCard();
  const phone = usePhone();
  const two = cn("grid gap-x-10 gap-y-6", !phone && "grid-cols-2");
  return (
    <Page card={card} wide>
      <div className={two}>
        <Todos card={card} k="them" />
        <Todos card={card} k="me" />
      </div>
      <div className={cn(two, "border-t pt-6")}>
        <Known card={card} />
        <History card={card} />
      </div>
    </Page>
  );
};
