"use client";

import { Button } from "@metobe/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@metobe/ui/components/dropdown-menu";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowUp, Building2, Check, ChevronLeft, ChevronRight, Clock, Ellipsis, FolderKanban, PenLine, Quote, X } from "lucide-react";
import { useState } from "react";

import { ENTER, PRESS, Shell, rise, useProto } from "../../memory/frame";
import { PLAN, PLAN_SECTIONS, entity } from "../../memory/data";
import type { PlanItem } from "../../memory/data";

// P17 · план на день вместо главной страницы (D39). Пункты собраны запуском по расписанию из памяти: обещания,
// ожидание ответа, свои сроки, встречи по правилам, даты. У пункта одно главное действие — закрыть («Получен»,
// «Ответили»), остальное в меню: «Написать» открывает новый чат с готовой просьбой, «Отложить», «Убрать из плана».
// Внизу — поле нового чата: главная — это план, но чат начинается отсюда же.
// «Список» — пункты по срочности строками. «По разделам» — те же строки по разделам. «По одному» — один пункт крупно.
// Параметры: пунктов — нет, 3, 7; память — пустая (первый день). В адресе: `?v=1&n=7&mem=empty&sz=phone`.

const TODAY = "Понедельник, 9 ноября";

/** Пункты плана с учётом ручек и того, что уже закрыто или отложено. */
const usePlan = () => {
  const { knobs, say } = useProto();
  const all = knobs.mem === "empty" ? [] : PLAN.slice(0, Number(knobs.n));
  const [gone, setGone] = useState<string[]>([]);
  const items = all.filter((p) => !gone.includes(p.id));
  const drop = (p: PlanItem, text: string) => {
    setGone((g) => [...g, p.id]);
    say(text, () => setGone((g) => g.filter((id) => id !== p.id)));
  };
  return {
    done: (p: PlanItem) => drop(p, `Закрыто: ${p.title.toLowerCase()} — ${p.done.toLowerCase()}`),
    empty: knobs.mem === "empty",
    items,
    remove: (p: PlanItem) => drop(p, "Убрано из плана"),
    snooze: (p: PlanItem, until: string) => drop(p, `Отложено до ${until}`),
    total: all.length,
  };
};
type Plan = ReturnType<typeof usePlan>;

const Who = ({ id, className }: { id: string; className?: string }) => {
  const e = entity(id);
  const initials = e.name.replace(/[«»]/g, "").split(" ").map((w) => w[0]).slice(0, 2).join("");
  return (
    <span aria-hidden className={cn("bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-medium", className)}>
      {e.kind === "org" ? <Building2 className="size-3.5" /> : e.kind === "project" ? <FolderKanban className="size-3.5" /> : initials}
    </span>
  );
};

const Source = ({ p }: { p: PlanItem }) => (
  <p className="text-muted-foreground flex gap-2 text-xs leading-5">
    <Quote className="mt-1 size-3 shrink-0" />
    <span>
      «{p.source.said}» — чат «{p.source.chat}», {p.source.recorded}
    </span>
  </p>
);

const Menu = ({ p, plan }: { p: PlanItem; plan: Plan }) => {
  const { say } = useProto();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button aria-label="Ещё" size="icon-sm" variant="ghost" />}>
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {p.write && (
          <DropdownMenuItem onClick={() => say(`Откроется новый чат: «${p.write}»`)}>
            <PenLine /> Написать
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => plan.snooze(p, "завтра")}>
          <Clock /> Отложить до завтра
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => plan.snooze(p, "понедельника")}>
          <Clock /> Отложить на неделю
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => plan.remove(p)}>
          <X /> Убрать из плана
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/** Строка пункта: кто, что, почему; «Получен» закрывает, нажатие на строку показывает, откуда пункт. */
const Row = ({ p, plan, n }: { p: PlanItem; plan: Plan; n: number }) => {
  const [open, setOpen] = useState(false);
  return (
    <li className={cn("group flex flex-col gap-2 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-muted/50", ENTER)} style={rise(n)}>
      <div className="flex items-center gap-3">
        <button aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpen((o) => !o)} type="button">
          <Who id={p.who} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium">{p.title}</span>
            <span className="text-muted-foreground text-xs leading-5">
              {entity(p.who).name} · <span className={cn(p.overdue && "text-warning-foreground dark:text-warning")}>{p.why}</span>
            </span>
          </span>
        </button>
        <Button aria-label={p.done} className={cn("@max-md:px-2", PRESS)} onClick={() => plan.done(p)} size="sm" variant="outline">
          <Check /> <span className="@max-md:sr-only">{p.done}</span>
        </Button>
        <Menu p={p} plan={plan} />
      </div>
      {open && (
        <div className={cn("pl-11", ENTER)}>
          <Source p={p} />
        </div>
      )}
    </li>
  );
};

const Composer = () => {
  const { say } = useProto();
  const [text, setText] = useState("");
  const send = () => {
    if (!text.trim()) return;
    say("Откроется новый чат с этим сообщением");
    setText("");
  };
  return (
    <form
      className="bg-background focus-within:ring-ring/20 flex items-end gap-1 rounded-3xl border p-1.5 pl-4 shadow-xs transition-shadow duration-150 focus-within:ring-3"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <textarea
        aria-label="Новый чат"
        className="placeholder:text-muted-foreground block max-h-40 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-base leading-6 outline-none [field-sizing:content] sm:text-sm"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        placeholder="Спросите или расскажите, что произошло"
        rows={1}
        value={text}
      />
      <Button aria-label="Отправить" className={cn("rounded-full", PRESS)} disabled={!text.trim()} size="icon" type="submit">
        <ArrowUp />
      </Button>
    </form>
  );
};

