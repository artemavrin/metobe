"use client";

import { Button } from "@metobe/ui/components/button";
import { Kbd } from "@metobe/ui/components/kbd";
import { cn } from "@metobe/ui/lib/utils";
import { Archive, ArrowUp, Check, ChevronDown, CircleHelp, ExternalLink, FileText, Inbox, Pause, Send, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createContext, use, useEffect, useState } from "react";
import { Streamdown } from "streamdown";

import { BrandLogo } from "@/components/brand-logo";
import { agentOf } from "../agents/data";
import { dayOf, OUTCOME, Page, Panel, Shell, timeOf, usePhone, whenOf } from "../agents/parts";
import { useProto } from "../agents/state";
import { ITEMS, needsYou } from "./data";
import type { Item, Kind } from "./data";

// Три варианта P12. «Лента» — как в §16.4: одна лента по дням, фильтры, у пунктов, которые ждут вас, кнопки прямо в
// ленте, j/k/e/Enter. «Почта» — список слева, пункт целиком справа (ReUI «Approval Inbox»). «Сначала решения» — то,
// что ждёт вас, развёрнуто сверху; сводки ниже свёрнуты по агенту: одна строка на агента, а не десять на день.

// ── Состояние ────────────────────────────────────────────────────────────────────────────────────────────────────────

interface Ctx {
  items: Item[];
  /** Что человек уже решил: «Отправлено», «Подключено». */
  resolved: Record<string, string>;
  read: (id: string) => void;
  archive: (id: string) => void;
  resolve: (id: string, text: string) => void;
}

const Store = createContext<Ctx>(null as never);

export const InboxProvider = ({ children }: { children: React.ReactNode }) => {
  const { empty } = useProto();
  const [items, setItems] = useState(ITEMS);
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const value: Ctx = {
    archive: (id) => setItems((list) => list.filter((it) => it.id !== id)),
    items: empty ? [] : items,
    read: (id) => setItems((list) => list.map((it) => (it.id === id ? { ...it, read: true } : it))),
    resolve: (id, text) => setResolved((r) => ({ ...r, [id]: text })),
    resolved,
  };
  return <Store value={value}>{children}</Store>;
};

const useInbox = () => use(Store);
const waits = (it: Item, resolved: Record<string, string>) => needsYou(it) && !resolved[it.id];

// ── Части ────────────────────────────────────────────────────────────────────────────────────────────────────────────

const KIND: Record<Kind, { label: string; icon: LucideIcon; text: string }> = {
  alert: { icon: TriangleAlert, label: "Сбой", text: "text-destructive" },
  notify: { icon: FileText, label: "Сводка", text: "text-muted-foreground" },
  question: { icon: CircleHelp, label: "Вопрос", text: "text-warning" },
  review: { icon: Send, label: "Подтвердить", text: "text-warning" },
};

const Avatar = ({ item, size = 32 }: { item: Item; size?: number }) => <BrandLogo label={agentOf(item.agentId).name} logo={undefined} size={size} />;

/** «Счета без оплаты · Подтвердить · 10:01» — у сводки вместо вида её исход, если он не «сделано». */
const Byline = ({ item, time = true }: { item: Item; time?: boolean }) => {
  const k = KIND[item.kind];
  const attention = item.outcome === "attention";
  return (
    <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
      <span className="truncate">{agentOf(item.agentId).name}</span>
      {item.kind !== "notify" && (
        <span className={cn("flex shrink-0 items-center gap-1", k.text)}>
          · <k.icon className="size-3" />
          {k.label}
        </span>
      )}
      {attention && <span className="text-warning shrink-0">· {OUTCOME.attention.label}</span>}
      {time && <span className="ml-auto shrink-0 tabular-nums">{timeOf(item.at)}</span>}
    </span>
  );
};

const runHref = (it: Item) => `/dev/prototypes/agents/round-1?v=2&a=${it.agentId}&r=${it.runId}`;

const LetterBox = ({ letter }: { letter: NonNullable<Item["letter"]> }) => (
  <div className="bg-background flex flex-col gap-2 rounded-lg border p-3 text-sm">
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      <dt className="text-muted-foreground">Кому</dt>
      <dd className="font-mono">{letter.to}</dd>
      <dt className="text-muted-foreground">Тема</dt>
      <dd>{letter.subject}</dd>
    </dl>
    <p className="text-muted-foreground border-t pt-2 text-xs leading-relaxed whitespace-pre-line">{letter.body}</p>
  </div>
);

