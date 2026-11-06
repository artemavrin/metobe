"use client";

import type { ChatMessage } from "@metobe/contracts/chat";
import { Button } from "@metobe/ui/components/button";
import { Kbd } from "@metobe/ui/components/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@metobe/ui/components/popover";
import { Switch } from "@metobe/ui/components/switch";
import { ToggleGroup, ToggleGroupItem } from "@metobe/ui/components/toggle-group";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowUp, Bot, CalendarDays, ChevronDown, Clock, Database, Globe, Mail, Repeat, Send, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AssistantMessage, UserMessage } from "@/components/chat/messages";

import { applyWords, draftFrom, MODEL, nextRuns, runWords, scheduleWords, sitesFrom } from "./data";
import type { Draft, Schedule, Tool } from "./data";
import { Created, ENTER, NextRuns, PRESS, Shell, Thinking, ToolChip } from "./frame";
import { useProto } from "./state";
import { ScheduleEditor, useFresh, useLater } from "./variants";

// P11 · первый агент, раунд 2. Раунд 1 (/first-agent/round-1) — три вида одного хода «описание → черновик модели»;
// его отвергли целиком. Здесь три разных хода, найденных у других:
// «Сначала сделать» — как ChatGPT Tasks и Poke: это обычный новый чат; модель делает дело сейчас, показывает итог,
//   и только под ним — «Делать это и дальше?». Агентом становится разговор, который уже дал результат.
// «Сотрудник» — как Notion Custom Agents: агент — страница с лицом, именем, инструкциями и явными доступами
//   (по умолчанию — никаких); модель только помогает дописать инструкции. Включается, когда всё заполнено.
// «Записка» — как быстрый ввод Todoist: человек пишет одну записку, а система подсвечивает, что поняла (когда, чем,
//   куда писать), прямо при наборе, без круга к модели. Под запиской — что понято и чего не хватает.

const capital = (s: string) => s.replace(/^./u, (c) => c.toUpperCase());

// ── Сначала сделать ──────────────────────────────────────────────────────────────────────────────────────────────────

type Kind = "mail" | "prices" | "report" | "other";
const kindOf = (d: Draft): Kind =>
  d.tools.some((t) => t.id === "mail") ? "mail" : d.sites !== null ? "prices" : d.tools.some((t) => t.id === "crm") ? "report" : "other";

const WORKING: Record<Kind, string> = {
  mail: "Смотрю почту за ночь…",
  other: "Делаю…",
  prices: "Открываю сайты и сравниваю цены…",
  report: "Собираю продажи из CRM…",
};

const resultOf = (kind: Kind, d: Draft) => {
  if (kind === "mail")
    return "За ночь пришло 14 писем, ответа ждут три:\n\n1. **Поставщик упаковки** — просит подтвердить новую цену до четверга.\n2. **Бухгалтерия** — нужен подписанный акт за октябрь.\n3. **Заявка с сайта** — спрашивают сроки доставки в другой город.\n\nОстальные 11 — рассылки и уведомления, их пропустил.";
  if (kind === "prices")
    return `Сравнил цены на ${(d.sites ?? []).join(", ")} с прошлой неделей:\n\n- **${d.sites?.[0] ?? "первый сайт"}** — 4 товара подешевели, в среднем на 6 %.\n- **${d.sites?.[1] ?? "второй сайт"}** — без изменений.\n${d.sites?.[2] ? `- **${d.sites[2]}** — появилась скидка 10 % на доставку.\n` : ""}\nКрупнее всего изменилось у первого: похоже на распродажу до конца недели.`;
  if (kind === "report")
    return "Продажи за октябрь:\n\n| | Октябрь | Сентябрь |\n|---|---|---|\n| Выручка | 2,4 млн ₽ | 2,2 млн ₽ |\n| Сделок | 61 | 58 |\n| Средний чек | 39 тыс. ₽ | 38 тыс. ₽ |\n\nВыручка выросла на 8 % — в основном за счёт крупных сделок во второй половине месяца.";
  return "Готово — вот что получилось. Если нужно иначе, напишите, что поменять.";
};

