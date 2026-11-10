"use client";

import { Button } from "@metobe/ui/components/button";
import { Input } from "@metobe/ui/components/input";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowUp, Check, FolderKanban, Mail, Pencil, Plus, Users } from "lucide-react";
import { useState } from "react";

import { ENTER, PRESS, Shell, rise, usePhone, useProto } from "../memory/frame";

// P22 · карточка человека на странице «Память», заново. Что было не так: строки повторяют имя и подпись («Ирина
// Белова — заместитель пользователя»), нет ни проектов, ни последнего контакта, добавить самому нельзя, кнопка
// «Сверка» не объясняет, что делает. Здесь: шапка с тем, кто это (роль, группы, проекты — правятся на месте), строка
// «что сейчас» (сколько открыто, когда виделись), обязательства в две стороны, записи без имени в начале.
// «Одной колонкой» — всё подряд, внизу поле: написал словами — запись появилась (тип определяется сам).
// «С боковой» — справа «О человеке» (что известно, проекты, как часто встречаться), слева дела и история; у каждого
// раздела свой «+».
// Параметры: записей — много или пусто (новая карточка). В адресе: `?v=1&fill=empty&sz=phone`.

interface Item { id: string; text: string; meta?: string; late?: boolean }

const PERSON = { groups: ["Моя команда"], initials: "ИБ", name: "Ирина Белова", role: "Заместитель" };
const FROM_THEM: Item[] = [
  { id: "t1", late: true, meta: "просрочено на 2 дн.", text: "Доделать вторую версию портала" },
  { id: "t2", meta: "до пт, 13 ноя", text: "Прислать план работ на декабрь" },
];
const FROM_ME: Item[] = [{ id: "m1", meta: "до ср, 11 ноя", text: "Согласовать её отпуск на январь" }];
const KNOWN: Item[] = [
  { id: "k1", text: "Сильна в переговорах с поставщиками" },
  { id: "k2", text: "Предпочитает короткие сообщения, не звонки" },
  { id: "k3", meta: "с 3 ноя", text: "Ведёт вторую версию портала" },
];
const PROJECTS = ["Портал, вторая версия", "Склад 2.0"];
const HISTORY: Item[] = [
  { id: "h1", meta: "6 ноя", text: "Встреча один на один: обсудили сроки портала" },
  { id: "h2", meta: "28 окт", text: "Созвон с поставщиком, вела переговоры" },
  { id: "h3", meta: "14 окт", text: "Встреча один на один" },
];

const useCard = () => {
  const { knobs, say } = useProto();
  const empty = knobs.fill === "empty";
  const [added, setAdded] = useState<Record<string, Item[]>>({});
  const [done, setDone] = useState<string[]>([]);
  const list = (key: string, base: Item[]) => [...(added[key] ?? []), ...(empty ? [] : base)].filter((i) => !done.includes(i.id));
  return {
    add: (key: string, text: string, note: string) => {
      const id = crypto.randomUUID();
      setAdded((a) => ({ ...a, [key]: [{ id, meta: "сейчас", text }, ...(a[key] ?? [])] }));
      say(note, () => setAdded((a) => ({ ...a, [key]: (a[key] ?? []).filter((i) => i.id !== id) })));
    },
    close: (id: string) => {
      setDone((d) => [...d, id]);
      say("Отмечено выполненным", () => setDone((d) => d.filter((x) => x !== id)));
    },
    empty,
    list,
  };
};
type Card = ReturnType<typeof useCard>;

/** Куда ложится написанное словами: по первым словам — как это сделала бы служебная модель. */
const sort = (text: string) => {
  const t = text.toLowerCase();
  if (/обещал|должн|пришл[её]т|сделает|к пятниц|до \d/.test(t)) return ["them", "Записано: обязательство"] as const;
  if (/обещаю|я должен|мне нужно|согласую/.test(t)) return ["me", "Записано: ваше обязательство"] as const;
  if (/встрет|созвон|виделись|говорили|вчера|сегодня/.test(t)) return ["history", "Записано: событие"] as const;
  return ["known", "Записано: что известно"] as const;
};