/** Кнопки пункта, который ждёт вас; после решения — строка о том, что сделано. */
const Decide = ({ item, size = "sm" }: { item: Item; size?: "sm" | "xs" }) => {
  const { resolved, resolve } = useInbox();
  const { say } = useProto();
  const done = resolved[item.id];
  if (done) {
    return (
      <span className="text-success flex items-center gap-1.5 text-sm">
        <Check className="size-4" />
        {done}
      </span>
    );
  }
  if (!needsYou(item)) return null;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  if (item.kind === "review") {
    return (
      <span className="flex gap-2" onClick={stop}>
        <Button onClick={() => resolve(item.id, "Не отправлено — агент закончил без письма")} size={size} variant="ghost">
          Не отправлять
        </Button>
        <Button onClick={() => resolve(item.id, "Отправлено в 10:43")} size={size}>
          Отправить
        </Button>
      </span>
    );
  }
  if (item.kind === "question") {
    return (
      <span className="flex gap-2" onClick={stop}>
        <Button onClick={() => resolve(item.id, "Подключено — запуск в пн в 8:00")} size={size}>
          Подключить «Битрикс24»
        </Button>
      </span>
    );
  }
  return (
    <span className="flex flex-wrap gap-2" onClick={stop}>
      <Button onClick={() => say("Откроется чат агента: «уберите mebelgrad.ru из списка» — и карточка «было → стало»")} size={size} variant="outline">
        Изменить задание
      </Button>
      <Button onClick={() => resolve(item.id, "Включён — запуск завтра в 8:00")} size={size} variant="ghost">
        Включить снова
      </Button>
    </span>
  );
};

/** Ответ агенту: продолжение разговора в чате запуска. */
const Reply = () => {
  const { say } = useProto();
  const [text, setText] = useState("");
  return (
    <form
      className="flex items-end gap-2 rounded-xl border p-1.5 pl-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        say("Ответ ушёл в чат запуска — если это правка агента, придёт карточка «было → стало»");
        setText("");
      }}
    >
      <input className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent py-1 text-sm outline-none" onChange={(e) => setText(e.target.value)} placeholder="Ответить агенту…" value={text} />
      <Button aria-label="Ответить" disabled={!text.trim()} size="icon-xs" type="submit">
        <ArrowUp />
      </Button>
    </form>
  );
};

/** Пункт целиком: что пришло, письмо или отчёт, кнопки, ответ, ссылка на запуск. */
const Full = ({ item }: { item: Item }) => {
  const { archive } = useInbox();
  const { say } = useProto();
  return (
    <div className="flex flex-col gap-4">
      {item.letter ? <LetterBox letter={item.letter} /> : null}
      {item.report ? (
        <div className="text-sm leading-relaxed [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
          <Streamdown>{item.report}</Streamdown>
        </div>
      ) : (
        !item.letter && <p className="text-sm leading-relaxed">{item.text}</p>
      )}
      {item.letter && <p className="text-muted-foreground text-sm">{item.text}</p>}
      <Decide item={item} />
      <Reply />
      <div className="text-muted-foreground flex flex-wrap items-center gap-1 border-t pt-3 text-sm">
        <Button nativeButton={false} render={<a href={runHref(item)} />} size="sm" variant="ghost">
          <ExternalLink />
          Открыть запуск
        </Button>
        <Button onClick={() => archive(item.id)} size="sm" variant="ghost">
          <Archive />В архив
        </Button>
        <Button onClick={() => say(`«${agentOf(item.agentId).name}» на паузе — запусков по расписанию не будет`)} size="sm" variant="ghost">
          <Pause />
          Пауза агента
        </Button>
      </div>
    </div>
  );
};

const FullTitle = ({ item }: { item: Item }) => (
  <div className="flex items-start gap-3">
    <Avatar item={item} />
    <div className="flex min-w-0 flex-col gap-0.5">
      <Byline item={item} time={false} />
      <h2 className="text-base font-semibold">{item.title}</h2>
      <span className="text-muted-foreground text-xs">{whenOf(item.at)}</span>
    </div>
  </div>
);