type Line = { id: string; role: "user" | "assistant"; text: string; at: string; kind?: "signin" | "offer" | "agent" };

const asMessage = (m: Line): ChatMessage => ({
  id: m.id,
  metadata: m.role === "assistant" ? { createdAt: m.at, modelId: MODEL.id } : { createdAt: m.at },
  parts: [{ text: m.text, type: "text" }],
  role: m.role,
});

/** Поле ввода чата — как у нового чата: круглое, внизу. */
const ChatInput = ({ onSend, busy, placeholder }: { onSend: (t: string) => void; busy: boolean; placeholder: string }) => {
  const [value, setValue] = useState("");
  return (
    <form
      className="bg-background focus-within:ring-ring/20 flex items-end gap-1 rounded-3xl border p-1.5 pl-4 shadow-xs transition-shadow duration-150 focus-within:ring-3"
      onSubmit={(e) => {
        e.preventDefault();
        const t = value.trim();
        if (!t || busy) return;
        onSend(t);
        setValue("");
      }}
    >
      <textarea
        aria-label={placeholder}
        className="placeholder:text-muted-foreground max-h-40 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-base outline-none [field-sizing:content] sm:text-sm"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder={placeholder}
        rows={1}
        value={value}
      />
      <Button aria-label="Отправить" className={cn("rounded-full", PRESS)} disabled={!value.trim() || busy} size="icon" type="submit">
        <ArrowUp />
      </Button>
    </form>
  );
};

/** «Делать это и дальше?» — тихая строка под итогом: расписание нажимается и правится тут же, без круга к модели. */
const Offer = ({ draft, onSchedule, onAccept }: { draft: Draft; onSchedule: (s: Schedule) => void; onAccept: () => void }) => (
  <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-2 pt-1 text-sm", ENTER)} style={{ animationDelay: "160ms", animationFillMode: "both" }}>
    <Repeat className="text-muted-foreground size-4" />
    <span>Делать это и дальше —</span>
    <Popover>
      <PopoverTrigger render={<Button className={cn("rounded-full", PRESS)} size="sm" variant="outline" />}>
        {scheduleWords(draft.schedule)}
        <ChevronDown className="opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[27rem] max-w-[calc(100vw-2rem)] gap-3 p-3">
        <ScheduleEditor onChange={onSchedule} schedule={draft.schedule} />
        <NextRuns draft={draft} />
      </PopoverContent>
    </Popover>
    <Button className={PRESS} onClick={onAccept} size="sm">
      Повторять
    </Button>
  </div>
);

