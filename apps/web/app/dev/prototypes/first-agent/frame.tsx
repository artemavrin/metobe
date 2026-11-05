"use client";

import { Button } from "@metobe/ui/components/button";
import { Spinner } from "@metobe/ui/components/spinner";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowUp, CalendarClock, Database, FileText, Globe, Mail, SquarePen } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRef } from "react";

import { CHATS, EXAMPLES, firstRun, nextRuns, runWords, scheduleWords } from "./data";
import type { Draft, Tool, ToolIcon } from "./data";
import { useProto } from "./state";

// Общее для трёх вариантов: приложение вокруг (боковая панель с «Задачами», на телефоне — кадр), начало страницы
// (заголовок и поле «Что поручить?» с примерами), факты черновика, инструмент со входом и страница созданной задачи.
// Движение: одна кривая ease-out (0.23, 1, 0.32, 1); появление — 200 мс, подъём на 4 px и проявление, строки черновика
// по очереди через 40 мс; нажатие — 0.97 за 160 мс. При «меньше движения» остаётся только проявление.

export const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";
export const ENTER = `animate-in fade-in slide-in-from-bottom-1 duration-200 ${EASE} motion-reduce:slide-in-from-bottom-0`;
export const PRESS = "transition-transform duration-160 ease-out active:scale-[0.97] motion-reduce:active:scale-100";
/** The n-th row of something that came: 40 ms after the one before, held hidden until its turn. */
export const rise = (n: number) => ({ animationDelay: `${n * 40}ms`, animationFillMode: "both" as const });

export const usePhone = () => useProto().screen === "phone";

// ── Приложение вокруг ────────────────────────────────────────────────────────────────────────────────────────────────

/** Задача в боковой панели: открыта ли сейчас и есть ли итог, который ещё не видели. */
export interface SideTask { name: string; color: string; active?: boolean; unread?: boolean }

/** `chat` — открытый сейчас чат: стоит первым в «Чатах», пока не стал задачей. `area` — какой пункт выбран. `tasks` —
 *  готовый список задач вместо только что созданной. */
