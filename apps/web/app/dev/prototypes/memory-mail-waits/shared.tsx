"use client";

import { Button } from "@metobe/ui/components/button";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import { ChevronLeft, Ellipsis, Mail, MailQuestion } from "lucide-react";

import { ROWS, Section, TodayRow, Welcome, askOf } from "../memory-remind-letter/shared";
import type { Row } from "../memory-remind-letter/shared";
import { ENTER, PRESS, Shell, rise, usePhone, useProto } from "../memory/frame";

// Общее для P24 (Г3.1): письмо человеку из памяти ушло, ответа нет дольше правила ожидания — строка в «Не упустить».
// Модели нет: связь «письмо — ответ» по заголовкам и теме (S16). Что видно: тема, кому, сколько ждём; «Напомнить» —
// ответом в ту же цепочку (окно P23 с «Re: …»), «Убрать» — до нового письма в цепочке. И где включается «Память читает
// эту почту» (выключено по умолчанию), со временем последней проверки. Ручки: экран, почта включена.

export interface Wait {
  id: string;
  subject: string;
  who: { name: string; first: string };
  /** Рабочих дней без ответа. */
  days: number;
  sentAt: string;
  box: string;
}

export const WAITS: Wait[] = [
  { box: "me@company.example", days: 6, id: "w1", sentAt: "6 ноября", subject: "Договор поставки на 2027 год", who: { first: "Ольга", name: "Ольга Ли" } },
  { box: "me@company.example", days: 8, id: "w2", sentAt: "4 ноября", subject: "Счёт за сканеры", who: { first: "Андрей", name: "Андрей Седов" } },
  { box: "me@company.example", days: 5, id: "w3", sentAt: "7 ноября", subject: "Макет главной страницы", who: { first: "Андрей", name: "Андрей Ланьшин" } },
];

export const BOXES = [
  { address: "me@company.example", checked: "сегодня в 14:05", on: true, waits: 3 },
  { address: "me@personal.example", checked: null, on: false, waits: 0 },
];

/** Ручки: какой экран и включено ли чтение почты. */
export const useWorld = () => {
  const { knobs } = useProto();
  return { mailOn: knobs.mail !== "off", screen: knobs.screen === "box" ? ("box" as const) : ("today" as const) };
};

const daysWord = (n: number) => `${n} раб. ${n % 10 === 1 && n % 100 !== 11 ? "день" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "дня" : "дней"}`;

const ROW =
  "bg-background hover:bg-[color-mix(in_oklab,var(--muted)_70%,var(--background))] flex min-h-11 w-full items-center gap-3 rounded-lg border px-3.5 py-2 text-left text-sm transition-[background-color,scale] duration-150 ease-out active:scale-[0.99] motion-reduce:transition-none";

/** «Напомнить» ответом в цепочку и «Убрать» — общие для вариантов. */
export const useWaitActions = () => {
  const { say } = useProto();
  return {
    dismiss: (w: Wait, drop: (id: string) => void) => {
      drop(w.id);
      say(`Убрано до нового письма в цепочке «${w.subject}»`);
    },
    remind: (w: Wait) => say(`Окно «Напомнить» (P23): ответом в цепочку «Re: ${w.subject}», кому — ${w.who.name}`),
  };
};

/** Строка «нет ответа» в виде строк «Не упустить»: значок письма, тема, справа — сколько ждём и кому. */
export const MailRow = ({ w, n, onRemind, onDismiss, onPut }: { w: Wait; n: number; onRemind: () => void; onDismiss: () => void; onPut: () => void }) => {
  const phone = usePhone();
  return (
    <div className={cn("group relative", ENTER)} style={rise(n)}>
      <button className={cn(ROW, phone ? "pr-16" : "pr-36")} onClick={onPut} type="button">
        <span aria-hidden className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full">
          <Mail className="size-3" />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-3 @max-md:flex-col @max-md:items-start @max-md:gap-0.5">
          <span className="min-w-0 flex-1 truncate @max-md:whitespace-normal">
            Нет ответа: «{w.subject}»
          </span>
          <span className="text-muted-foreground shrink-0 text-xs">
            {daysWord(w.days)} · {w.who.name}
          </span>
        </span>
      </button>
      <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-0.5">
        {phone ? (
          <Button aria-label="Напомнить" className={PRESS} onClick={onRemind} size="icon-xs" variant="ghost">
            <Mail />
          </Button>
        ) : (
          <Button className={cn("h-7 gap-1.5 px-2 text-xs opacity-0 group-hover:opacity-100 focus-visible:opacity-100", PRESS)} onClick={onRemind} size="sm" variant="ghost">
            <Mail className="size-3.5" /> Напомнить
          </Button>
        )}
        <Button aria-label="Убрать" className="opacity-60 group-hover:opacity-100" onClick={onDismiss} size="icon-xs" title="Убрать" variant="ghost">
          <Ellipsis />
        </Button>
      </div>
    </div>
  );
};