export const DoFirst = () => {
  const setCreated = useFresh();
  const later = useLater();
  const { mail } = useProto();
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [awaiting, setAwaiting] = useState<"sites" | "signin" | null>(null);
  const [agent, setAgent] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines, working]);

  const add = (role: Line["role"], text: string, kind?: Line["kind"]) =>
    setLines((ls) => [...ls, { at: new Date().toISOString(), id: crypto.randomUUID(), kind, role, text }]);

  const run = (d: Draft, offer = true) => {
    setWorking(WORKING[kindOf(d)]);
    later(() => {
      setWorking(null);
      add("assistant", resultOf(kindOf(d), d));
      if (offer) add("assistant", "", "offer");
    }, 1400);
  };

  // Вошли в почту — дело продолжается само, как в продукте после «Плашки».
  useEffect(() => {
    if (awaiting === "signin" && mail && draft) {
      setAwaiting(null);
      run(draft);
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- runs once on sign-in
  }, [mail]);

  const send = (t: string) => {
    add("user", t);
    if (!draft) {
      const d = draftFrom(t);
      setDraft(d);
      const kind = kindOf(d);
      if (kind === "prices") {
        setWorking("Думаю…");
        later(() => {
          setWorking(null);
          add("assistant", "Каких конкурентов смотреть? Пришлите адреса сайтов через запятую.");
          setAwaiting("sites");
        });
      } else if (kind === "mail" && !mail) {
        setWorking("Думаю…");
        later(() => {
          setWorking(null);
          add("assistant", "Чтобы посмотреть почту, нужен вход в неё.", "signin");
          setAwaiting("signin");
        });
      } else run(d);
      return;
    }
    if (awaiting === "sites") {
      const sites = sitesFrom(t);
      if (sites.length === 0) {
        setWorking("Думаю…");
        later(() => {
          setWorking(null);
          add("assistant", "Не нашёл адресов. Пришлите сайты через запятую — например, shop-one.ru, shop-two.ru.");
        });
        return;
      }
      const d = { ...draft, sites };
      setDraft(d);
      setAwaiting(null);
      run(d);
      return;
    }
    const { draft: d, said } = applyWords(draft, t);
    setDraft(d);
    if (agent) setCreated({ ...d, chat: true });
    setWorking("Думаю…");
    later(() => {
      setWorking(null);
      add("assistant", agent ? `${said} Учту со следующего запуска.` : said);
    });
  };

  const accept = () => {
    if (!draft) return;
    setAgent(true);
    setCreated({ ...draft, chat: true });
    setLines((ls) => ls.map((l) => (l.kind === "offer" ? { ...l, kind: "agent" } : l)));
  };

  if (lines.length === 0) {
    // Тот же экран, что у нового чата: подпись сверху, крупный вопрос, строка под ним, поле ввода внизу.
    return (
      <Shell title="Агенты">
        <div className="flex flex-1 items-center justify-center px-4 py-8">
          <div className={cn("flex max-w-xl flex-col items-center text-center", ENTER)}>
            <p className="text-muted-foreground mb-2.5 text-[11px] font-medium tracking-[0.22em] uppercase">Агенты</p>
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Что делать за вас?</h1>
            <p className="text-foreground/65 mt-3 max-w-md text-[15px] leading-snug text-balance">
              Опишите дело — я сделаю его сейчас. Понравится итог — буду повторять сам.
            </p>
          </div>
        </div>
        <div className="sticky bottom-0 pb-4">
          <div className="mx-auto w-full max-w-3xl px-4">
            <ChatInput busy={false} onSend={send} placeholder="Что сделать?" />
          </div>
        </div>
      </Shell>
    );
  }

  const name = draft?.name ?? "Новый чат";
  const first = draft ? nextRuns(draft.schedule, 1)[0] : undefined;
  return (
    <Shell area="chat" chat={name} title={agent ? name : "Новый чат"}>
      <header className="bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b px-4 text-sm backdrop-blur @max-sm:hidden">
        {agent && <Bot className={cn("text-muted-foreground size-4", ENTER)} />}
        <span className="truncate font-medium">{name}</span>
        {agent && draft && (
          <span className={cn("text-muted-foreground flex items-center gap-1.5 truncate", ENTER)}>
            · {scheduleWords(draft.schedule)}
            {first && <span className="tabular-nums">· следующий {runWords(first)}</span>}
          </span>
        )}
        {agent && <Switch aria-label="Агент включён" className="ml-auto" defaultChecked />}
      </header>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 pt-8 pb-6">
        {lines.map((l) => {
          if (l.role === "user")
            return (
              <div className={ENTER} key={l.id}>
                <UserMessage message={asMessage(l)} />
              </div>
            );
          if (l.kind === "offer" && draft)
            return (
              <Offer
                draft={draft}
                key={l.id}
                onAccept={accept}
                onSchedule={(schedule) => setDraft({ ...draft, schedule })}
              />
            );
          if (l.kind === "agent" && draft)
            return (
              <div className={cn("text-muted-foreground flex items-center gap-3 text-xs", ENTER)} key={l.id}>
                <span className="bg-border h-px flex-1" />
                <span className="flex items-center gap-1.5">
                  <Bot className="size-3.5" />
                  Теперь это агент · следующий запуск {first ? runWords(first) : ""} · итоги — сюда же
                </span>
                <span className="bg-border h-px flex-1" />
              </div>
            );
          return (
            <div className="flex flex-col gap-3" key={l.id}>
              <div className={cn("[&_[data-slot=message-footer]]:hidden", ENTER)}>
                <AssistantMessage label={MODEL} live={false} message={asMessage(l)} />
              </div>
              {l.kind === "signin" && (
                <SignInBar />
              )}
            </div>
          );
        })}
        {working && <Thinking>{working}</Thinking>}
        <div ref={end} />
      </div>
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 pt-2 pb-4 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl px-4">
          <ChatInput busy={working !== null} onSend={send} placeholder={agent ? "Сказать агенту, что поменять…" : "Ответить…"} />
        </div>
      </div>
    </Shell>
  );
};

