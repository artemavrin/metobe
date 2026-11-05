"use client";

import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import { createContext, use, useEffect, useState } from "react";

import { PRESS, Shell } from "../first-agent/frame";
import { InChat, SlotComposer } from "../first-agent/round3";
import { useProto } from "../first-agent/state";
import { Mark } from "../task-results/variants";
import { LISTS, sorted } from "./data";
import type { Item } from "./data";

// P13 · список задач — страница «Задачи» из боковой панели. Без задач это экран «Что поручить?» из P11 (выбран), здесь
// он и показан. С задачами — список; внизу то же поле, что на экране «Что поручить?»: новая задача начинается словами.
// «Строки» — по строке на задачу: имя и расписание, итог последнего запуска, следующий запуск, выключатель.
// «Карточки» — то же сеткой, итог крупнее.
// «По вниманию» — строки, разложенные по тому, что с ними делать: нужно действие, новые итоги, остальные, выключенные.

type Count = keyof typeof LISTS;

const Many = createContext<{ count: Count; setCount: (c: Count) => void }>(null as never);

export const CountProvider = ({ children }: { children: React.ReactNode }) => {
  const [count, setCountState] = useState<Count>("7");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("n");
    if (q === "0" || q === "3" || q === "7") setCountState(q);
  }, []);
  const setCount = (c: Count) => {
    setCountState(c);
    const url = new URL(window.location.href);
    url.searchParams.set("n", c);
    window.history.replaceState(null, "", url);
  };
  return <Many value={{ count, setCount }}>{children}</Many>;
};

const Chip = ({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) => (
  <button
    aria-pressed={active}
    className={cn("rounded-full px-2.5 py-1 transition-colors duration-150", active ? "bg-white/15 text-white" : "text-white/55 hover:text-white/85")}
    onClick={onClick}
    type="button"
  >
    {children}
  </button>
);

export const Params = () => {
  const { screen, setScreen } = useProto();
  const { count, setCount } = use(Many);
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <span>экран</span>
        <div className="flex gap-1">
          <Chip active={screen === "desktop"} onClick={() => setScreen("desktop")}>компьютер</Chip>
          <Chip active={screen === "phone"} onClick={() => setScreen("phone")}>телефон</Chip>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span>задач</span>
        <div className="flex gap-1">
          {(["0", "3", "7"] as const).map((c) => (
            <Chip active={count === c} key={c} onClick={() => setCount(c)}>{c === "0" ? "нет" : c}</Chip>
          ))}
        </div>
      </div>
    </>
  );
};

// ── Общее ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Выключатель у каждой задачи; выключенная остаётся в списке, но не запускается. */
const useEnabled = (items: Item[]) => {
  const [on, setOn] = useState<Record<string, boolean>>({});
  return {
    enabled: (it: Item) => on[it.id] ?? it.enabled,
    toggle: (it: Item, v: boolean) => setOn((o) => ({ ...o, [it.id]: v })),
    items,
  };
};

/** Строка задачи — ссылка на её страницу; выключатель вне ссылки. */
const Open = ({ item, className, children }: { item: Item; className?: string; children: React.ReactNode }) => {
  const { say } = useProto();
  return item.href ? (
    <a className={className} href={item.href}>
      {children}
    </a>
  ) : (
    <button className={cn("text-left", className)} onClick={() => say("Страница задачи — как в /task-edit")} type="button">
      {children}
    </button>
  );
};

const Last = ({ item, color }: { item: Item; color: string }) => (
  <span className={cn("flex min-w-0 items-center gap-2", item.last.outcome === "quiet" ? "text-muted-foreground" : item.unread && "font-medium")}>
    <Mark color={color} outcome={item.last.outcome} />
    <span className="truncate">{item.last.summary}</span>
  </span>
);

const Page = ({ children, items }: { children: React.ReactNode; items: Item[] }) => {
  const { say } = useProto();
  const [text, setText] = useState("");
  return (
    <Shell area="agents" tasks={items.map((it) => ({ color: it.color, name: it.name, unread: it.unread }))} title="Задачи">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 pt-20 pb-6 @max-md:pt-6">
        <header className="flex items-baseline gap-2 @max-md:hidden">
          <h1 className="text-xl font-semibold tracking-tight">Задачи</h1>
          <span className="text-muted-foreground text-sm tabular-nums">{items.length}</span>
        </header>
        {children}
      </div>
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 pt-2 pb-3 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl px-4">
          <SlotComposer
            busy={false}
            onChange={setText}
            onSend={() => {
              setText("");
              say("Откроется настройка новой задачи, как в /first-agent");
            }}
            placeholder="Новая задача: что делать и когда"
            value={text}
          />
        </div>
      </div>
    </Shell>
  );
};

