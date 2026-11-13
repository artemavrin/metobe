"use client";

import { Button } from "@metobe/ui/components/button";
import { Input } from "@metobe/ui/components/input";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowUp, BookUser, Building2, Ellipsis, Link2, Mail, MailX } from "lucide-react";
import { useRef, useState } from "react";

import { ENTER, PRESS, Shell, rise, usePhone, useProto } from "../memory/frame";

// Общее для P23 (Г2.4): строка «Не упустить» → готовое напоминание второй стороне. Экран нового чата с разделом
// «Не упустить», строки как в приложении (components/chat/today-rows.tsx), у строк «мне должны» — «Напомнить».
// Что видно до отправки: кому (имя и адрес), с какого ящика, тема, текст, и для самого человека — где и когда это
// было обещано (в письмо не попадает). Нет адреса — поле адреса на месте, он сохранится на карточке; нет ящика —
// черновик всё равно виден, вместо «Отправить» — «Подключить почту» и «Скопировать».

export interface Row {
  id: string;
  /** Вторая сторона; null — своё. */
  who: { name: string; kind: "person" | "org"; first: string; email: string } | null;
  text: string;
  side: "mine" | "theirs";
  why: string;
  overdue?: boolean;
  /** Когда и где обещано — для самого человека. */
  given?: { day: string; chat: string };
  due?: string;
  /** О чём письмо, в теме. */
  topic?: string;
}

export const ROWS: Row[] = [
  {
    due: "13 ноября",
    given: { chat: "Договор с перевозчиком", day: "3 ноября" },
    id: "olga",
    overdue: true,
    side: "theirs",
    text: "Прислать подписанный договор",
    topic: "подписанный договор",
    who: { email: "o.li@alfa-logistics.example", first: "Ольга", kind: "person", name: "Ольга Ли" },
    why: "просрочено на 1 дн.",
  },
  {
    given: { chat: "Закупка оборудования", day: "6 ноября" },
    id: "vector",
    side: "theirs",
    text: "Ответить на коммерческое предложение",
    topic: "ответ на коммерческое предложение",
    who: { email: "sales@vector.example", first: "Коллеги", kind: "org", name: "ООО «Вектор»" },
    why: "ждём 8 дн.",
  },
  { id: "report", side: "mine", text: "Подготовить отчёт по закупкам", who: null, why: "завтра" },
];

export const MAILBOX = "me@company.example";

/** Ручки прототипа: есть ли адрес у карточки и подключена ли почта. */
export const useWorld = () => {
  const { knobs } = useProto();
  return { addr: knobs.addr !== "no", box: knobs.box !== "no" };
};

/** Письмо по шаблону — без модели: обращение, что и когда обещано, вопрос. */
export const templateOf = (row: Row) => {
  const who = row.who;
  if (!who) return { subject: "", text: "" };
  const hello = who.kind === "person" ? `${who.first}, добрый день!` : "Добрый день!";
  const when = row.due ? `договаривались, что пришлёте к ${row.due}` : `писали об этом ${row.given?.day}`;
  return {
    subject: `Напоминание: ${row.topic}`,
    text: `${hello}\n\nНапоминаю про ${row.topic} — ${when}. Подскажите, когда получится?\n\nСпасибо!`,
  };
};

/** То же, что написала бы модель, и два её пересказа — для кнопок «Короче» и «Мягче». */
export const modelOf = (row: Row, tone: "base" | "short" | "soft") => {
  const who = row.who;
  if (!who) return "";
  const hello = who.kind === "person" ? `${who.first}, добрый день!` : "Добрый день!";
  if (tone === "short") {
    return `${hello}\n\nКак дела с ${row.id === "olga" ? "договором" : "ответом на предложение"}? ${row.due ? `Ждали к ${row.due}.` : ""}`.trim();
  }
  if (tone === "soft") {
    return `${hello}\n\nНадеюсь, всё в порядке. Хотел уточнить про ${row.topic}: ${row.due ? `мы договаривались на ${row.due}` : `мы обсуждали его ${row.given?.day}`}, но, понимаю, могли появиться другие дела. Если нужно больше времени — дайте знать, подстроимся.\n\nСпасибо!`;
  }
  return `${hello}\n\n${row.given?.day ? `${row.given.day} мы договорились` : "Мы договорились"}, что ${row.id === "olga" ? `вы пришлёте подписанный договор к ${row.due}` : "вы ответите на наше коммерческое предложение"}. Пока его не вижу — подскажите, пожалуйста, когда ждать?\n\nСпасибо!`;
};