/** Просьба в поле по нажатию на строку — как у других строк. */
export const askOfWait = (w: Wait) => `Помоги напомнить ${w.who.name} про письмо «${w.subject}» от ${w.sentAt}: ответа нет ${daysWord(w.days)}.`;

/** Остальные строки «Не упустить» — из P23. */
export const OtherRows = ({ put, start }: { put: (t: string) => void; start: number }) => {
  const { say } = useProto();
  return (
    <>
      {ROWS.map((row: Row, i) => (
        <TodayRow key={row.id} n={start + i} onPut={(r) => put(askOf(r))} onRemind={() => say("Окно «Напомнить» (P23)")} row={row} />
      ))}
    </>
  );
};

export { Section, Welcome };

// ── Переключатель ───────────────────────────────────────────────────────────────────────────────────────────────────

export const MAIL_HINT = "Память смотрит, кому вы написали и ответили ли вам — по адресам и темам. Тексты писем не читает и не хранит.";

/** «Память читает эту почту» — строка с переключателем, подсказкой и временем проверки. */
export const ReadToggle = ({ on, onChange, checked, waits }: { on: boolean; onChange: (v: boolean) => void; checked: string | null; waits: number }) => (
  <div className="flex items-start gap-3 py-3">
    <MailQuestion className="text-muted-foreground mt-0.5 size-4 shrink-0" />
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-sm font-medium">Замечать письма без ответа</span>
      <span className="text-muted-foreground text-xs">{MAIL_HINT}</span>
      {on && (
        <span className="text-muted-foreground text-xs">
          {checked ? `Проверено ${checked}` : "Ещё не проверялось"}
          {waits > 0 ? ` · ждут ответа: ${waits}` : ""}
        </span>
      )}
    </div>
    <Switch aria-label="Замечать письма без ответа" checked={on} onCheckedChange={onChange} />
  </div>
);

/** Страница ящика в «Подключения → Почта»: что есть сейчас, и строка памяти. */
export const BoxPage = ({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) => {
  const phone = usePhone();
  return (
    <Shell area="chat" title="Почта">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 @lg:pt-20">
        <header className="flex items-center gap-2">
          {phone ? null : (
            <Button aria-label="Назад" size="icon-sm" variant="ghost">
              <ChevronLeft />
            </Button>
          )}
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold">me@company.example</h2>
            <span className="text-muted-foreground text-xs">Яндекс · подключена 28 сентября</span>
          </div>
        </header>
        <section className="flex flex-col divide-y rounded-lg border px-4">
          <div className="flex items-center justify-between py-3 text-sm">
            <span>Искать и читать письма в чате</span>
            <span className="text-muted-foreground text-xs">разрешено</span>
          </div>
          <div className="flex items-center justify-between py-3 text-sm">
            <span>Отправлять письма из чата</span>
            <span className="text-muted-foreground text-xs">спрашивать</span>
          </div>
        </section>
        <section className="flex flex-col gap-1">
          <h3 className="text-muted-foreground text-xs font-medium">Память</h3>
          <div className="rounded-lg border px-4">
            <ReadToggle checked={BOXES[0]?.checked ?? null} on={on} onChange={onChange} waits={on ? WAITS.length : 0} />
          </div>
        </section>
      </div>
    </Shell>
  );
};
