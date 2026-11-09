"use client";

import { Bubble, BubbleContent } from "@metobe/ui/components/bubble";
import { Button } from "@metobe/ui/components/button";
import { Message, MessageContent, MessageFooter } from "@metobe/ui/components/message";
import { Tooltip, TooltipContent, TooltipTrigger } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowUp, BookUser, ChevronDown, Copy, Plus, RefreshCw, ThumbsDown, ThumbsUp, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ENTER, PRESS, Shell, usePhone, useProto } from "../memory/frame";

// P18 · вопрос памяти прямо в чате (ARCH §19, D39). Память пишется после ответа, в фоне, и приходит в открытый чат
// по SSE через секунду-две, иногда через десять. Если служебная модель не уверена — какой это Андрей, выполнено ли
// обещание, — она не склеивает молча, а спрашивает. Вопрос не сообщение ассистента: модель его не видит, история
// чата не меняется. Ответ уходит в память, строка становится «Запомнено … · Отменить». Не ответил — вопрос ждёт в
// «Не записано» на странице «Память».
// «Строка» — тихая строка под ответом, варианты чипами. «Карточка» — карточка под ответом, у каждого варианта —
// кто это. «У поля» — вопрос над полем ввода: не теряется, если человек уже пишет дальше или ушёл вниз.
// Параметры: какой вопрос, когда пришёл (сразу или через 3 с — посмотреть появление), пишет ли человек в поле.

interface Option {
  id: string;
  label: string;
  /** Кто это — из карточки памяти. */
  note?: string;
}

interface Ask {
  said: string;
  answer: string;
  question: string;
  /** Коротко — для строки и поля. */
  short: string;
  options: Option[];
  /** Что ляжет в память при выборе варианта. */
  result: (o: Option) => string;
  /** Что ляжет при «Новый человек». */
  fresh?: string;
}

const ASKS: Record<string, Ask> = {
  done: {
    answer: "Тогда можно планировать отгрузку. Составить план на неделю?",
    options: [
      { id: "yes", label: "Выполнено" },
      { id: "no", label: "Ещё нет" },
    ],
    question: "Ольга Ли обещала прислать подписанный договор до 13 ноября. Отметить выполненным?",
    result: (o) => (o.id === "yes" ? "Ольга Ли прислала договор — выполнено" : "Договор от Ольги Ли — ещё ждём"),
    said: "Ольга прислала договор, всё подписано.",
    short: "Договор от Ольги Ли — выполнено?",
  },
  many: {
    answer: "Когда тарифы придут, сравню их с текущими. Напомнить в пятницу, если не пришлют?",
    options: [
      { id: "li", label: "Ольга Ли", note: "менеджер по работе с клиентами, «Альфа-Логистика»" },
      { id: "petrova", label: "Ольга Петрова", note: "главный бухгалтер" },
      { id: "morozova", label: "Ольга Морозова", note: "юрист, ООО «Вектор»" },
    ],
    question: "Какая Ольга обещала прислать тарифы?",
    fresh: "Ольга (новая карточка) — пришлёт тарифы",
    result: (o) => `${o.label} — пришлёт тарифы`,
    said: "Ольга обещала прислать новые тарифы.",
    short: "Какая Ольга?",
  },
  who: {
    answer: "Встречу перенесу на четверг, 12 ноября. Пригласить тех же участников?",
    options: [
      { id: "smirnov", label: "Андрей Смирнов", note: "разработчик в команде, проект «Склад 2.0»" },
      { id: "kovalev", label: "Андрей Ковалёв", note: "закупки, ООО «Вектор»" },
    ],
    question: "Какой Андрей уходит в отпуск 10 ноября?",
    fresh: "Андрей (новая карточка) — в отпуске с 10 ноября",
    result: (o) => `${o.label} — в отпуске с 10 ноября`,
    said: "Андрей завтра в отпуске, перенеси нашу встречу на четверг.",
    short: "Какой Андрей?",
  },
};

const NEW: Option = { id: "new", label: "Новый человек" };