const Empty = () => (
  <div className="flex flex-col items-center gap-2 py-20 text-center">
    <span className="bg-muted grid size-11 place-items-center rounded-xl">
      <Inbox className="size-5" />
    </span>
    <h2 className="font-semibold">Пока пусто</h2>
    <p className="text-muted-foreground max-w-xs text-sm text-balance">Сюда агенты присылают итоги, вопросы и то, что нужно подтвердить. «Ничего нового» сюда не попадает.</p>
  </div>
);

type Filter = "all" | "waits" | "unread";

const Filters = ({ value, onChange }: { value: Filter; onChange: (f: Filter) => void }) => {
  const { items, resolved } = useInbox();
  const list: [Filter, string, number][] = [
    ["all", "Все", items.length],
    ["waits", "Ждут вас", items.filter((it) => waits(it, resolved)).length],
    ["unread", "Непрочитанные", items.filter((it) => !it.read).length],
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map(([id, label, n]) => (
        <button
          className={cn("rounded-full border px-3 py-1 text-sm transition-colors", value === id ? "bg-foreground text-background border-foreground" : "hover:bg-muted")}
          key={id}
          onClick={() => onChange(id)}
          type="button"
        >
          {label} <span className="tabular-nums opacity-60">{n}</span>
        </button>
      ))}
    </div>
  );
};

const applyFilter = (items: Item[], f: Filter, resolved: Record<string, string>) =>
  items.filter((it) => (f === "waits" ? waits(it, resolved) : f === "unread" ? !it.read : true));

const byDay = (items: Item[]) => {
  const days = new Map<string, Item[]>();
  for (const it of [...items].sort((a, b) => b.at.localeCompare(a.at))) days.set(dayOf(it.at), [...(days.get(dayOf(it.at)) ?? []), it]);
  return [...days];
};

/** j/k — по списку, e — в архив, Enter — открыть. Не в полях ввода. */
const useKeys = (ids: string[], current: string | null, set: (id: string) => void, open: (id: string) => void) => {
  const { archive } = useInbox();
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA)$/u.test(t.tagName) || e.metaKey || e.ctrlKey) return;
      const i = current ? ids.indexOf(current) : -1;
      if (e.key === "j") set(ids[Math.min(ids.length - 1, i + 1)] ?? "");
      else if (e.key === "k") set(ids[Math.max(0, i - 1)] ?? "");
      else if (e.key === "e" && current) {
        archive(current);
        set(ids[i + 1] ?? ids[i - 1] ?? "");
      } else if (e.key === "Enter" && current) open(current);
    };
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, [ids, current, set, open, archive]);
};

const Head = ({ children, keys = true }: { children?: React.ReactNode; keys?: boolean }) => {
  const phone = usePhone();
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Входящие</h1>
        {!phone && keys && (
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <Kbd>j</Kbd>
            <Kbd>k</Kbd> по списку · <Kbd>e</Kbd> в архив · <Kbd>↵</Kbd> открыть
          </span>
        )}
      </div>
      {children}
    </header>
  );
};

// ── Лента ────────────────────────────────────────────────────────────────────────────────────────────────────────────

