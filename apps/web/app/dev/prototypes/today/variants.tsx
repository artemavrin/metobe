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
import { ArrowUp, Building2, Check, ChevronDown, Clock, Database, Ellipsis, FileText, Mail, X } from "lucide-react";
import { useRef, useState } from "react";

import { entity } from "../memory/data";
import { ENTER, PRESS, Shell, rise, usePhone, useProto } from "../memory/frame";

// P17 · раунд 2: главная остаётся экраном нового чата (дата, приветствие, строка дня, «Начать с», поле внизу), а в
// нём — предложения из памяти: кому напомнить, чего давно нет, что сделать самому. Предложение — как строка «Начать
// с»: нажатие кладёт готовую просьбу в поле, отправляет человек. В меню строки — «Уже сделано» (это пишется в
// память), «Отложить до завтра», «Убрать».
// «Строки» — раздел «На сегодня» над «Начать с», те же строки. «Карточки» — три карточки под приветствием.
// «Вместо «Начать с»» — пока есть предложения, «Начать с» свёрнут в одну строку.
// Параметры: предложений — нет, 3, 5. Раунд 1 (отдельная страница «Сегодня») — ./round-1.

interface Suggestion {
  id: string;
  who: string;
  /** Что сделать — глаголом. */
  text: string;
  /** Почему сейчас — коротко, справа. */
  meta: string;
  overdue?: boolean;
  /** Что ляжет в поле. */
  prompt: string;
}

const SUGGESTIONS: Suggestion[] = [
  { id: "olga", meta: "12 дней", overdue: true, prompt: "Напиши Ольге Ли короткое напоминание про подписанный договор — обещала 28 октября", text: "Напомнить Ольге Ли о подписанном договоре", who: "olga" },
  { id: "vector", meta: "6 дней без ответа", overdue: true, prompt: "Напиши ООО «Вектор» вежливое письмо: ждём ответа на коммерческое предложение от 3 ноября", text: "Спросить «Вектор» об ответе на предложение", who: "vector" },
  { id: "andrey", meta: "не было 20 дней", prompt: "Предложи Андрею Смирнову время для встречи один на один на этой неделе", text: "Назначить встречу один на один с Андреем Смирновым", who: "andrey" },
  { id: "marina", meta: "до среды", prompt: "Помоги написать отзыв на презентацию Марины Орловой", text: "Написать отзыв на презентацию Марины Орловой", who: "marina" },
  { id: "bday", meta: "в субботу", prompt: "Напиши короткое поздравление с днём рождения для Ольги Ли", text: "Поздравить Ольгу Ли с днём рождения", who: "olga" },
];

// Те же строки, что у настоящего экрана (components/chat/welcome.tsx).
const ROW =
  "bg-background hover:bg-[color-mix(in_oklab,var(--muted)_70%,var(--background))] flex h-11 w-full items-center gap-3 rounded-lg border px-3.5 text-left text-sm transition-[background-color,scale] duration-150 ease-out active:scale-[0.99] motion-reduce:transition-none";

const useSuggestions = () => {
  const { knobs, say } = useProto();
  const [gone, setGone] = useState<string[]>([]);
  const all = SUGGESTIONS.slice(0, Number(knobs.n));
  const drop = (s: Suggestion, text: string) => {
    setGone((g) => [...g, s.id]);
    say(text, () => setGone((g) => g.filter((x) => x !== s.id)));
  };
  return {
    done: (s: Suggestion) => drop(s, "Отмечено в памяти как сделанное"),
    items: all.filter((s) => !gone.includes(s.id)),
    remove: (s: Suggestion) => drop(s, "Убрано"),
    snooze: (s: Suggestion) => drop(s, "Отложено до завтра"),
  };
};
type Suggest = ReturnType<typeof useSuggestions>;

const Initials = ({ id }: { id: string }) => {
  const e = entity(id);
  return (
    <span aria-hidden className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-[9px] font-medium">
      {e.kind === "org" ? <Building2 className="size-3" /> : e.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
    </span>
  );
};

const Menu = ({ s, sug, className }: { s: Suggestion; sug: Suggest; className?: string }) => (
  <DropdownMenu>
    <DropdownMenuTrigger render={<Button aria-label="Ещё" className={className} size="icon-xs" variant="ghost" />}>
      <Ellipsis />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-48">
      <DropdownMenuItem onClick={() => sug.done(s)}>
        <Check /> Уже сделано
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => sug.snooze(s)}>
        <Clock /> Отложить до завтра
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => sug.remove(s)}>
        <X /> Убрать
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