// ── состояние вопроса ────────────────────────────────────────────────────────────────────────────────────────────────

type State = { kind: "waiting" } | { kind: "asking" } | { kind: "saved"; text: string } | { kind: "skipped" };

/** Вопрос приходит сразу или через 3 с (как из фона по SSE); ответ, отмена и «Не запоминать» — с «Вернуть». */
const useAsk = () => {
  const { knobs, say } = useProto();
  const ask = ASKS[knobs.q] ?? ASKS.who;
  const [state, setState] = useState<State>({ kind: knobs.at === "late" ? "waiting" : "asking" });
  useEffect(() => {
    setState({ kind: knobs.at === "late" ? "waiting" : "asking" });
    if (knobs.at !== "late") return;
    const t = setTimeout(() => setState({ kind: "asking" }), 3000);
    return () => clearTimeout(t);
  }, [knobs.at, knobs.q]);
  const options = knobs.q === "done" ? ask.options : [...ask.options, NEW];
  return {
    ask,
    options,
    pick: (o: Option) => setState({ kind: "saved", text: o.id === "new" && ask.fresh ? ask.fresh : ask.result(o) }),
    skip: () => {
      setState({ kind: "skipped" });
      say("Не записано", () => setState({ kind: "asking" }));
    },
    state,
    undo: () => {
      setState({ kind: "skipped" });
      say("Удалено из памяти", () => setState({ kind: "asking" }));
    },
  };
};

// ── чат как в приложении ─────────────────────────────────────────────────────────────────────────────────────────────

const TOOLBAR =
  "h-6 gap-0.5 px-0 opacity-0 transition-opacity duration-150 group-hover/message:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100";

const Icon = ({ children }: { children: React.ReactNode }) => (
  <Button className="text-muted-foreground hover:text-foreground [&_svg]:size-3.5" size="icon-xs" variant="ghost">
    {children}
  </Button>
);

const User = ({ text }: { text: string }) => (
  <Message align="end">
    <MessageContent className="gap-1">
      <Bubble align="end" variant="muted">
        <BubbleContent className="rounded-2xl rounded-br-md px-4 py-2.5 whitespace-pre-wrap">{text}</BubbleContent>
      </Bubble>
    </MessageContent>
  </Message>
);

const Answer = ({ text, at, children }: { text: string; at: string; children?: React.ReactNode }) => (
  <Message>
    <MessageContent>
      <p className="leading-7">{text}</p>
      <MessageFooter className={cn(TOOLBAR, "-mt-1")}>
        <span className="flex items-center gap-1.5">
          <span>DeepSeek v4.1 Flash</span>
          <span aria-hidden="true">·</span>
          <span>{at}</span>
        </span>
        <Icon><Copy /></Icon>
        <Icon><ThumbsUp /></Icon>
        <Icon><ThumbsDown /></Icon>
        <Icon><RefreshCw /></Icon>
      </MessageFooter>
      {children}
    </MessageContent>
  </Message>
);

const Tip = ({ children, tip }: { children: React.ReactElement; tip?: string }) =>
  tip ? (
    <Tooltip>
      <TooltipTrigger delay={400} render={children} />
      <TooltipContent arrow={false} className="bg-sidebar text-foreground ring-foreground/10 max-w-64 shadow-md ring-1" sideOffset={6}>
        {tip}
      </TooltipContent>
    </Tooltip>
  ) : (
    children
  );