const Line = ({ item, n, onDone }: { item: Item; n: number; onDone?: () => void }) => (
  <li className={cn("group flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/40", ENTER)} style={rise(n)}>
    <span className="min-w-0 flex-1 text-sm">{item.text}</span>
    {item.meta && (
      <span className={cn("text-muted-foreground shrink-0 pt-0.5 text-xs tabular-nums", item.late && "text-destructive")}>{item.meta}</span>
    )}
    {onDone && (
      <Button aria-label="Выполнено" className={cn("opacity-50 group-hover:opacity-100", PRESS)} onClick={onDone} size="icon-xs" variant="ghost">
        <Check />
      </Button>
    )}
  </li>
);

/** Раздел; `onAdd` — свой «+»: поле на месте, Enter записывает. */
const Section = ({ title, hint, items, onDone, onAdd, placeholder }: {
  title: string; hint?: string; items: Item[]; onDone?: (id: string) => void; onAdd?: (text: string) => void; placeholder?: string;
}) => {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  if (!(items.length || onAdd)) return null;
  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 px-2">
        <h3 className="text-muted-foreground text-xs font-medium">
          {title}
          {items.length > 0 && <span className="ml-1.5 tabular-nums">{items.length}</span>}
        </h3>
        {onAdd && !adding && (
          <Button aria-label={`Добавить: ${title}`} className="text-muted-foreground -my-1" onClick={() => setAdding(true)} size="icon-xs" variant="ghost">
            <Plus />
          </Button>
        )}
      </div>
      {adding && (
        <form
          className="px-2 py-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) onAdd?.(text.trim());
            setText("");
            setAdding(false);
          }}
        >
          {/* biome-ignore lint/a11y/noAutofocus: the field opens on the person's own press. */}
          <Input aria-label={title} autoFocus className="h-8" onBlur={() => !text && setAdding(false)} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setAdding(false)} placeholder={placeholder} value={text} />
        </form>
      )}
      {items.length > 0 ? (
        <ul className="flex flex-col">
          {items.map((i, n) => (
            <Line item={i} key={i.id} n={n} onDone={onDone && (() => onDone(i.id))} />
          ))}
        </ul>
      ) : (
        !adding && hint && <p className="text-muted-foreground px-2 py-1 text-sm">{hint}</p>
      )}
    </section>
  );
};

const Chip = ({ icon: Icon, children }: { icon: typeof Users; children: React.ReactNode }) => (
  <span className="bg-muted/60 text-foreground/80 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs">
    <Icon className="text-muted-foreground size-3" />
    {children}
  </span>
);

/** Кто это: имя и роль правятся нажатием; группы и проекты — ссылки на их карточки. */
const Head = ({ card, projects = true }: { card: Card; projects?: boolean }) => {
  const { say } = useProto();
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(PERSON.role);
  const open = card.list("them", FROM_THEM).length;
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span aria-hidden className="bg-muted text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-full text-xs font-medium">{PERSON.initials}</span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="text-lg font-semibold tracking-tight">{PERSON.name}</h2>
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setEditing(false);
                say("Сохранено");
              }}
            >
              {/* biome-ignore lint/a11y/noAutofocus: opened by the person's press. */}
              <Input aria-label="Кто это" autoFocus className="mt-0.5 h-7 max-w-64" onBlur={() => setEditing(false)} onChange={(e) => setRole(e.target.value)} value={role} />
            </form>
          ) : (
            <button className="text-muted-foreground hover:text-foreground group/role flex items-center gap-1.5 self-start text-sm transition-colors duration-150" onClick={() => setEditing(true)} type="button">
              {role || "Кто это?"}
              <Pencil className="size-3 opacity-0 transition-opacity duration-150 group-hover/role:opacity-100" />
            </button>
          )}
        </div>
        {open > 0 && (
          <Button className={PRESS} onClick={() => say("Откроется новый чат: «Составь письмо Ирине Беловой по открытым обещаниям: …»")} size="sm" title="Новый чат с черновиком письма по всем её открытым обещаниям" variant="outline">
            <Mail /> Напомнить об открытом · {open}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PERSON.groups.map((g) => (
          <Chip icon={Users} key={g}>{g}</Chip>
        ))}
        {projects && !card.empty && PROJECTS.map((p) => <Chip icon={FolderKanban} key={p}>{p}</Chip>)}
      </div>
      {!card.empty && (
        // Что сейчас: то, ради чего карточку открывают перед разговором.
        <p className="bg-muted/40 rounded-lg px-3 py-2 text-sm">
          Виделись <span className="font-medium">4 дня назад</span>, один на один — раз в 2 недели.{" "}
          <span className="text-destructive">Одно обещание просрочено.</span>
        </p>
      )}
    </header>
  );
};