/** Строка предложения: как «Начать с», справа — почему сейчас; меню проявляется при наведении. */
const SuggestRow = ({ s, sug, put, n }: { s: Suggestion; sug: Suggest; put: (t: string) => void; n: number }) => {
  const phone = usePhone();
  return (
    <div className={cn("group relative", ENTER)} style={rise(n)}>
      {/* На узком экране текст переносится, а «почему» встаёт под ним: обрезанное предложение не прочитать. */}
      <button className={cn(ROW, "pr-10 @max-md:h-auto @max-md:min-h-11 @max-md:py-2.5")} onClick={() => put(s.prompt)} type="button">
        <Initials id={s.who} />
        <span className="flex min-w-0 flex-1 items-center gap-3 @max-md:flex-col @max-md:items-start @max-md:gap-0.5">
          <span className="min-w-0 flex-1 truncate @max-md:whitespace-normal">{s.text}</span>
          <span className={cn("text-muted-foreground shrink-0 text-xs", s.overdue && "text-warning-foreground dark:text-warning")}>{s.meta}</span>
        </span>
      </button>
      <Menu className={cn("absolute top-1/2 right-2 -translate-y-1/2", !phone && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100")} s={s} sug={sug} />
    </div>
  );
};

const Section = ({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) => (
  <section>
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-muted-foreground text-xs font-medium">{title}</h2>
      {aside}
    </div>
    {children}
  </section>
);

const StartRows = ({ put }: { put: (t: string) => void }) => {
  const { say } = useProto();
  return (
    <div className="flex flex-col gap-2">
      <button className={ROW} onClick={() => say("В поле встанет значок сервера «CRM»")} type="button">
        <Database className="text-muted-foreground size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">CRM</span>
      </button>
      <button className={ROW} onClick={() => put("Что непрочитанного в почте?")} type="button">
        <Mail className="text-muted-foreground size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">Непрочитанное в почте</span>
        <span className="text-muted-foreground max-w-[45%] truncate text-xs">me@company.ru</span>
      </button>
      <button className={ROW} onClick={() => say("Откроется выбор файла")} type="button">
        <FileText className="text-muted-foreground size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">Разобрать файл</span>
        <span className="text-muted-foreground shrink-0 text-xs">PDF, Word, Excel, картинки</span>
      </button>
    </div>
  );
};

/** Экран нового чата: дата, приветствие, строка дня, разделы; поле внизу. `put` кладёт текст в поле. */
const Welcome = ({ children }: { children: (put: (t: string) => void) => React.ReactNode }) => {
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
    say("Вопрос уйдёт в новый чат");
    setText("");
  };
  return (
    <Shell area="chat" title="Новый чат">
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="flex w-full max-w-xl flex-col gap-8">
          <div className="flex flex-col items-center text-center">
            <p className="text-muted-foreground mb-2.5 text-[11px] font-medium tracking-[0.22em] uppercase">Понедельник, 9 ноября</p>
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Доброе утро</h1>
            <p className="text-foreground/65 mx-auto mt-3 max-w-lg text-[15px] leading-snug text-balance">Точный вопрос экономит час поиска.</p>
          </div>
          {children(put)}
        </div>
      </div>
      <div className="bg-background sticky bottom-0 mx-auto w-full max-w-2xl px-4 pt-2 pb-4">
        <form
          className="bg-background focus-within:ring-ring/20 flex items-end gap-1 rounded-3xl border p-1.5 pl-4 shadow-xs transition-shadow duration-150 focus-within:ring-3"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            aria-label="Сообщение"
            className="placeholder:text-muted-foreground block max-h-40 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-base leading-6 outline-none [field-sizing:content] sm:text-sm"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
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
    </Shell>
  );
};

/** Сколько видно сразу; остальное — «Ещё N». */
const FIRST = 3;

const SuggestList = ({ sug, put }: { sug: Suggest; put: (t: string) => void }) => {
  const [all, setAll] = useState(false);
  const shown = all ? sug.items : sug.items.slice(0, FIRST);
  const more = sug.items.length - shown.length;
  return (
    <div className="flex flex-col gap-2">
      {shown.map((s, i) => (
        <SuggestRow key={s.id} n={i} put={put} s={s} sug={sug} />
      ))}
      {more > 0 && (
        <button className="text-muted-foreground hover:text-foreground flex items-center gap-1 self-start px-1 text-xs transition-colors duration-150" onClick={() => setAll(true)} type="button">
          <ChevronDown className="size-3.5" /> Ещё {more}
        </button>
      )}
    </div>
  );
};

// ── Варианты ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export const Rows = () => {
  const sug = useSuggestions();
  return (
    <Welcome>
      {(put) => (
        <>
          {sug.items.length > 0 && (
            <Section title="На сегодня">
              <SuggestList put={put} sug={sug} />
            </Section>
          )}
          <Section title="Начать с">
            <StartRows put={put} />
          </Section>
        </>
      )}
    </Welcome>
  );
};

export const Cards = () => {
  const sug = useSuggestions();
  return (
    <Welcome>
      {(put) => (
        <>
          {sug.items.length > 0 && (
            <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] @lg:mx-0 @lg:grid @lg:grid-cols-3 @lg:overflow-visible @lg:px-0">
              {sug.items.slice(0, 3).map((s, i) => (
                <div className={cn("group relative w-56 shrink-0 snap-start @lg:w-auto", ENTER)} key={s.id} style={rise(i)}>
                  <button
                    className="bg-background hover:bg-[color-mix(in_oklab,var(--muted)_70%,var(--background))] flex h-full w-full flex-col gap-3 rounded-xl border p-3 text-left transition-[background-color,scale] duration-150 ease-out active:scale-[0.99]"
                    onClick={() => put(s.prompt)}
                    type="button"
                  >
                    <Initials id={s.who} />
                    <span className="text-sm leading-5">{s.text}</span>
                    <span className={cn("text-muted-foreground mt-auto text-xs", s.overdue && "text-warning-foreground dark:text-warning")}>{s.meta}</span>
                  </button>
                  <Menu className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100" s={s} sug={sug} />
                </div>
              ))}
            </div>
          )}
          <Section title="Начать с">
            <StartRows put={put} />
          </Section>
        </>
      )}
    </Welcome>
  );
};

export const Instead = () => {
  const sug = useSuggestions();
  const [start, setStart] = useState(false);
  return (
    <Welcome>
      {(put) =>
        sug.items.length > 0 ? (
          <Section
            aside={
              <button className="text-muted-foreground hover:text-foreground text-xs transition-colors duration-150" onClick={() => setStart((v) => !v)} type="button">
                {start ? "На сегодня" : "Начать с…"}
              </button>
            }
            title={start ? "Начать с" : "На сегодня"}
          >
            {start ? <StartRows put={put} /> : <SuggestList put={put} sug={sug} />}
          </Section>
        ) : (
          <Section title="Начать с">
            <StartRows put={put} />
          </Section>
        )
      }
    </Welcome>
  );
};