// ── Строки ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const ROW =
  "bg-background hover:bg-[color-mix(in_oklab,var(--muted)_70%,var(--background))] flex min-h-11 w-full items-center gap-3 rounded-lg border px-3.5 py-2 text-left text-sm transition-[background-color,scale] duration-150 ease-out active:scale-[0.99] motion-reduce:transition-none";

export const Face = ({ who }: { who: Row["who"] }) => (
  <span aria-hidden className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-[9px] font-medium">
    {who?.kind === "org" ? <Building2 className="size-3" /> : null}
    {who?.kind === "person" ? who.name.split(" ").map((w) => w[0]).join("") : null}
    {who ? null : <BookUser className="size-3" />}
  </span>
);

export const labelOf = (row: Row) => (row.who ? `${row.who.name}: ${row.text}` : row.text);

/**
 * Строка «Не упустить». У «мне должны» справа кнопка «Напомнить»: на компьютере видна при наведении, на телефоне —
 * всегда. Нажатие на саму строку — как сейчас: просьба в поле.
 */
export const TodayRow = ({
  row,
  n,
  onRemind,
  onPut,
  open,
}: {
  row: Row;
  n: number;
  onRemind: (row: Row) => void;
  onPut: (row: Row) => void;
  /** Черновик раскрыт под строкой: кнопка остаётся видна. */
  open?: boolean;
}) => {
  const phone = usePhone();
  const remind = row.side === "theirs" && row.who;
  return (
    <div className={cn("group relative", ENTER)} style={rise(n)}>
      <button className={cn(ROW, remind ? "pr-36" : "pr-10", phone && remind && "pr-10")} onClick={() => onPut(row)} type="button">
        <Face who={row.who} />
        <span className="flex min-w-0 flex-1 items-center gap-3 @max-md:flex-col @max-md:items-start @max-md:gap-0.5">
          <span className="min-w-0 flex-1 truncate @max-md:whitespace-normal">{labelOf(row)}</span>
          <span className={cn("text-muted-foreground shrink-0 text-xs", row.overdue && "text-warning-foreground dark:text-warning")}>{row.why}</span>
        </span>
      </button>
      <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-0.5">
        {remind && !phone && (
          <Button
            className={cn("h-7 gap-1.5 px-2 text-xs", PRESS, !open && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}
            onClick={() => onRemind(row)}
            size="sm"
            variant={open ? "secondary" : "ghost"}
          >
            <Mail className="size-3.5" /> Напомнить
          </Button>
        )}
        {remind && phone && (
          <Button aria-label="Напомнить" className={PRESS} onClick={() => onRemind(row)} size="icon-xs" variant="ghost">
            <Mail />
          </Button>
        )}
        <Button aria-label="Ещё" className="opacity-60 group-hover:opacity-100" size="icon-xs" variant="ghost">
          <Ellipsis />
        </Button>
      </div>
    </div>
  );
};

// ── Что видно до отправки ────────────────────────────────────────────────────────────────────────────────────────────

/** Где и когда обещано — только для самого человека, ссылкой на чат. */
export const Origin = ({ row, className }: { row: Row; className?: string }) => {
  const { say } = useProto();
  if (!row.given) return null;
  return (
    <button
      className={cn("text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-left text-xs transition-colors duration-150", className)}
      onClick={() => say(`Откроется чат «${row.given?.chat}» на этом сообщении`)}
      type="button"
    >
      <Link2 className="size-3.5 shrink-0" />
      <span>
        Обещано {row.given.day} в чате «{row.given.chat}»{row.due ? ` · срок ${row.due}` : ""}
        <span className="text-muted-foreground/60"> · в письмо не попадёт</span>
      </span>
    </button>
  );
};

/** Адреса у карточки нет: поле на месте, адрес запоминается на карточке. */
export const AddressField = ({ row, value, onChange }: { row: Row; value: string; onChange: (v: string) => void }) => (
  <div className="flex flex-col gap-1">
    <Input aria-label={`Адрес: ${row.who?.name}`} autoFocus className="h-8" onChange={(e) => onChange(e.target.value)} placeholder={`Адрес: ${row.who?.name}`} type="email" value={value} />
    <span className="text-muted-foreground text-xs">Адрес сохранится на карточке «{row.who?.name}»</span>
  </div>
);

/** Почта не подключена: черновик виден, отправить нечем. */
export const NoMailbox = ({ text }: { text: string }) => {
  const { say } = useProto();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <MailX className="size-3.5" /> Почта не подключена
      </span>
      <Button
        className="ms-auto"
        onClick={() => {
          void navigator.clipboard?.writeText(text);
          say("Текст скопирован");
        }}
        size="sm"
        variant="ghost"
      >
        Скопировать
      </Button>
      <Button className={PRESS} onClick={() => say("Откроются настройки почты")} size="sm">
        Подключить почту
      </Button>
    </div>
  );
};