/** «Запомнено: … · Отменить» — то, во что превращается любой ответ на вопрос (и строка без вопроса). */
const Remembered = ({ items, onUndo, flash }: { items: string[]; onUndo?: () => void; flash?: boolean }) => {
  const { say } = useProto();
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <div className={cn("text-muted-foreground -mt-1 flex flex-col gap-1 text-xs", ENTER, flash && "animate-[memflash_1.2s_ease-out]")}>
      <style>{"@keyframes memflash{0%{color:var(--foreground)}100%{color:var(--muted-foreground)}}"}</style>
      <div className="flex items-center gap-2">
        <button aria-expanded={open} className="hover:text-foreground flex min-w-0 items-center gap-1.5 text-left transition-colors duration-150" onClick={() => setOpen((o) => !o)} type="button">
          <BookUser className="size-3.5 shrink-0" />
          <span className="truncate">Запомнено: {items.length === 1 ? items[0] : `${items.length} записи`}</span>
          {items.length > 1 && <ChevronDown className={cn("size-3 shrink-0 transition-transform duration-200", open ? "" : "-rotate-90")} />}
        </button>
        <button
          className={cn("hover:text-foreground flex shrink-0 items-center gap-1 transition-colors duration-150", PRESS)}
          onClick={() => {
            if (onUndo) onUndo();
            else {
              setGone(true);
              say("Удалено из памяти", () => setGone(false));
            }
          }}
          type="button"
        >
          <Undo2 className="size-3" /> Отменить
        </button>
      </div>
      {open && items.length > 1 && (
        <ul className="flex flex-col gap-0.5 pl-5">
          {items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

const Composer = ({ above }: { above?: React.ReactNode }) => {
  const { knobs } = useProto();
  const typing = knobs.field === "typing";
  return (
    <div className="bg-background sticky bottom-0 mx-auto w-full max-w-4xl px-4 pt-2 pb-4 md:px-6">
      {above}
      <div className="bg-muted/70 dark:bg-muted/40 border-border/70 relative flex items-end gap-1 rounded-[24px] border p-1.5">
        <Button aria-label="Добавить" className="text-muted-foreground rounded-full" size="icon" variant="ghost">
          <Plus />
        </Button>
        <span className={cn("flex-1 py-1.5 text-sm", typing ? "text-foreground" : "text-muted-foreground")}>
          {typing ? "Да, тех же, и добавь Марину Орлову" : "Сообщение"}
        </span>
        <Button aria-label="Отправить" className="rounded-full" disabled={!typing} size="icon">
          <ArrowUp />
        </Button>
      </div>
    </div>
  );
};

/** `stamp` — состояние вопроса: пришёл новый — чат, как настоящий, доезжает вниз, чтобы его было видно. */
const Thread = ({ slot, above, stamp }: { slot: React.ReactNode; above?: React.ReactNode; stamp: string }) => {
  const { knobs } = useProto();
  const ask = ASKS[knobs.q] ?? ASKS.who;
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [stamp, knobs.q]);
  return (
    <Shell area="chat" title="Планёрка">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 pt-16 pb-6 text-sm md:px-6 @max-md:pt-4">
        <User text="Созвонился с Ольгой: подписанный договор пришлют до пятницы. И «Вектор» так и не ответил на предложение." />
        <Answer at="10:41" text="Ольга Ли обещала договор ещё 28 октября, теперь срок — пятница, 13 ноября. ООО «Вектор» не отвечает на коммерческое предложение с 3 ноября — 6 дней. Подготовить им короткое напоминание?">
          <Remembered items={["созвон с Ольгой Ли, 9 ноября", "Ольга Ли — подписанный договор до 13 ноября", "ждём ответа от ООО «Вектор» с 3 ноября"]} />
        </Answer>
        <User text={ask.said} />
        <Answer at="10:43" text={ask.answer}>
          {slot}
        </Answer>
        <div ref={end} />
      </div>
      <Composer above={above} />
    </Shell>
  );
};

// ── «Строка» ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const Chip = ({ o, onPick }: { o: Option; onPick: (o: Option) => void }) => (
  <Tip tip={o.note}>
    <button className={cn("bg-background hover:bg-muted text-foreground rounded-full border px-2.5 py-0.5 transition-colors duration-150", PRESS)} onClick={() => onPick(o)} type="button">
      {o.label}
    </button>
  </Tip>
);

export const Line = () => {
  const { ask, options, pick, skip, state, undo } = useAsk();
  const slot =
    state.kind === "asking" ? (
      <div className={cn("text-muted-foreground -mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-xs", ENTER)}>
        <BookUser className="size-3.5 shrink-0" />
        <span className="mr-0.5">{ask.question}</span>
        {options.map((o) => (
          <Chip key={o.id} o={o} onPick={pick} />
        ))}
        <button className="hover:text-foreground px-1 transition-colors duration-150" onClick={skip} type="button">
          Не запоминать
        </button>
      </div>
    ) : state.kind === "saved" ? (
      <Remembered items={[state.text]} onUndo={undo} />
    ) : null;
  return <Thread slot={slot} stamp={state.kind} />;
};

// ── «Карточка» ───────────────────────────────────────────────────────────────────────────────────────────────────────

export const Card = () => {
  const { ask, options, pick, skip, state, undo } = useAsk();
  const phone = usePhone();
  const slot =
    state.kind === "asking" ? (
      <div className={cn("bg-background -mt-1 flex max-w-md flex-col gap-2 rounded-xl border p-3 shadow-xs", ENTER)}>
        <div className="flex items-start gap-2">
          <BookUser className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-muted-foreground text-xs">Память</span>
            <span className="text-sm leading-5">{ask.question}</span>
          </div>
          <Tip tip="Не запоминать">
            <Button aria-label="Не запоминать" className="text-muted-foreground -mt-1 -mr-1" onClick={skip} size="icon-xs" variant="ghost">
              <X />
            </Button>
          </Tip>
        </div>
        {options.every((o) => !o.note) ? (
          <div className="flex gap-2 pl-6">
            {options.map((o) => (
              <Button className={PRESS} key={o.id} onClick={() => pick(o)} size="sm" variant={o.id === "yes" ? "default" : "outline"}>
                {o.label}
              </Button>
            ))}
          </div>
        ) : (
        <div className={cn("flex flex-col gap-0.5 pl-6", phone && "pl-0")}>
          {options.map((o) => (
            <button className={cn("hover:bg-muted flex flex-col items-start rounded-lg px-2 py-1.5 text-left transition-colors duration-150", PRESS)} key={o.id} onClick={() => pick(o)} type="button">
              <span className="text-sm">{o.label}</span>
              {o.note && <span className="text-muted-foreground text-xs">{o.note}</span>}
            </button>
          ))}
        </div>
        )}
      </div>
    ) : state.kind === "saved" ? (
      <Remembered items={[state.text]} onUndo={undo} />
    ) : null;
  return <Thread slot={slot} stamp={state.kind} />;
};

// ── «У поля» ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export const AtField = () => {
  const { ask, options, pick, skip, state, undo } = useAsk();
  const [justSaved, setJustSaved] = useState(false);
  const above =
    state.kind === "asking" ? (
      <div className={cn("bg-background mb-2 flex flex-wrap items-center gap-x-1.5 gap-y-1.5 rounded-2xl border px-3 py-2 text-xs shadow-xs", ENTER)}>
        <BookUser className="text-muted-foreground size-3.5 shrink-0" />
        <span className="text-muted-foreground mr-0.5">{ask.question}</span>
        {options.map((o) => (
          <Chip
            key={o.id}
            o={o}
            onPick={(x) => {
              pick(x);
              setJustSaved(true);
            }}
          />
        ))}
        <span className="flex-1" />
        <Tip tip="Не запоминать">
          <Button aria-label="Не запоминать" className="text-muted-foreground" onClick={skip} size="icon-xs" variant="ghost">
            <X />
          </Button>
        </Tip>
      </div>
    ) : null;
  const slot =
    state.kind === "asking" ? (
      <span className={cn("text-muted-foreground -mt-1 flex items-center gap-1.5 text-xs", ENTER)}>
        <BookUser className="size-3.5" /> Вопрос памяти — внизу, у поля
      </span>
    ) : state.kind === "saved" ? (
      <Remembered flash={justSaved} items={[state.text]} onUndo={undo} />
    ) : null;
  return <Thread above={above} slot={slot} stamp={state.kind} />;
};


