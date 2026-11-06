"use client";

import { Button } from "@metobe/ui/components/button";
import { Skeleton } from "@metobe/ui/components/skeleton";
import { Spinner } from "@metobe/ui/components/spinner";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowRight, Check, ChevronDown, LogIn, RotateCw, TriangleAlert, Undo2 } from "lucide-react";
import { createContext, use, useEffect, useRef, useState } from "react";

import { AssistantMessage } from "@/components/chat/messages";

import { MODEL } from "../first-agent/data";
import { ENTER, PRESS, Shell, usePhone } from "../first-agent/frame";
import { InChat, SlotComposer } from "../first-agent/round3";
import { useProto } from "../first-agent/state";
import { Mark } from "../task-results/variants";
import { LISTS, dayOf, sorted, when } from "./data";
import type { Item } from "./data";

// P13 · список задач — страница «Задачи» из боковой панели. Без задач это экран «Что поручить?» из P11 (выбран), здесь
// он и показан. С задачами — список; внизу то же поле, что на экране «Что поручить?»: новая задача начинается словами.
// «Строки» — по строке на задачу: имя и расписание, итог последнего запуска, следующий запуск, выключатель.
// «Карточки» — то же сеткой, итог крупнее.
// «По вниманию» — строки, разложенные по тому, что с ними делать: нужно действие, новые итоги, остальные, выключенные.
// «По вниманию · 2» — то же, но каждую группу разбирают прямо в списке (выбран за основу, доводим).

type Count = keyof typeof LISTS;

/** Как загрузился список: готов, ещё грузится или не загрузился. */
type Load = "ready" | "loading" | "error";

const Many = createContext<{ count: Count; setCount: (c: Count) => void; load: Load; setLoad: (l: Load) => void }>(null as never);

const setParam = (key: string, value: string) => {
  const url = new URL(window.location.href);
  url.searchParams.set(key, value);
  window.history.replaceState(null, "", url);
};