/** После отправки: строка уходит, на карточке — событие «Напомнил …». */
export const sentNote = (row: Row) => `Письмо отправлено. На карточке «${row.who?.name}»: напомнил про ${row.topic}`;

/** Список строк и что из него ушло. */
export const useRows = () => {
  const [gone, setGone] = useState<string[]>([]);
  return {
    drop: (id: string) => setGone((g) => [...g, id]),
    rows: ROWS.filter((r) => !gone.includes(r.id)),
  };
};

// ── Экран нового чата ────────────────────────────────────────────────────────────────────────────────────────────────

/** Экран нового чата: дата, приветствие, «Не упустить», поле внизу. `put` кладёт текст в поле. */
export const Welcome = ({
  children,
  onSend,
}: {
  children: (put: (t: string) => void) => React.ReactNode;
  onSend?: (text: string) => void;
}) => {
  const [text, setText] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const { say } = useProto();
  const put = (t: string) => {
    setText(t);
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(t.length, t.length);
    });
  };
  const send = () => {
    if (!text.trim()) return;
    if (onSend) onSend(text);
    else say("Вопрос уйдёт в новый чат");
    setText("");
  };
  return (
    <Shell area="chat" title="Новый чат">
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="flex w-full max-w-xl flex-col gap-8">
          <div className="flex flex-col items-center text-center">
            <p className="text-muted-foreground mb-2.5 text-[11px] font-medium tracking-[0.22em] uppercase">Суббота, 14 ноября</p>
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Доброе утро</h1>
          </div>
          {children(put)}
        </div>
      </div>
      <Composer field={field} onChange={setText} onSend={send} text={text} />
    </Shell>
  );
};

export const Composer = ({
  text,
  onChange,
  onSend,
  field,
}: {
  text: string;
  onChange: (t: string) => void;
  onSend: () => void;
  field?: React.RefObject<HTMLTextAreaElement | null>;
}) => (
  <div className="bg-background sticky bottom-0 mx-auto w-full max-w-2xl px-4 pt-2 pb-4">
    <form
      className="bg-background focus-within:ring-ring/20 flex items-end gap-1 rounded-3xl border p-1.5 pl-4 shadow-xs transition-shadow duration-150 focus-within:ring-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <textarea
        aria-label="Сообщение"
        className="placeholder:text-muted-foreground block max-h-40 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-base leading-6 outline-none [field-sizing:content] sm:text-sm"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder="Сообщение"
        ref={field}
        rows={1}
        value={text}
      />
      <Button aria-label="Отправить" className={cn("rounded-full", PRESS)} disabled={!text.trim()} size="icon" type="submit">
        <ArrowUp />
      </Button>
    </form>
  </div>
);

export const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section>
    <h2 className="text-muted-foreground mb-2 text-xs font-medium">{title}</h2>
    {children}
  </section>
);

/** Просьба, которую строка кладёт в поле (как сейчас). */
export const askOf = (row: Row) =>
  row.side === "mine" ? `Помоги сделать: ${row.text}` : `Составь короткое вежливое напоминание.\nКому: ${row.who?.name}\nО чём: ${row.text}.`;