const Sidebar = ({ chat, area = "agents", tasks }: { chat?: string; area?: "agents" | "chat"; tasks?: SideTask[] }) => {
  const { created } = useProto();
  return (
    <aside className="bg-sidebar text-sidebar-foreground flex w-60 shrink-0 flex-col gap-4 border-r p-2 text-sm">
      <div className="flex flex-col gap-0.5">
        <span className="flex items-center gap-2 rounded-md px-2 py-1.5">
          <SquarePen className="size-4" />
          Новый чат
        </span>
        <span className={cn("flex items-center gap-2 rounded-md px-2 py-1.5", area === "agents" && !created?.chat && !tasks?.some((t) => t.active) && "bg-sidebar-accent font-medium")}>
          <CalendarClock className="size-4" />
          Задачи
        </span>
        {tasks?.map((t) => (
          // Новый итог — точка цвета задачи справа: увидел, открыл — точка гаснет.
          <span className={cn("ml-6 flex items-center gap-2 rounded-md px-2 py-1.5", t.active && "bg-sidebar-accent font-medium")} key={t.name}>
            <span className="size-2 shrink-0 rounded-full" style={{ background: t.color }} />
            <span className={cn("min-w-0 flex-1 truncate", t.unread && "font-medium")}>{t.name}</span>
            {t.unread && <span aria-label="новый итог" className="bg-foreground size-1.5 shrink-0 rounded-full" />}
          </span>
        ))}
        {!tasks && created && (
          // Новая задача встаёт под «Задачами»: вот где она теперь живёт. Подсветка гаснет за секунду.
          <span className={cn("ml-6 truncate rounded-md px-2 py-1.5", created.chat ? "bg-sidebar-accent font-medium" : "animate-agent-arrive", ENTER, "flex items-center gap-2")}>
            {created.color && <span className="size-2 shrink-0 rounded-full" style={{ background: created.color }} />}
            <span className="truncate">{created.name}</span>
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-muted-foreground px-2 pb-1 text-xs">Чаты</span>
        {chat && !created && <span className={cn("bg-sidebar-accent truncate rounded-md px-2 py-1.5 font-medium", ENTER)}>{chat}</span>}
        {CHATS.map((c) => (
          <span className="text-muted-foreground truncate rounded-md px-2 py-1.5" key={c}>
            {c}
          </span>
        ))}
      </div>
    </aside>
  );
};

const Toast = () => {
  const { note } = useProto();
  if (!note) return null;
  return (
    <div className={cn("bg-foreground text-background absolute bottom-24 left-1/2 z-50 max-w-[90%] -translate-x-1/2 rounded-full px-3 py-1.5 text-center text-xs", ENTER)}>
      {note}
    </div>
  );
};

const ARRIVE_CSS = `
@keyframes agent-arrive { from { background-color: var(--sidebar-accent); } to { background-color: transparent; } }
.animate-agent-arrive { animation: agent-arrive 1200ms ease 400ms both; }
`;

/** Компьютер — боковая панель и страница; телефон — кадр 390 px со строкой заголовка. */
export const Shell = ({ title, children, chat, area, tasks }: { title: string; children: React.ReactNode; chat?: string; area?: "agents" | "chat"; tasks?: SideTask[] }) => {
  const phone = usePhone();
  if (phone) {
    return (
      <div className="bg-muted/40 flex min-h-dvh justify-center py-8">
        <style>{ARRIVE_CSS}</style>
        <div className="bg-background relative flex h-[812px] w-[390px] flex-col overflow-hidden rounded-[2.5rem] border pt-6 shadow-xl">
          <div className="flex h-12 shrink-0 items-center border-b px-5 text-sm font-medium">{title}</div>
          <div className="@container relative flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:none]">{children}</div>
          <Toast />
        </div>
      </div>
    );
  }
  return (
    <div className="bg-background text-foreground flex h-dvh overflow-hidden">
      <style>{ARRIVE_CSS}</style>
      <Sidebar area={area} chat={chat} tasks={tasks} />
      <main className="relative min-w-0 flex-1">
        <div className="@container flex h-full flex-col overflow-y-auto">{children}</div>
        <Toast />
      </main>
    </div>
  );
};

// ── Начало: заголовок и поле ─────────────────────────────────────────────────────────────────────────────────────────

export const Intro = ({ className }: { className?: string }) => (
  <header className={cn("flex flex-col gap-1.5", className)}>
    <h1 className="text-xl font-semibold tracking-tight">Задачи</h1>
    <p className="text-muted-foreground max-w-prose text-sm text-pretty">
      Задача запускается по расписанию, работает вашими подключениями и пишет, когда есть что сказать.
    </p>
  </header>
);

/**
 * «Что поручить?»: поле на две строки, Enter — отправить, Shift+Enter — новая строка. Примеры под ним вписывают
 * текст в поле, а не отправляют: человек видит, как это сказано, и может поправить.
 */
export const AskField = ({
  value,
  onChange,
  onSubmit,
  busy = false,
  examples = true,
  autoFocus = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  busy?: boolean;
  examples?: boolean;
  autoFocus?: boolean;
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const send = () => {
    const text = value.trim();
    if (text && !busy) onSubmit(text);
  };
  return (
    <div className="flex flex-col gap-3">
      <form
        className="bg-background focus-within:border-ring/60 focus-within:ring-ring/20 flex flex-col rounded-2xl border shadow-xs transition-[border-color,box-shadow] duration-150 focus-within:ring-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label className="sr-only" htmlFor="agent-ask">
          Что поручить?
        </label>
        <textarea
          // biome-ignore lint/a11y/noAutofocus: the page is this field.
          autoFocus={autoFocus}
          className="placeholder:text-muted-foreground min-h-16 resize-none bg-transparent px-4 pt-3.5 text-base outline-none sm:text-sm"
          id="agent-ask"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Что поручить? Что сделать и когда — своими словами"
          ref={ref}
          rows={2}
          value={value}
        />
        <div className="flex items-center justify-end gap-2 px-2 pb-2">
          <Button aria-label="Отправить" className={cn("rounded-full", PRESS)} disabled={!value.trim() || busy} size="icon" type="submit">
            {busy ? <Spinner /> : <ArrowUp />}
          </Button>
        </div>
      </form>
      {examples && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <Button
              className={cn("rounded-full font-normal", PRESS)}
              key={e.label}
              onClick={() => {
                onChange(e.text);
                ref.current?.focus();
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              {e.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Черновик ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export const TOOL_ICON: Record<ToolIcon, LucideIcon> = { crm: Database, globe: Globe, mail: Mail, page: FileText };

/** Инструмент: значок и имя; сервис без входа — «нужен вход» и «Войти» (в продукте — окно сервиса или поля). */
export const ToolChip = ({ tool, onRemove }: { tool: Tool; onRemove?: () => void }) => {
  const { mail, setMail, say } = useProto();
  const Icon = TOOL_ICON[tool.icon];
  const needs = tool.signIn && !mail;
  return (
    <span className="bg-muted/60 inline-flex h-7 items-center gap-1.5 rounded-full pr-1 pl-2.5 text-[0.8rem]">
      <Icon className="text-muted-foreground size-3.5" />
      {tool.name}
      {needs ? (
        <>
          <span className="text-warning">· нужен вход</span>
          <Button
            className={cn("h-5 rounded-full px-2 text-xs", PRESS)}
            onClick={() => {
              setMail(true);
              say("Вход в почту — в продукте откроется окно с полями или окно сервиса");
            }}
            size="xs"
            type="button"
          >
            Войти
          </Button>
        </>
      ) : (
        <span className="w-1.5" />
      )}
      {onRemove && (
        <button
          aria-label={`Убрать «${tool.name}»`}
          className="text-muted-foreground hover:text-foreground -ml-1 grid size-5 place-items-center rounded-full transition-colors duration-150"
          onClick={onRemove}
          type="button"
        >
          ×
        </button>
      )}
    </span>
  );
};

/** «В Metobe · push · на почту» и когда: «когда есть что сказать» или «после каждого запуска». */
export const reportWords = (d: Draft) => {
  const where = ["здесь", d.push && "уведомлением", d.email && "на почту"].filter(Boolean).join(", ");
  return `${d.quiet ? "Когда есть что сказать" : "После каждого запуска"} — ${where}`;
};

export const NextRuns = ({ draft, className }: { draft: Draft; className?: string }) => (
  <span className={cn("text-muted-foreground text-xs tabular-nums", className)}>
    {nextRuns(draft.schedule).map((d) => runWords(d)).join(" · ")}
  </span>
);

export const Fact = ({ label, children, n }: { label: string; children: React.ReactNode; n: number }) => (
  <div className={cn("grid grid-cols-[5.5rem_1fr] items-baseline gap-3 py-2 @max-sm:grid-cols-1 @max-sm:gap-1", ENTER)} style={rise(n)}>
    <span className="text-muted-foreground text-xs">{label}</span>
    <div className="flex min-w-0 flex-col gap-1">{children}</div>
  </div>
);

const capital = (s: string) => s.replace(/^./u, (c) => c.toUpperCase());

/** Черновик для чтения — «Разговор»: всё меняется словами в чате, в карточке только вход и две кнопки. */
export const DraftCard = ({ draft, onCreate, onTest, live = true }: { draft: Draft; onCreate: () => void; onTest: () => void; live?: boolean }) => (
  <div className={cn("bg-card @container flex max-w-xl flex-col rounded-xl border shadow-xs", ENTER, !live && "opacity-60")}>
    <div className="flex flex-col gap-1 px-4 pt-3.5 pb-2">
      <span className="text-muted-foreground text-xs">Черновик задачи</span>
      <span className="font-medium">{draft.name}</span>
      <p className="text-muted-foreground text-sm text-pretty">{draft.does}</p>
      {draft.notes.map((n) => (
        <p className="text-muted-foreground text-sm" key={n}>
          Ещё: {n}
        </p>
      ))}
    </div>
    <div className="divide-y border-t px-4">
      <Fact label="Когда" n={1}>
        <span className="text-sm">{capital(scheduleWords(draft.schedule))}</span>
        <NextRuns draft={draft} />
      </Fact>
      {draft.sites && (
        <Fact label="Сайты" n={2}>
          <span className="text-sm">{draft.sites.join(", ")}</span>
        </Fact>
      )}
      <Fact label="Пользуется" n={3}>
        <div className="flex flex-wrap gap-1.5">
          {draft.tools.map((t) => (
            <ToolChip key={t.id} tool={t} />
          ))}
        </div>
      </Fact>
      <Fact label="Сообщает" n={4}>
        <span className="text-sm">{reportWords(draft)}</span>
      </Fact>
    </div>
    {live && (
      <div className="flex items-center justify-end gap-2 border-t px-3 py-2.5">
        <Button className={PRESS} onClick={onTest} size="sm" variant="ghost">
          Прогнать сейчас
        </Button>
        <Button className={PRESS} onClick={onCreate} size="sm">
          Создать задачу
        </Button>
      </div>
    )}
  </div>
);

/** Switch с подписью — строка настроек черновика. */
export const Toggle = ({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) => (
  // biome-ignore lint/a11y/noLabelWithoutControl: the switch inside is the control.
  <label className="flex cursor-pointer items-start justify-between gap-4 py-1">
    <span className="flex flex-col">
      <span className="text-sm">{label}</span>
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </span>
    <Switch checked={checked} className="mt-0.5" onCheckedChange={onChange} />
  </label>
);

// ── Созданная задача ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Что человек видит сразу после «Создать»: задача, что она делает и когда будет первый результат. Больше ничего. */
export const Created = ({ draft }: { draft: Draft }) => {
  const { say, mail } = useProto();
  const waits = draft.tools.some((t) => t.signIn) && !mail;
  return (
    <div className={cn("mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 py-10 @lg:px-8", ENTER)}>
      <header className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-xs">Задачи</span>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold tracking-tight">{draft.name}</h1>
          <Switch aria-label="Задача включена" defaultChecked />
        </div>
        <p className="text-muted-foreground text-sm text-pretty">
          {capital(scheduleWords(draft.schedule))}. {draft.does}
        </p>
      </header>
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <CalendarClock className="text-muted-foreground size-5" />
        <div className="flex flex-col gap-1">
          <p className="font-medium">Первый запуск — {firstRun(draft.schedule)}</p>
          <p className="text-muted-foreground max-w-sm text-sm text-pretty">
            {waits
              ? "Перед ним понадобится вход в почту — попросим об этом здесь."
              : `Результат появится здесь${draft.push ? " и придёт уведомлением" : ""}.${draft.quiet ? " Если сказать будет нечего, итога не будет." : ""}`}
          </p>
        </div>
        <Button className={cn("mt-1", PRESS)} onClick={() => say("Тестовый прогон начался — итог придёт сюда, без уведомлений")} size="sm" variant="outline">
          Прогнать сейчас
        </Button>
      </div>
    </div>
  );
};

export const Thinking = ({ children }: { children: React.ReactNode }) => (
  <div className={cn("text-muted-foreground flex items-center gap-2 text-sm", ENTER)}>
    <Spinner className="size-3.5" />
    {children}
  </div>
);