export const CountProvider = ({ children }: { children: React.ReactNode }) => {
  const [count, setCountState] = useState<Count>("7");
  const [load, setLoadState] = useState<Load>("ready");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const n = q.get("n"), l = q.get("load");
    if (n === "0" || n === "3" || n === "7") setCountState(n);
    if (l === "loading" || l === "error") setLoadState(l);
  }, []);
  const setCount = (c: Count) => {
    setCountState(c);
    setParam("n", c);
  };
  const setLoad = (l: Load) => {
    setLoadState(l);
    setParam("load", l);
  };
  return <Many value={{ count, load, setCount, setLoad }}>{children}</Many>;
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
  const { count, setCount, load, setLoad } = use(Many);
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
      <div className="flex items-center justify-between gap-4">
        <span>список</span>
        <div className="flex gap-1">
          {([["ready", "загружен"], ["loading", "грузится"], ["error", "ошибка"]] as const).map(([l, label]) => (
            <Chip active={load === l} key={l} onClick={() => setLoad(l)}>{label}</Chip>
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

/** `side` — задачи в боковой панели; по умолчанию — те, что ждут человека: новый итог или сбой, который он исправляет. */
const Page = ({ children, items, side, counted = true }: { children: React.ReactNode; items: Item[]; side?: Item[]; counted?: boolean }) => {
  const { say } = useProto();
  const [text, setText] = useState("");
  return (
    <Shell area="agents" tasks={(side ?? items.filter((it) => it.unread || (it.enabled && it.last.outcome === "failed"))).map((it) => ({ color: it.color, name: it.name, unread: true }))} title="Задачи">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 pt-20 pb-6 @max-md:pt-6">
        <header className="flex items-baseline gap-2 @max-md:hidden">
          <h1 className="text-xl font-semibold tracking-tight">Задачи</h1>
          {counted && <span className="text-muted-foreground text-sm tabular-nums">{items.length}</span>}
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

// ── «По вниманию · 2» ────────────────────────────────────────────────────────────────────────────────────────────────
// То же разложение, но каждую группу разбирают прямо в списке: сбой — кнопкой в строке (видно, что идёт и чем
// кончилось), новый итог — прочитать, раскрыв строку, выключенную — включить. Строки не уезжают из-под руки, пока
// страница открыта: прочитанное, исправленное и включённое остаётся на месте до следующего открытия. Справа у строки
// подпись, что это за время: «итог 30 ноя» или «след. завтра в 8:30». В боковой панели — только задачи, которые ждут
// человека. Есть вид загрузки и ошибки (в «Параметрах»).

const RunMessage = ({ item }: { item: Item }) =>
  item.last.parts ? (
    <div className="[&_[data-slot=message-footer]]:hidden">
      <AssistantMessage label={MODEL} live={false} message={{ id: item.last.id ?? item.id, metadata: { createdAt: "2026-11-30T07:00:00Z", modelId: MODEL.id }, parts: item.last.parts, role: "assistant" }} />
    </div>
  ) : null;

/** Имя задачи: длинное обрезается, целиком — в подсказке; «новый итог» читается и программой чтения с экрана. */
const Name = ({ item, unread }: { item: Item; unread: boolean }) => (
  <span className="flex min-w-0 items-center gap-2" title={item.name}>
    <span className="size-2 shrink-0 rounded-full" style={{ background: item.color }} />
    <span className={cn("truncate", unread ? "font-semibold" : "font-medium")}>{item.name}</span>
    {unread && (
      <>
        <span aria-hidden className="bg-foreground size-1.5 shrink-0 rounded-full" />
        <span className="sr-only">, новый итог</span>
      </>
    )}
  </span>
);

const Group = ({ title, count, action, children }: { title?: string; count: number; action?: React.ReactNode; children: React.ReactNode }) => (
  <section aria-label={title ?? "Задачи"} className="flex flex-col gap-2">
    {title && (
      <h2 className="text-muted-foreground flex min-h-7 items-center gap-1 px-1 text-xs">
        {title}
        <span className="tabular-nums">· {count}</span>
        {action && <span className="ml-auto">{action}</span>}
      </h2>
    )}
    <div className="bg-card overflow-hidden rounded-xl border">{children}</div>
  </section>
);

const ROW = "flex items-center gap-3 border-b px-3 py-2.5 text-sm last:border-b-0 @max-md:min-h-12";
/** Текстовая кнопка, на телефоне с зоной нажатия 44 px. */
const TEXT_TAP = "text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors duration-150 @max-md:min-h-11";

/** Строка со сбоем и его исправлением: кнопка → «Проверяю доступ…» → «идёт запуск…» → итог. Кнопка не нажимается
 *  дважды; исправленная строка показывает итог вместо сбоя и остаётся на месте до следующего открытия. */
type FixStage = "idle" | "checking" | "running" | "done";

const FailedRow = ({ item, onDone }: { item: Item; onDone: () => void }) => {
  const phone = usePhone();
  const [stage, setStage] = useState<FixStage>("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const start = () => {
    setStage("checking");
    timers.current = [
      setTimeout(() => setStage("running"), 1200),
      setTimeout(() => {
        setStage("done");
        onDone();
      }, 3000),
    ];
  };
  return (
    <div className={cn(ROW, "flex-wrap gap-y-2")}>
      <Open className="min-w-0 shrink-0 basis-60 @max-md:basis-full" item={item}>
        <Name item={item} unread={false} />
      </Open>
      {stage === "done" ? (
        <span className={cn("flex min-w-48 flex-1 items-center gap-2", ENTER)}>
          <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="font-medium">{item.fixed ?? "Запуск прошёл"}</span>
        </span>
      ) : (
        <span className="flex min-w-48 flex-1 items-center gap-2">
          <Mark color={item.color} outcome="failed" />
          <span>{item.last.summary}</span>
        </span>
      )}
      {stage === "idle" && item.last.fix && (
        <Button className={PRESS} onClick={start} size={phone ? "default" : "sm"} variant="outline">
          <LogIn />
          {item.last.fix}
        </Button>
      )}
      {(stage === "checking" || stage === "running") && (
        <span aria-live="polite" className="text-muted-foreground flex items-center gap-2 text-sm">
          <Spinner className="size-3.5" />
          {stage === "checking" ? "Проверяю доступ…" : "Доступ есть, идёт запуск…"}
        </span>
      )}
      {stage === "done" && (
        <Open className={TEXT_TAP} item={item}>
          Открыть
          <ArrowRight className="size-3.5" />
        </Open>
      )}
    </div>
  );
};

const Skeletons = () => (
  <div aria-busy="true" aria-label="Задачи загружаются" className="flex flex-col gap-5">
    {[2, 3].map((n, g) => (
      <section className="flex flex-col gap-2" key={g}>
        <Skeleton className="mx-1 h-3 w-24" />
        <div className="bg-card overflow-hidden rounded-xl border">
          {Array.from({ length: n }, (_, i) => (
            <div className={ROW} key={i}>
              <Skeleton className="size-2 rounded-full" />
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3.5 flex-1 @max-md:hidden" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </section>
    ))}
  </div>
);

const LoadError = ({ onRetry }: { onRetry: () => void }) => {
  const phone = usePhone();
  return (
    <div className="bg-card flex flex-col items-start gap-3 rounded-xl border p-4" role="alert">
      <span className="flex items-center gap-2 font-medium">
        <TriangleAlert className="size-4 text-amber-600 dark:text-amber-400" />
        Не удалось загрузить задачи
      </span>
      <p className="text-muted-foreground text-sm">Сервер не ответил за 10 с. Задачи при этом запускаются по расписанию как обычно.</p>
      <Button className={PRESS} onClick={onRetry} size={phone ? "default" : "sm"} variant="outline">
        <RotateCw />
        Повторить
      </Button>
    </div>
  );
};

export const Attention2 = () => {
  const { count, load, setLoad } = use(Many);
  const phone = usePhone();
  const items = sorted(LISTS[count]);
  const [read, setRead] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [on, setOn] = useState<Set<string>>(() => new Set());
  const [showOff, setShowOff] = useState(false);
  const [fixed, setFixed] = useState<Set<string>>(() => new Set());
  /** Только что отмеченные разом — их можно вернуть, пока не прошло 5 с. */
  const [bulk, setBulk] = useState<string[] | null>(null);
  const bulkTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(bulkTimer.current), []);
  if (items.length === 0 && load === "ready") return <InChat />;

  const unread = (it: Item) => Boolean(it.unread) && !read.has(it.id);
  // Группы считаются по тому, каким список пришёл: прочитанное и включённое остаётся на своём месте до следующего открытия.
  const failed = items.filter((it) => it.enabled && it.last.outcome === "failed");
  const fresh = items.filter((it) => it.enabled && it.last.outcome !== "failed" && it.unread).sort((a, b) => dayOf(b.last.day) - dayOf(a.last.day));
  const rest = items.filter((it) => it.enabled && it.last.outcome !== "failed" && !it.unread);
  const off = items.filter((it) => !it.enabled);
  const only = [failed, fresh, rest].filter((g) => g.length > 0).length === 1;
  // В боковой панели — только то, что ждёт человека: сбой или непрочитанный итог.
  const side = items.filter((it) => (it.enabled && it.last.outcome === "failed" && !fixed.has(it.id)) || unread(it)).map((it) => ({ ...it, unread: unread(it) }));

  const toggle = (it: Item) => {
    setOpen((o) => (o === it.id ? null : it.id));
    setRead((r) => new Set(r).add(it.id));
  };
  const markAll = () => {
    const ids = fresh.filter(unread).map((it) => it.id);
    setRead((r) => new Set([...r, ...ids]));
    setBulk(ids);
    clearTimeout(bulkTimer.current);
    bulkTimer.current = setTimeout(() => setBulk(null), 5000);
  };
  const undoBulk = () => {
    const ids = bulk ?? [];
    setRead((r) => new Set([...r].filter((id) => !ids.includes(id))));
    setBulk(null);
    clearTimeout(bulkTimer.current);
  };
  const tap = phone ? "@max-md:h-10 @max-md:px-3" : "";

  return (
    <Page counted={load === "ready"} items={items} side={load === "ready" ? side : []}>
      {load === "loading" && <Skeletons />}
      {load === "error" && (
        <LoadError
          onRetry={() => {
            setLoad("loading");
            setTimeout(() => setLoad("ready"), 900);
          }}
        />
      )}
      {load === "ready" && (
        <>
          {failed.length > 0 && (
            <Group count={failed.length} title="Нужно действие">
              {failed.map((it) => (
                <FailedRow item={it} key={it.id} onDone={() => setFixed((s) => new Set(s).add(it.id))} />
              ))}
            </Group>
          )}
          {fresh.length > 0 && (
            <Group
              action={
                bulk ? (
                  <Button className={cn(PRESS, tap)} onClick={undoBulk} size="xs" variant="ghost">
                    <Undo2 />
                    Вернуть непрочитанными
                  </Button>
                ) : (
                  fresh.some(unread) && (
                    <Button className={cn(PRESS, tap)} onClick={markAll} size="xs" variant="ghost">
                      Отметить прочитанными
                    </Button>
                  )
                )
              }
              count={fresh.length}
              title="Новые итоги"
            >
              {fresh.map((it) => (
                <div className="border-b last:border-b-0" key={it.id}>
                  <button
                    aria-controls={`result-${it.id}`}
                    aria-expanded={open === it.id}
                    className={cn(ROW, "hover:bg-muted/40 w-full border-b-0 text-left transition-colors duration-150 @max-md:flex-wrap @max-md:gap-y-1")}
                    onClick={() => toggle(it)}
                    type="button"
                  >
                    <span className="w-52 shrink-0 @max-md:w-auto @max-md:min-w-0 @max-md:flex-1">
                      <Name item={it} unread={unread(it)} />
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate @max-md:order-last @max-md:basis-full @max-md:pl-4", unread(it) ? "text-foreground" : "text-muted-foreground")}>{it.last.summary}</span>
                    <span className="text-muted-foreground w-32 shrink-0 text-right text-xs tabular-nums">итог {it.last.day}</span>
                    <ChevronDown className={cn("text-muted-foreground size-4 shrink-0 transition-transform duration-200", open === it.id && "rotate-180")} />
                  </button>
                  {open === it.id && (
                    <div className={cn("flex flex-col gap-3 px-3 pt-1 pb-4 pl-8", ENTER)} id={`result-${it.id}`}>
                      <RunMessage item={it} />
                      <div>
                        <Open className={TEXT_TAP} item={it}>
                          Открыть задачу
                          <ArrowRight className="size-3.5" />
                        </Open>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </Group>
          )}
          {rest.length > 0 && (
            <Group count={rest.length} title={only ? undefined : "Остальные"}>
              {rest.map((it) => (
                <Open className={cn(ROW, "hover:bg-muted/40 w-full transition-colors duration-150")} item={it} key={it.id}>
                  <span className="w-52 shrink-0 @max-md:w-auto @max-md:min-w-0 @max-md:flex-1">
                    <Name item={it} unread={false} />
                  </span>
                  <span className="text-muted-foreground min-w-0 flex-1 truncate @max-md:hidden">{it.last.summary}</span>
                  <span className="text-muted-foreground w-32 shrink-0 text-right text-xs tabular-nums">{it.next ? `след. ${when(it.next)}` : ""}</span>
                </Open>
              ))}
            </Group>
          )}
          {off.length > 0 && (
            <section aria-label="Выключены" className="flex flex-col gap-2">
              <button aria-expanded={showOff} className={cn(TEXT_TAP, "self-start px-1")} onClick={() => setShowOff((v) => !v)} type="button">
                <ChevronDown className={cn("size-3.5 transition-transform duration-200", showOff && "rotate-180")} />
                Выключены · {off.length}
              </button>
              {showOff && (
                <div className={cn("bg-card overflow-hidden rounded-xl border", ENTER)}>
                  {off.map((it) => {
                    const turned = on.has(it.id);
                    return (
                      <div className={ROW} key={it.id}>
                        <span className={cn("min-w-0 flex-1 transition-opacity duration-200", !turned && "opacity-60")}>
                          <Name item={it} unread={false} />
                        </span>
                        <span aria-live="polite" className="text-muted-foreground text-xs @max-md:hidden">
                          {turned ? "Включена · след. пт, 4 дек в 17:00" : it.schedule}
                        </span>
                        <Button
                          className={PRESS}
                          onClick={() =>
                            setOn((s) => {
                              const next = new Set(s);
                              if (turned) next.delete(it.id);
                              else next.add(it.id);
                              return next;
                            })
                          }
                          size={phone ? "default" : "sm"}
                          variant={turned ? "ghost" : "outline"}
                        >
                          {turned ? "Отменить" : "Включить"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </Page>
  );
};