/** «Нужен вход в почту» — строкой в ответе, как «Плашка» (P8): поля откроются в окне. */
export const SignInBar = () => {
  const { mail, setMail, say } = useProto();
  return (
    <div className={cn("bg-muted/50 flex max-w-xl items-center gap-3 rounded-xl px-3 py-2.5", ENTER)}>
      <Mail className="text-muted-foreground size-4 shrink-0" />
      <span className="min-w-0 flex-1 text-sm">{mail ? "Почта подключена" : "Нужен вход в почту"}</span>
      {!mail && (
        <Button
          className={PRESS}
          onClick={() => {
            setMail(true);
            say("В продукте — окно с полями почты; здесь вход сразу удался");
          }}
          size="sm"
        >
          Войти
        </Button>
      )}
    </div>
  );
};

// ── Сотрудник ────────────────────────────────────────────────────────────────────────────────────────────────────────

type Access = "none" | "read" | "write";
interface Conn {
  id: string;
  name: string;
  icon: LucideIcon;
  /** Что даёт запись, словами; null — только чтение. */
  write: string | null;
  tool: Tool;
}

const CONNS: Conn[] = [
  { icon: Mail, id: "mail", name: "Почта", tool: { icon: "mail", id: "mail", instr: "почтой", name: "Почта", signIn: true }, write: "отправлять письма от вашего имени" },
  { icon: Database, id: "crm", name: "CRM", tool: { icon: "crm", id: "crm", instr: "CRM", name: "CRM" }, write: "менять сделки и контакты" },
  { icon: CalendarDays, id: "calendar", name: "Календарь", tool: { icon: "globe", id: "calendar", instr: "календарём", name: "Календарь" }, write: "создавать и переносить встречи" },
  { icon: Globe, id: "web", name: "Интернет", tool: { icon: "globe", id: "search", instr: "поиском в интернете", name: "Поиск в интернете" }, write: null },
];

const helpWrite = (t: string) =>
  `${t.trim().replace(/[.!]?$/u, ".")}\n\nКак работать:\n— смотреть только новое с прошлого запуска;\n— важное — то, что ждёт решения или ответа от меня;\n— остальное не пересказывать.\n\nИтог — короткий список, по строке на пункт, со ссылкой на источник.`;