/** Страница: дата, план, поле нового чата внизу. */
const Page = ({ plan, children }: { plan: Plan; children: React.ReactNode }) => (
  <Shell area="today" badge={plan.items.length || undefined} title="Сегодня">
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 pt-20 pb-4 @max-md:pt-5">
      <header className="flex flex-col gap-1 px-3">
        <h1 className="text-2xl font-semibold tracking-tight @max-md:text-xl">{TODAY}</h1>
        {plan.items.length > 0 && <p className="text-muted-foreground text-sm">План из того, что вы рассказывали в чатах</p>}
      </header>
      {plan.empty ? <FirstDay /> : plan.items.length === 0 ? <AllDone plan={plan} /> : children}
    </div>
    <div className="bg-background sticky bottom-0 mx-auto w-full max-w-2xl px-4 pt-2 pb-4">
      <Composer />
    </div>
  </Shell>
);

const AllDone = ({ plan }: { plan: Plan }) => (
  <div className={cn("flex flex-col gap-1 px-3", ENTER)}>
    <p className="text-sm font-medium">{plan.total ? "Всё разобрано" : "На сегодня ничего"}</p>
    <p className="text-muted-foreground text-sm">Следующий план — завтра утром.</p>
  </div>
);

const EXAMPLES = [
  "Андрей обещал прислать смету к пятнице",
  "Отправили поставщику предложение, ждём ответа",
  "С каждым из команды хочу встречаться раз в две недели",
];

/** Память пустая: что здесь будет и как это пополняется. */
const FirstDay = () => {
  const { say } = useProto();
  return (
    <div className={cn("flex flex-col gap-4 px-3", ENTER)}>
      <p className="text-muted-foreground max-w-md text-sm leading-6">
        Здесь каждое утро — план на день: чьих ответов вы ждёте, ваши сроки, с кем давно не встречались. Он собирается из
        того, что вы пишете в чатах.
      </p>
      <div className="flex flex-col items-start gap-2">
        <span className="text-muted-foreground text-xs">Например:</span>
        {EXAMPLES.map((e, i) => (
          <button className={cn("bg-muted/60 hover:bg-muted rounded-full px-3 py-1.5 text-left text-sm transition-colors duration-150", PRESS, ENTER)} key={e} onClick={() => say("Откроется новый чат с этим сообщением")} style={rise(i)} type="button">
            {e}
          </button>
        ))}
      </div>
    </div>
  );
};

// ── Варианты ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export const List = () => {
  const plan = usePlan();
  return (
    <Page plan={plan}>
      <ul className="flex flex-col">
        {plan.items.map((p, i) => (
          <Row key={p.id} n={i} p={p} plan={plan} />
        ))}
      </ul>
    </Page>
  );
};

export const Sections = () => {
  const plan = usePlan();
  let n = 0;
  return (
    <Page plan={plan}>
      <div className="flex flex-col gap-5">
        {PLAN_SECTIONS.map((s) => {
          const items = plan.items.filter((p) => s.kinds.includes(p.kind));
          if (!items.length) return null;
          return (
            <section className="flex flex-col gap-1" key={s.id}>
              <h2 className="text-muted-foreground px-3 text-xs font-medium">{s.title}</h2>
              <ul className="flex flex-col">
                {items.map((p) => (
                  <Row key={p.id} n={n++} p={p} plan={plan} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Page>
  );
};

/** Один пункт крупно: решить и перейти к следующему; остальные — точками сверху. */
export const OneByOne = () => {
  const plan = usePlan();
  const { say } = useProto();
  const [at, setAt] = useState(0);
  const i = Math.min(at, plan.items.length - 1);
  const p = plan.items[i];
  return (
    <Page plan={plan}>
      {p && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 px-1">
            <Button aria-label="Предыдущий" disabled={i === 0} onClick={() => setAt(i - 1)} size="icon-sm" variant="ghost">
              <ChevronLeft />
            </Button>
            <div className="flex flex-1 justify-center gap-1.5">
              {plan.items.map((x, k) => (
                <button aria-label={`Пункт ${k + 1}`} className={cn("size-1.5 rounded-full transition-colors duration-150", k === i ? "bg-foreground" : "bg-border hover:bg-muted-foreground")} key={x.id} onClick={() => setAt(k)} type="button" />
              ))}
            </div>
            <Button aria-label="Следующий" disabled={i === plan.items.length - 1} onClick={() => setAt(i + 1)} size="icon-sm" variant="ghost">
              <ChevronRight />
            </Button>
          </div>
          <article className={cn("bg-card flex flex-col gap-4 rounded-2xl border p-5 shadow-xs", ENTER)} key={p.id}>
            <div className="flex items-center gap-3">
              <Who id={p.who} />
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">{entity(p.who).name}</span>
                <span className="text-muted-foreground truncate text-xs">{entity(p.who).role}</span>
              </div>
              <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                {i + 1} из {plan.items.length}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold tracking-tight">{p.title}</h2>
              <p className={cn("text-muted-foreground text-sm", p.overdue && "text-warning-foreground dark:text-warning")}>{p.why}</p>
            </div>
            <Source p={p} />
            <div className="flex flex-wrap items-center gap-2">
              <Button className={PRESS} onClick={() => plan.done(p)}>
                <Check /> {p.done}
              </Button>
              {p.write && (
                <Button className={PRESS} onClick={() => say(`Откроется новый чат: «${p.write}»`)} variant="outline">
                  <PenLine /> Написать
                </Button>
              )}
              <Button className={PRESS} onClick={() => plan.snooze(p, "завтра")} variant="ghost">
                <Clock /> Завтра
              </Button>
            </div>
          </article>
        </div>
      )}
    </Page>
  );
};