const FeedCard = ({ item, focused, onOpen }: { item: Item; focused: boolean; onOpen: () => void }) => {
  const { archive } = useInbox();
  return (
    <div className={cn("group hover:bg-muted/40 relative flex gap-3 rounded-xl px-3 py-3 transition-colors", focused && "bg-muted/60 ring-ring/40 ring-2")}>
      <button aria-label={item.title} className="absolute inset-0 rounded-xl" onClick={onOpen} type="button" />
      <span className="relative">
        <Avatar item={item} />
        {!item.read && <span className="bg-primary ring-background absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2" />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Byline item={item} />
        <span className={cn("text-sm", !item.read && "font-semibold")}>{item.title}</span>
        <span className="text-muted-foreground line-clamp-3 text-sm">{item.text}</span>
        {(needsYou(item) || item.letter) && (
          <div className="relative z-10 mt-1.5 flex flex-col gap-2">
            {item.letter && <LetterBox letter={item.letter} />}
            <Decide item={item} />
          </div>
        )}
      </div>
      <Button aria-label="В архив" className="relative z-10 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" onClick={() => archive(item.id)} size="icon-xs" variant="ghost">
        <Archive />
      </Button>
    </div>
  );
};

export const Feed = () => {
  const { items, read, resolved } = useInbox();
  const [filter, setFilter] = useState<Filter>("all");
  const [focus, setFocus] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const list = applyFilter(items, filter, resolved);
  const show = (id: string) => {
    read(id);
    setOpen(id);
  };
  useKeys(
    byDay(list).flatMap(([, its]) => its.map((it) => it.id)),
    focus,
    setFocus,
    show
  );
  const opened = items.find((it) => it.id === open);
  return (
    <Shell area="inbox" panel={opened && <Panel onClose={() => setOpen(null)} open title={<FullTitle item={opened} />}><Full item={opened} /></Panel>} title="">
      <Page>
        <Head>
          <Filters onChange={setFilter} value={filter} />
        </Head>
        {list.length === 0 ? (
          <Empty />
        ) : (
          byDay(list).map(([day, its]) => (
            <section className="-mx-3 flex flex-col gap-1" key={day}>
              <h2 className="text-muted-foreground px-3 text-xs font-medium">{day}</h2>
              {its.map((it) => (
                <FeedCard focused={focus === it.id} item={it} key={it.id} onOpen={() => show(it.id)} />
              ))}
            </section>
          ))
        )}
      </Page>
    </Shell>
  );
};

// ── Почта ────────────────────────────────────────────────────────────────────────────────────────────────────────────

const MailRow = ({ item, active, onOpen }: { item: Item; active: boolean; onOpen: () => void }) => {
  const { resolved } = useInbox();
  return (
    <button className={cn("flex w-full gap-3 border-b px-4 py-3 text-left transition-colors", active ? "bg-muted" : "hover:bg-muted/50")} onClick={onOpen} type="button">
      <span className="relative mt-0.5">
        <Avatar item={item} size={28} />
        {!item.read && <span className="bg-primary ring-background absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Byline item={item} />
        <span className={cn("truncate text-sm", !item.read && "font-semibold")}>{item.title}</span>
        <span className="text-muted-foreground line-clamp-2 text-xs">{resolved[item.id] ?? item.text}</span>
      </span>
    </button>
  );
};

export const Mail = () => {
  const { items, read, resolved } = useInbox();
  const phone = usePhone();
  const [filter, setFilter] = useState<Filter>("all");
  const list = byDay(applyFilter(items, filter, resolved)).flatMap(([, its]) => its);
  const [sel, setSel] = useState<string | null>(phone ? null : (list[0]?.id ?? null));
  const pick = (id: string) => {
    read(id);
    setSel(id);
  };
  useKeys(
    list.map((it) => it.id),
    sel,
    pick,
    pick
  );
  const current = items.find((it) => it.id === sel);
  if (phone && current) {
    return (
      <Shell area="inbox" back={() => setSel(null)} title="Входящие">
        <div className="flex flex-col gap-4 p-4 pb-28">
          <FullTitle item={current} />
          <Full item={current} />
        </div>
      </Shell>
    );
  }
  const listCol = (
    <div className={cn("flex flex-col", !phone && "h-full w-[24rem] shrink-0 border-r")}>
      <div className="flex flex-col gap-3 border-b px-4 pt-5 pb-3">
        <h1 className="text-xl font-semibold tracking-tight">Входящие</h1>
        <Filters onChange={setFilter} value={filter} />
      </div>
      <div className={cn(!phone && "min-h-0 flex-1 overflow-y-auto")}>
        {list.length === 0 ? <Empty /> : list.map((it) => <MailRow active={sel === it.id} item={it} key={it.id} onOpen={() => pick(it.id)} />)}
      </div>
    </div>
  );
  if (phone) {
    return (
      <Shell area="inbox" title="">
        <div className="pb-28">{listCol}</div>
      </Shell>
    );
  }
  return (
    <Shell area="inbox" title="">
      <div className="flex h-full">
        {listCol}
        <div className="min-w-0 flex-1 overflow-y-auto">
          {current ? (
            <div className="mx-auto flex max-w-2xl flex-col gap-5 px-8 pt-8 pb-32">
              <FullTitle item={current} />
              <Full item={current} />
            </div>
          ) : (
            <p className="text-muted-foreground p-8 text-sm">Выберите пункт слева</p>
          )}
        </div>
      </div>
    </Shell>
  );
};

// ── Сначала решения ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Пункт, который ждёт вас: развёрнут, с письмом и кнопками; решённый сжимается до строки. */
const Decision = ({ item, onOpen }: { item: Item; onOpen: () => void }) => {
  const { resolved } = useInbox();
  const phone = usePhone();
  const done = resolved[item.id];
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border p-4 transition-colors", item.kind === "alert" ? "border-destructive/30" : "border-warning/40", done && "bg-muted/30 border-border")}>
      <button className="flex items-start gap-3 text-left" onClick={onOpen} type="button">
        <Avatar item={item} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Byline item={item} time={phone} />
          <span className="font-medium">{item.title}</span>
          {!done && <span className="text-muted-foreground text-sm">{item.text}</span>}
        </span>
        {!phone && <span className="text-muted-foreground shrink-0 text-xs">{whenOf(item.at)}</span>}
      </button>
      {!done && item.letter && <LetterBox letter={item.letter} />}
      <div className="flex justify-end">
        <Decide item={item} />
      </div>
    </div>
  );
};

/** Сводки одного агента: последняя видна, остальные — по нажатию. */
const AgentDigest = ({ items, onOpen }: { items: Item[]; onOpen: (id: string) => void }) => {
  const [open, setOpen] = useState(false);
  const [last, ...rest] = items;
  if (!last) return null;
  const unread = items.filter((it) => !it.read).length;
  return (
    <li className="flex flex-col">
      <div className="flex items-start gap-3 px-3 py-3">
        <Avatar item={last} />
        <button className="flex min-w-0 flex-1 flex-col gap-0.5 text-left" onClick={() => onOpen(last.id)} type="button">
          <Byline item={last} time={false} />
          <span className={cn("text-sm", !last.read && "font-semibold")}>{last.title}</span>
          <span className="text-muted-foreground line-clamp-2 text-sm">{last.text}</span>
        </button>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-muted-foreground text-xs">{whenOf(last.at)}</span>
          {unread > 0 && <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-[11px] font-medium tabular-nums">{unread}</span>}
        </span>
      </div>
      {rest.length > 0 && (
        <>
          <button className="text-muted-foreground hover:text-foreground flex items-center gap-1 self-start pb-3 pl-14 text-xs transition-colors" onClick={() => setOpen(!open)} type="button">
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
            {open ? "Свернуть" : `Ещё ${rest.length} за неделю`}
          </button>
          {open && (
            <ul className="flex flex-col pb-2 pl-14">
              {rest.map((it) => (
                <li key={it.id}>
                  <button className="hover:bg-muted/60 grid w-full grid-cols-[6rem_1fr] gap-2 rounded-md px-2 py-1.5 text-left text-sm" onClick={() => onOpen(it.id)} type="button">
                    <span className="text-muted-foreground text-xs leading-5">{whenOf(it.at)}</span>
                    <span className="truncate">{it.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
};

export const Decisions = () => {
  const { items, read, resolved } = useInbox();
  const [open, setOpen] = useState<string | null>(null);
  const show = (id: string) => {
    read(id);
    setOpen(id);
  };
  const decisions = items.filter((it) => needsYou(it)).sort((a, b) => b.at.localeCompare(a.at));
  const pending = decisions.filter((it) => !resolved[it.id]).length;
  const rest = items.filter((it) => !needsYou(it)).sort((a, b) => b.at.localeCompare(a.at));
  const agents = [...new Set(rest.map((it) => it.agentId))];
  const opened = items.find((it) => it.id === open);
  return (
    <Shell area="inbox" panel={opened && <Panel onClose={() => setOpen(null)} open title={<FullTitle item={opened} />}><Full item={opened} /></Panel>} title="">
      <Page>
        <Head keys={false} />
        {items.length === 0 ? (
          <Empty />
        ) : (
          <>
            <section className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                Ждут вас
                {pending > 0 && <span className="bg-warning/15 text-warning rounded-full px-2 text-xs tabular-nums">{pending}</span>}
              </h2>
              {pending === 0 && <p className="text-muted-foreground text-sm">Всё решено — агенты работают дальше.</p>}
              {decisions.map((it) => (
                <Decision item={it} key={it.id} onOpen={() => show(it.id)} />
              ))}
            </section>
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold">Сводки</h2>
              <ul className="divide-y rounded-xl border">
                {agents.map((id) => (
                  <AgentDigest items={rest.filter((it) => it.agentId === id)} key={id} onOpen={show} />
                ))}
              </ul>
              <p className="text-muted-foreground px-1 text-xs">Ещё 14 запусков за неделю прошли без новостей — их здесь нет.</p>
            </section>
          </>
        )}
      </Page>
    </Shell>
  );
};