/** Свойство страницы, как в Notion: подпись слева, значение — кнопка с поповером. */
const Prop = ({ label, icon: Icon, value, empty, children }: { label: string; icon: LucideIcon; value: string | null; empty: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-[8rem_1fr] items-center gap-2 text-sm @max-sm:grid-cols-[6.5rem_1fr]">
    <span className="text-muted-foreground flex items-center gap-2">
      <Icon className="size-4" />
      {label}
    </span>
    <Popover>
      <PopoverTrigger
        className={cn(
          "hover:bg-muted/70 data-[popup-open]:bg-muted -ml-2 w-fit rounded-md px-2 py-1 text-left transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
          !value && "text-muted-foreground"
        )}
      >
        {value ?? empty}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[27rem] max-w-[calc(100vw-2rem)] gap-3 p-3">
        {children}
      </PopoverContent>
    </Popover>
  </div>
);

export const Employee = () => {
  const setCreated = useFresh();
  const later = useLater();
  const { mail, setMail, say } = useProto();
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [quiet, setQuiet] = useState(true);
  const [push, setPush] = useState(true);
  const [access, setAccess] = useState<Record<string, Access>>({ calendar: "none", crm: "none", mail: "none", web: "none" });
  const [helping, setHelping] = useState(false);
  const [done, setDone] = useState<Draft | null>(null);

  const missing = [!name.trim() && "имя", text.trim().length < 12 && "инструкции", !schedule && "когда работать"].filter(Boolean) as string[];
  const granted = CONNS.filter((c) => access[c.id] !== "none");
  const draftNow = (): Draft => ({
    does: text.trim().split("\n")[0] ?? "",
    email: false,
    name: name.trim(),
    notes: [],
    push,
    quiet,
    schedule: schedule ?? { freq: "weekdays", hour: 9, minute: 0, weekday: 1 },
    sites: null,
    tools: granted.map((c) => c.tool),
  });

  if (done) {
    return (
      <Shell title="Агенты">
        <Created draft={done} />
      </Shell>
    );
  }

  const initial = name.trim().slice(0, 1).toUpperCase();
  return (
    <Shell title="Новый агент">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-6 pt-20 pb-28 @max-sm:px-5 @max-sm:pt-8">
        <header className={cn("flex flex-col gap-5", ENTER)}>
          <span className="bg-muted text-muted-foreground grid size-14 place-items-center rounded-2xl text-2xl font-semibold transition-colors duration-200">
            {initial || <Bot className="size-6" />}
          </span>
          <input
            aria-label="Имя агента"
            // biome-ignore lint/a11y/noAutofocus: a new page starts at its name.
            autoFocus
            className="placeholder:text-muted-foreground/50 -mx-1 bg-transparent px-1 text-3xl font-semibold tracking-tight outline-none"
            onChange={(e) => setName(e.target.value)}
            placeholder="Имя агента"
            value={name}
          />
          <div className="flex flex-col gap-1">
            <Prop empty="Не задано" icon={Clock} label="Когда" value={schedule ? capital(scheduleWords(schedule)) : null}>
              <ScheduleEditor onChange={setSchedule} schedule={schedule ?? { freq: "weekdays", hour: 9, minute: 0, weekday: 1 }} unset={!schedule} />
              {schedule ? (
                <span className="text-muted-foreground text-xs tabular-nums">{nextRuns(schedule).map((d) => runWords(d)).join(" · ")}</span>
              ) : (
                <span className="text-muted-foreground text-xs">Выберите, как часто</span>
              )}
            </Prop>
            <Prop empty="" icon={Send} label="Сообщает" value={`${quiet ? "Когда есть что сказать" : "После каждого запуска"}${push ? " · уведомлением" : ""}`}>
              <label className="flex items-center justify-between gap-4 text-sm">
                Молчать, если нечего сказать
                <Switch checked={quiet} onCheckedChange={setQuiet} />
              </label>
              <label className="flex items-center justify-between gap-4 text-sm">
                Уведомлять на телефон и в браузер
                <Switch checked={push} onCheckedChange={setPush} />
              </label>
            </Prop>
          </div>
        </header>

        <section className={cn("flex flex-col gap-2", ENTER)} style={{ animationDelay: "60ms", animationFillMode: "both" }}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium">Инструкции</h2>
            <Button
              className={cn("text-muted-foreground -mr-2", PRESS)}
              disabled={text.trim().length < 12 || helping}
              onClick={() => {
                setHelping(true);
                later(() => {
                  setText(helpWrite(text));
                  setHelping(false);
                }, 900);
              }}
              size="sm"
              variant="ghost"
            >
              <Sparkles />
              {helping ? "Дописываю…" : "Дописать"}
            </Button>
          </div>
          <textarea
            aria-label="Инструкции агента"
            className={cn(
              "placeholder:text-muted-foreground/60 min-h-40 resize-none bg-transparent text-[15px] leading-7 outline-none [field-sizing:content] transition-opacity duration-200",
              helping && "opacity-50"
            )}
            onChange={(e) => setText(e.target.value)}
            placeholder="Пишите как новому сотруднику: что сделать, что важно, что пропускать и в каком виде прислать итог."
            value={text}
          />
        </section>

        <section className={cn("flex flex-col gap-3", ENTER)} style={{ animationDelay: "120ms", animationFillMode: "both" }}>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-sm font-medium">Доступ</h2>
            <p className="text-muted-foreground text-sm">Агент видит только то, что вы откроете. Работает вашими входами.</p>
          </div>
          <div className="divide-y rounded-xl border">
            {CONNS.map((c) => {
              const Icon = c.icon;
              const needs = c.id === "mail" && !mail && access.mail !== "none";
              return (
                <div className="flex flex-col gap-2 px-3 py-2.5" key={c.id}>
                  <div className="flex flex-wrap items-center gap-3">
                    <Icon className="text-muted-foreground size-4" />
                    <span className="min-w-0 flex-1 text-sm">{c.name}</span>
                    <ToggleGroup
                      onValueChange={(v) => v[0] && setAccess((a) => ({ ...a, [c.id]: v[0] as Access }))}
                      size="sm"
                      spacing={0}
                      value={[access[c.id] ?? "none"]}
                      variant="outline"
                    >
                      <ToggleGroupItem value="none">Нет</ToggleGroupItem>
                      <ToggleGroupItem value="read">Читать</ToggleGroupItem>
                      {c.write && <ToggleGroupItem value="write">И менять</ToggleGroupItem>}
                    </ToggleGroup>
                  </div>
                  {access[c.id] === "write" && c.write && (
                    <span className={cn("text-muted-foreground pl-7 text-xs", ENTER)}>Сможет {c.write}</span>
                  )}
                  {needs && (
                    <span className={cn("flex items-center gap-2 pl-7 text-xs", ENTER)}>
                      <span className="text-warning">Нужен вход в почту</span>
                      <Button
                        className={cn("h-6", PRESS)}
                        onClick={() => {
                          setMail(true);
                          say("В продукте — окно с полями почты");
                        }}
                        size="xs"
                      >
                        Войти
                      </Button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
      <div className="bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky bottom-0 border-t backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-2 px-6 py-3 @max-sm:px-5">
          <span className="text-muted-foreground mr-auto text-xs">
            {missing.length ? `Осталось: ${missing.join(", ")}` : granted.length ? "Готов к работе" : "Готов — но без доступов он сможет только думать"}
          </span>
          <Button className={PRESS} disabled={missing.length > 0} onClick={() => say("Тестовый прогон: итог появится на странице агента, без уведомлений")} size="sm" variant="ghost">
            Прогнать сейчас
          </Button>
          <Button
            className={PRESS}
            disabled={missing.length > 0}
            onClick={() => {
              const d = draftNow();
              setCreated(d);
              setDone(d);
            }}
            size="sm"
          >
            Включить
          </Button>
        </div>
      </div>
    </Shell>
  );
};

// ── Записка ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export type TokenKind = "when" | "tool" | "say";
const PATTERNS: [TokenKind, RegExp][] = [
  ["when", /каждый будний день|каждое утро|каждый вечер|каждый день|ежедневно|по будням|в будни|по (?:понедельникам|вторникам|средам|четвергам|пятницам|субботам|воскресеньям)|раз в неделю|раз в месяц|в последний день месяца|в конце месяца/giu],
  ["when", /(?:в|к) \d{1,2}(?::\d{2})?(?: утра| вечера)?(?!\d)/giu],
  ["say", /только если[^,.\n]*|если (?:что-то |что-нибудь )?изменил\p{L}*|если есть что[^,.\n]*|на почту|уведомлени\p{L}*/giu],
  ["tool", /почт\p{L}*|письм\p{L}*|писем|crm|сайт\p{L}*|конкурент\p{L}*|интернет\p{L}*/giu],
];

type Segment = { text: string; kind?: TokenKind };

export const tokenize = (text: string) => {
  const found: { start: number; end: number; kind: TokenKind; text: string }[] = [];
  for (const [kind, re] of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      found.push({ end: start + m[0].length, kind, start, text: m[0] });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: typeof found = [];
  for (const f of found) if (!kept.some((k) => f.start < k.end && f.end > k.start)) kept.push(f);
  const segments: Segment[] = [];
  let at = 0;
  for (const k of kept) {
    if (k.start > at) segments.push({ text: text.slice(at, k.start) });
    segments.push({ kind: k.kind, text: k.text });
    at = k.end;
  }
  if (at < text.length) segments.push({ text: text.slice(at) });
  return { segments, tokens: kept };
};

const WEB: Tool = { icon: "globe", id: "search", instr: "поиском в интернете", name: "Поиск в интернете" };
const PAGES: Tool = { icon: "page", id: "pages", instr: "чтением страниц", name: "Чтение страниц" };

/** Что понято из записки: расписание (если есть), инструменты, когда и куда писать. */
export const understand = (text: string, tokens: ReturnType<typeof tokenize>["tokens"]) => {
  const when = tokens.filter((t) => t.kind === "when").map((t) => t.text.toLowerCase());
  const say = tokens.filter((t) => t.kind === "say").map((t) => t.text.toLowerCase());
  const tools = tokens.filter((t) => t.kind === "tool").map((t) => t.text.toLowerCase());
  let schedule: Schedule | null = null;
  if (when.length) {
    const w = when.join(" ");
    const time = /(\d{1,2})(?::(\d{2}))?(?: (утра|вечера))?/u.exec(w);
    let hour = time ? Number(time[1]) : /вечер/u.test(w) ? 19 : 9;
    if (time?.[3] === "вечера" && hour < 12) hour += 12;
    const minute = time?.[2] ? Number(time[2]) : 0;
    const day = ["воскрес", "понедельн", "вторн", "сред", "четверг", "пятниц", "суббот"].findIndex((d) => w.includes(d));
    const freq = /будн/u.test(w) ? "weekdays" : day >= 0 || /недел/u.test(w) ? "weekly" : /месяц/u.test(w) ? "monthly" : "daily";
    schedule = { freq, hour: Math.min(23, hour), minute: Math.min(59, minute), weekday: day >= 0 ? day : 1 };
  }
  const list: Tool[] = [];
  if (tools.some((t) => /почт|пис/u.test(t))) list.push(CONNS[0]?.tool as Tool);
  if (tools.some((t) => /crm/u.test(t))) list.push(CONNS[1]?.tool as Tool);
  if (tools.some((t) => /сайт|конкурент|интернет/u.test(t))) list.push(WEB, PAGES);
  const quiet = say.some((s) => /только если|изменил|если есть что/u.test(s));
  const email = say.some((s) => /на почту/u.test(s));
  const push = say.some((s) => /уведомл/u.test(s));
  const words = text
    .replace(/[.!?]+$/u, "")
    .split(/\s+/u)
    .filter(Boolean);
  const name = list.some((t) => t.id === "mail")
    ? "Письма, которым нужен ответ"
    : list.some((t) => t.id === "crm")
      ? "Отчёт по продажам"
      : list.some((t) => t.id === "pages")
        ? "Цены конкурентов"
        : capital(words.slice(0, 4).join(" "));
  return { email, name, push, quiet: quiet || !say.length, schedule, tools: list };
};

export const MARK: Record<TokenKind, string> = {
  say: "bg-emerald-500/15 ring-emerald-500/15 dark:bg-emerald-400/20 dark:ring-emerald-400/20",
  tool: "bg-violet-500/15 ring-violet-500/15 dark:bg-violet-400/20 dark:ring-violet-400/20",
  when: "bg-sky-500/15 ring-sky-500/15 dark:bg-sky-400/20 dark:ring-sky-400/20",
};
export const DOT: Record<TokenKind, string> = { say: "bg-emerald-500", tool: "bg-violet-500", when: "bg-sky-500" };

/** Одинаковые на подложке и в поле: иначе подсветка разъедется с буквами. */
const NOTE_TEXT = "w-full p-0 text-2xl leading-[1.5] font-medium tracking-tight whitespace-pre-wrap [overflow-wrap:anywhere] @max-sm:text-xl";

/** Поле с подсветкой понятого: под прозрачным полем лежит его копия, где понятые слова — цветные пятна. */
const NoteField = ({ value, onChange, onSubmit }: { value: string; onChange: (v: string) => void; onSubmit: () => void }) => {
  const { segments } = tokenize(value);
  return (
    <div className="relative">
      <div aria-hidden className={cn(NOTE_TEXT, "pointer-events-none absolute inset-0 text-transparent")}>
        {segments.map((s, i) =>
          s.kind ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: segments have no identity of their own.
            <mark className={cn("rounded-[0.25em] text-transparent ring-[3px] transition-[background-color] duration-200 [box-decoration-break:clone]", MARK[s.kind])} key={i}>
              {s.text}
            </mark>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: as above.
            <span key={i}>{s.text}</span>
          )
        )}
        {"\n"}
      </div>
      <textarea
        aria-label="Записка для агента"
        // biome-ignore lint/a11y/noAutofocus: the page is this note.
        autoFocus
        className={cn(NOTE_TEXT, "placeholder:text-muted-foreground/45 relative min-h-[4.5em] resize-none bg-transparent outline-none [field-sizing:content]")}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder="Что делать, когда и куда писать — одной запиской"
        spellCheck={false}
        value={value}
      />
    </div>
  );
};

/** Строка «что понято»: цветная точка того же цвета, что подсветка в записке; не понято — серым, с подсказкой. */
const Understood = ({ kind, ok, children }: { kind: TokenKind; ok: boolean; children: React.ReactNode }) => (
  <div className="flex items-start gap-3 py-2 text-sm">
    <span className={cn("mt-[0.45rem] size-2 shrink-0 rounded-full transition-colors duration-200", ok ? DOT[kind] : "bg-border")} />
    <div className={cn("flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5", !ok && "text-muted-foreground")}>{children}</div>
  </div>
);

export const Note = () => {
  const setCreated = useFresh();
  const [text, setText] = useState("");
  const [title, setTitle] = useState<string | null>(null);
  const [done, setDone] = useState<Draft | null>(null);
  const { tokens } = tokenize(text);
  const u = understand(text, tokens);
  const name = title ?? u.name;
  const ready = text.trim().length > 10 && u.schedule !== null;
  const tools = u.tools.length ? u.tools : [WEB];

  const create = () => {
    if (!ready || !u.schedule) return;
    const d: Draft = { does: capital(text.trim()), email: u.email, name: name || "Агент", notes: [], push: u.push, quiet: u.quiet, schedule: u.schedule, sites: null, tools };
    setCreated(d);
    setDone(d);
  };

  if (done) {
    return (
      <Shell title="Агенты">
        <Created draft={done} />
      </Shell>
    );
  }

  const first = u.schedule ? nextRuns(u.schedule, 1)[0] : undefined;
  return (
    <Shell title="Новый агент">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 pt-14 pb-10 @max-sm:px-5 @max-sm:pt-8">
        <div className={cn("flex flex-col gap-3", ENTER)}>
          <input
            aria-label="Название агента"
            className="text-muted-foreground placeholder:text-muted-foreground/50 -mx-1 w-full bg-transparent px-1 text-sm outline-none"
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Новый агент"
            value={name}
          />
          <NoteField onChange={setText} onSubmit={create} value={text} />
        </div>

        {text.trim() && (
          <div className={cn("flex flex-col divide-y border-y", ENTER)}>
            <Understood kind="when" ok={u.schedule !== null}>
              {u.schedule ? (
                <>
                  <span>{capital(scheduleWords(u.schedule))}</span>
                  {first && <span className="text-muted-foreground text-xs tabular-nums">первый — {runWords(first)}</span>}
                </>
              ) : (
                <span>Когда работать? Допишите, например, «по будням в 9»</span>
              )}
            </Understood>
            <Understood kind="tool" ok={u.tools.length > 0}>
              {u.tools.length ? (
                u.tools.map((t) => <ToolChip key={t.id} tool={t} />)
              ) : (
                <span>Чем — не сказано: возьмёт поиск в интернете</span>
              )}
            </Understood>
            <Understood kind="say" ok>
              <span>
                {u.quiet ? "Пишет, только когда есть что сказать" : "Пишет после каждого запуска"} — здесь{u.push ? ", уведомлением" : ""}
                {u.email ? ", на почту" : ""}
              </span>
            </Understood>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button className={PRESS} disabled={!ready} onClick={create}>
            Создать агента
          </Button>
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <Kbd>⌘</Kbd>
            <Kbd>↵</Kbd>
          </span>
        </div>
      </div>
    </Shell>
  );
};