const Row = ({ item, enabled, onToggle }: { item: Item; enabled: boolean; onToggle: (v: boolean) => void }) => (
  <div className={cn("group flex items-center gap-3 border-b px-3 last:border-b-0", !enabled && "opacity-60")}>
    <Open
      className="hover:bg-muted/40 -mx-3 grid min-w-0 flex-1 grid-cols-[minmax(0,14rem)_minmax(0,1fr)_8.5rem] items-center gap-4 px-3 py-3 text-sm transition-colors duration-150 @max-md:grid-cols-1 @max-md:gap-1"
      item={item}
    >
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-2 font-medium">
          <span className="size-2 shrink-0 rounded-full" style={{ background: item.color }} />
          <span className="truncate">{item.name}</span>
          {item.unread && <span aria-label="новый итог" className="bg-foreground size-1.5 shrink-0 rounded-full" />}
        </span>
        <span className="text-muted-foreground truncate pl-4 text-xs">{item.schedule}</span>
      </span>
      <span className="@max-md:pl-4">
        <Last color={item.color} item={item} />
      </span>
      <span className="text-muted-foreground text-xs tabular-nums @max-md:pl-4">{enabled && item.next ? `след. ${item.next}` : "выключена"}</span>
    </Open>
    <Switch aria-label={`Задача «${item.name}» включена`} checked={enabled} onCheckedChange={onToggle} />
  </div>
);

const Rows = ({ items, e }: { items: Item[]; e: ReturnType<typeof useEnabled> }) => (
  <div className="bg-card overflow-hidden rounded-xl border">
    {items.map((it) => (
      <Row enabled={e.enabled(it)} item={it} key={it.id} onToggle={(v) => e.toggle(it, v)} />
    ))}
  </div>
);

// ── Варианты ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export const Lines = () => {
  const { count } = use(Many);
  const items = sorted(LISTS[count]);
  const e = useEnabled(items);
  if (items.length === 0) return <InChat />;
  return (
    <Page items={items}>
      <Rows e={e} items={items} />
    </Page>
  );
};

export const Cards = () => {
  const { count } = use(Many);
  const items = sorted(LISTS[count]);
  const e = useEnabled(items);
  if (items.length === 0) return <InChat />;
  return (
    <Page items={items}>
      <div className="grid grid-cols-2 gap-3 @max-md:grid-cols-1">
        {items.map((it) => {
          const on = e.enabled(it);
          return (
            <article className={cn("bg-card flex flex-col gap-3 rounded-xl border p-4", !on && "opacity-60")} key={it.id}>
              <header className="flex items-center gap-2">
                <span className="size-2 shrink-0 rounded-full" style={{ background: it.color }} />
                <Open className={cn("min-w-0 flex-1 truncate font-medium hover:underline", PRESS)} item={it}>
                  {it.name}
                </Open>
                {it.unread && <span aria-label="новый итог" className="bg-foreground size-1.5 shrink-0 rounded-full" />}
                <Switch aria-label={`Задача «${it.name}» включена`} checked={on} onCheckedChange={(v) => e.toggle(it, v)} />
              </header>
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground text-xs">Последний запуск · {it.last.day}</span>
                <Last color={it.color} item={it} />
              </div>
              <footer className="text-muted-foreground mt-auto flex items-center justify-between gap-2 border-t pt-2.5 text-xs">
                <span className="truncate">{it.schedule}</span>
                <span className="shrink-0 tabular-nums">{on && it.next ? `след. ${it.next}` : "выключена"}</span>
              </footer>
            </article>
          );
        })}
      </div>
    </Page>
  );
};

export const Attention = () => {
  const { count } = use(Many);
  const items = sorted(LISTS[count]);
  const e = useEnabled(items);
  if (items.length === 0) return <InChat />;
  const groups: { title: string; items: Item[] }[] = [
    { items: items.filter((it) => e.enabled(it) && it.last.outcome === "failed"), title: "Нужно действие" },
    { items: items.filter((it) => e.enabled(it) && it.last.outcome !== "failed" && it.unread), title: "Новые итоги" },
    { items: items.filter((it) => e.enabled(it) && it.last.outcome !== "failed" && !it.unread), title: "Остальные" },
    { items: items.filter((it) => !e.enabled(it)), title: "Выключены" },
  ];
  return (
    <Page items={items}>
      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <section className="flex flex-col gap-2" key={g.title}>
            <h2 className="text-muted-foreground flex items-center gap-1 px-1 text-xs">
              {g.title}
              <span className="tabular-nums">· {g.items.length}</span>
            </h2>
            <Rows e={e} items={g.items} />
          </section>
        ))}
    </Page>
  );
};