const EMPTY_HINT = "Пока ничего. Запишите сами или расскажите в чате.";

// ── Варианты ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Всё подряд; добавление — одно поле внизу, словами. */
export const OneColumn = () => {
  const card = useCard();
  const [text, setText] = useState("");
  const send = () => {
    const t = text.trim();
    if (!t) return;
    const [key, note] = sort(t);
    card.add(key, t, note);
    setText("");
  };
  return (
    <Shell area="memory" title="Память">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 pt-20 pb-6 @max-md:pt-5">
        <Head card={card} />
        <Section items={card.list("them", FROM_THEM)} onDone={card.close} title="Ждёте от неё" />
        <Section items={card.list("me", FROM_ME)} onDone={card.close} title="Вы обещали" />
        <Section hint={card.empty ? EMPTY_HINT : undefined} items={card.list("known", KNOWN)} title="Известно" />
        <Section items={card.list("history", HISTORY)} title="История" />
      </div>
      <div className="bg-background sticky bottom-0 mx-auto w-full max-w-2xl px-4 pt-2 pb-4">
        <form
          className="focus-within:ring-ring/20 flex items-end gap-1 rounded-3xl border p-1.5 pl-4 shadow-xs transition-shadow duration-150 focus-within:ring-3"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            aria-label="Записать об Ирине Беловой"
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none"
            onChange={(e) => setText(e.target.value)}
            placeholder="Записать об Ирине: «обещала отчёт к пятнице», «вчера виделись», «сильна в SQL»"
            value={text}
          />
          <Button aria-label="Записать" className={cn("rounded-full", PRESS)} disabled={!text.trim()} size="icon" type="submit">
            <ArrowUp />
          </Button>
        </form>
      </div>
    </Shell>
  );
};

/** Слева дела и история, справа — кто это; у каждого раздела свой «+». */
export const WithSide = () => {
  const card = useCard();
  const phone = usePhone();
  const about = (
    <aside className={cn("flex shrink-0 flex-col gap-5", !phone && "w-64 border-l pl-6")}>
      <Section hint="Что о ней стоит помнить" items={card.list("known", KNOWN)} onAdd={(t) => card.add("known", t, "Записано")} placeholder="Сильна в переговорах" title="Известно" />
      {!card.empty && (
        <section className="flex flex-col gap-1.5 px-2">
          <h3 className="text-muted-foreground text-xs font-medium">Проекты</h3>
          <div className="flex flex-wrap gap-1.5">
            {PROJECTS.map((p) => (
              <Chip icon={FolderKanban} key={p}>{p}</Chip>
            ))}
          </div>
        </section>
      )}
      <section className="flex flex-col gap-1 px-2">
        <h3 className="text-muted-foreground text-xs font-medium">Встречи один на один</h3>
        <p className="text-sm">Раз в 2 недели</p>
        <p className="text-muted-foreground text-xs">Правило для группы «Моя команда»</p>
      </section>
    </aside>
  );
  return (
    <Shell area="memory" title="Память">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 pt-20 pb-8 @max-md:pt-5">
        <Head card={card} projects={false} />
        <div className={cn("flex gap-6", phone && "flex-col")}>
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <Section hint="Нет открытых" items={card.list("them", FROM_THEM)} onAdd={(t) => card.add("them", t, "Записано: обязательство")} onDone={card.close} placeholder="Прислать отчёт к пятнице" title="Ждёте от неё" />
            <Section hint="Нет открытых" items={card.list("me", FROM_ME)} onAdd={(t) => card.add("me", t, "Записано: ваше обязательство")} onDone={card.close} placeholder="Согласовать бюджет до среды" title="Вы обещали" />
            <Section hint="Встреч и разговоров пока нет" items={card.list("history", HISTORY)} onAdd={(t) => card.add("history", t, "Записано: событие")} placeholder="Вчера виделись, обсудили сроки" title="История" />
          </div>
          {about}
        </div>
      </div>
    </Shell>
  );
};
