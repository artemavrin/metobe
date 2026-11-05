"use client";

import type { ChatMessage } from "@metobe/contracts/chat";
import { Button } from "@metobe/ui/components/button";
import { Switch } from "@metobe/ui/components/switch";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowRight, ArrowUp, Check, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AssistantMessage } from "@/components/chat/messages";

import { MODEL, nextRuns, runWords, scheduleWords, sitesFrom } from "./data";
import type { Draft, Schedule, Tool } from "./data";
import { ENTER, PRESS, Shell, Thinking, ToolChip } from "./frame";
import { DOT, MARK, tokenize, understand } from "./round2";
import { useProto } from "./state";
import { TaskFigure } from "@/components/tasks/task-figure";
import { useFresh, useLater } from "./variants";

// P11 · первая задача, раунд 3. Всё как в чате: тот же экран нового чата и тот же композер. Пока человек пишет, понятые
// части задачи подсвечиваются цветом своей части (из «Записки»). Над приветствием — Hairline-конвейер (task-figure.tsx):
// каждый шаг ленты — один запуск. После отправки модель разбирает задачу: карточка с её данными (что, когда, чем, куда) и
// тем же конвейером; чего не хватает — спрашивает тут же, в чате, по одному. Когда всё есть, задача получает название и
// свой цвет — им загораются лампа и луч сканера и полоска на каждом итоге, — и чат становится чатом задачи.

type SlotId = "what" | "when" | "with" | "where";
const SLOTS: { id: SlotId; label: string; dot: string }[] = [
  { dot: "bg-foreground", id: "what", label: "что" },
  { dot: DOT.when, id: "when", label: "когда" },
  { dot: DOT.tool, id: "with", label: "чем" },
  { dot: DOT.say, id: "where", label: "куда" },
];
const COLORS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `var(--chart-${n})`);
const colorFor = (name: string) => COLORS[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length] ?? "var(--chart-1)";
const capital = (s: string) => s.replace(/^./u, (c) => c.toUpperCase());

interface Agent {
  name: string;
  does: string;
  schedule: Schedule | null;
  tools: Tool[];
  needSites: boolean;
  sites: string[];
  quiet: boolean;
  push: boolean;
  email: boolean;
  /** Куда — сказано в задаче; иначе по умолчанию, после отправки. */
  where: boolean;
}

/** Имя: по сути задачи — то, что осталось без «когда» и «куда», первые слова. */
const nameOf = (text: string, tokens: ReturnType<typeof tokenize>["tokens"]) => {
  if (/конкурент/iu.test(text)) return "Цены конкурентов";
  if (/письм|почт/iu.test(text)) return "Письма, которым нужен ответ";
  if (/отч[её]т|продаж/iu.test(text)) return "Отчёт по продажам";
  let rest = ` ${text} `;
  for (const t of tokens) rest = rest.replace(t.text, " ");
  const words = rest.replace(/[.,!?]+/gu, " ").split(/\s+/u).filter(Boolean);
  // Без повелительного глагола в начале («смотри», «проверяй»): название — то, о чём задача, а не что она делает.
  if (/^(смотри|проверяй|проверь|присылай|собирай|собери|следи|ищи|пиши|делай|сделай|найди|читай)$/iu.test(words[0] ?? "")) words.shift();
  const head = words.slice(0, 4);
  while (head.length > 1 && /^(и|в|на|по|из|с|о|об|для|к|у)$/iu.test(head[head.length - 1] ?? "")) head.pop();
  return capital(head.join(" ")) || "Задача";
};

const fromText = (text: string): Agent => {
  const { tokens } = tokenize(text);
  const u = understand(text, tokens);
  const sites = sitesFrom(text);
  return {
    does: capital(text.trim()),
    email: u.email,
    name: nameOf(text, tokens),
    needSites: /конкурент|сайт/iu.test(text) && sites.length === 0,
    push: u.push,
    quiet: u.quiet,
    schedule: u.schedule,
    sites,
    tools: u.tools,
    where: tokens.some((t) => t.kind === "say"),
  };
};

const filledOf = (a: Agent | null, sent: boolean): boolean[] =>
  a ? [a.does.length > 3, a.schedule !== null, a.tools.length > 0 && !(a.needSites && a.sites.length === 0), sent || a.where] : [false, false, false, false];

const missingOf = (a: Agent): SlotId | null => (a.schedule === null ? "when" : a.tools.length === 0 || (a.needSites && a.sites.length === 0) ? "with" : null);

const ASK: Record<"when" | "sites" | "tools", string> = {
  sites: "Какие сайты смотреть? Пришлите адреса через запятую.",
  tools: "Где брать данные — в почте, в CRM или искать в интернете?",
  when: "Когда запускать? Например, по будням в 9 или по понедельникам утром.",
};
const askFor = (a: Agent) => {
  const m = missingOf(a);
  return m === "when" ? ASK.when : m === "with" ? (a.needSites && a.tools.length > 0 ? ASK.sites : ASK.tools) : null;
};

// ── Текст с подсветкой: в поле ввода и в отправленном сообщении ─────────────────────────────────────────────────────

const Marked = ({ text, hidden = false }: { text: string; hidden?: boolean }) => (
  <>
    {tokenize(text).segments.map((s, i) =>
      s.kind ? (
        // biome-ignore lint/suspicious/noArrayIndexKey: segments have no identity of their own.
        <mark className={cn("rounded-[0.3em] ring-2 transition-[background-color] duration-200 [box-decoration-break:clone]", MARK[s.kind], hidden ? "text-transparent" : "text-inherit")} key={i}>
          {s.text}
        </mark>
      ) : (
        // biome-ignore lint/suspicious/noArrayIndexKey: as above.
        <span key={i}>{s.text}</span>
      )
    )}
  </>
);

/** Одинаковые у подложки и у поля, иначе пятна разъедутся с буквами. */
const FIELD = "w-full px-0 py-1.5 text-base leading-6 whitespace-pre-wrap [overflow-wrap:anywhere] sm:text-sm";

/** Композер чата, но под прозрачным полем — его копия, где понятые части залиты цветом слота. */
export const SlotComposer = ({ value, onChange, onSend, busy, placeholder, foot }: { value: string; onChange: (v: string) => void; onSend: (t: string) => void; busy: boolean; placeholder: string; foot?: React.ReactNode }) => {
  const send = () => {
    const t = value.trim();
    if (t && !busy) onSend(t);
  };
  return (
    <div className="flex flex-col gap-2">
      <form
        className="bg-background focus-within:ring-ring/20 flex items-end gap-1 rounded-3xl border p-1.5 pl-4 shadow-xs transition-shadow duration-150 focus-within:ring-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="relative min-w-0 flex-1">
          <div aria-hidden className={cn(FIELD, "pointer-events-none absolute inset-0 text-transparent")}>
            <Marked hidden text={value} />
            {"\n"}
          </div>
          <textarea
            aria-label={placeholder}
            // biome-ignore lint/a11y/noAutofocus: the screen is this field.
            autoFocus
            className={cn(FIELD, "placeholder:text-muted-foreground relative block max-h-40 resize-none bg-transparent outline-none [field-sizing:content]")}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={placeholder}
            rows={1}
            spellCheck={false}
            value={value}
          />
        </div>
        <Button aria-label="Отправить" className={cn("rounded-full", PRESS)} disabled={!value.trim() || busy} size="icon" type="submit">
          <ArrowUp />
        </Button>
      </form>
      <div className="text-muted-foreground flex min-h-5 items-center justify-center gap-1.5 text-xs">{foot ?? "Metobe может ошибаться — проверяйте важное"}</div>
    </div>
  );
};

// ── Карточка задачи: конвейер и данные───────────────────────────────────────────────────────────────────────────────────

type Stage = "building" | "naming" | "created";

const SlotRow = ({ slot, filled, asking, children, partial = false }: { slot: (typeof SLOTS)[number]; filled: boolean; asking: boolean; children: React.ReactNode; partial?: boolean }) => (
  <div className="grid grid-cols-[4.5rem_1fr] items-baseline gap-3 py-2.5">
    <span className="text-muted-foreground flex items-center gap-2 text-xs">
      <span className={cn("size-1.5 shrink-0 rounded-full transition-colors duration-300", filled ? slot.dot : "bg-border")} />
      {slot.label}
    </span>
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1.5 text-sm", !filled && "text-muted-foreground")}>
      {(filled || partial) && children}
      {!filled && (asking ? <span className="text-foreground">{partial ? "сайты — спрашиваю" : "спрашиваю"}</span> : !partial && "—")}
    </div>
  </div>
);

const AgentCard = ({ agent, filled, asking, stage, name, color, onName, onColor, onCreate }: {
  agent: Agent; filled: boolean[]; asking: SlotId | null; stage: Stage; name: string; color: string;
  onName: (n: string) => void; onColor: (c: string) => void; onCreate: () => void;
}) => {
  const { say } = useProto();
  const first = agent.schedule ? nextRuns(agent.schedule, 1)[0] : undefined;
  const where = ["здесь", agent.push && "уведомлением", agent.email && "на почту"].filter(Boolean).join(", ");
  return (
    <div className={cn("bg-card @container flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-xs", ENTER)}>
      <div className="flex flex-col @lg:flex-row">
        <div className="bg-muted/30 flex shrink-0 items-center justify-center border-b @lg:w-60 @lg:border-r @lg:border-b-0">
          <TaskFigure className="w-56" color={stage === "building" ? undefined : color} running={stage === "created"} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col divide-y px-4">
          <SlotRow asking={false} filled={filled[0] ?? false} slot={SLOTS[0] as (typeof SLOTS)[number]}>
            <span className="line-clamp-2">{agent.does}</span>
          </SlotRow>
          <SlotRow asking={asking === "when"} filled={filled[1] ?? false} slot={SLOTS[1] as (typeof SLOTS)[number]}>
            {agent.schedule && (
              <>
                <span>{capital(scheduleWords(agent.schedule))}</span>
                {first && <span className="text-muted-foreground text-xs tabular-nums">первый — {runWords(first)}</span>}
              </>
            )}
          </SlotRow>
          <SlotRow asking={asking === "with"} filled={filled[2] ?? false} partial={agent.tools.length > 0} slot={SLOTS[2] as (typeof SLOTS)[number]}>
            {agent.tools.map((t) => (
              <ToolChip key={t.id} tool={t} />
            ))}
            {agent.sites.length > 0 && <span className="text-muted-foreground text-xs">{agent.sites.join(", ")}</span>}
          </SlotRow>
          <SlotRow asking={false} filled={filled[3] ?? false} slot={SLOTS[3] as (typeof SLOTS)[number]}>
            <span>
              {agent.quiet ? "Только при изменениях" : "После каждого запуска"} — {where}
            </span>
          </SlotRow>
        </div>
      </div>

      {stage !== "building" && (
        <div className={cn("flex flex-col gap-3 border-t px-4 py-3.5", ENTER)}>
          <div className="flex items-center gap-3">
            {/* Цвет задачи уже несёт конвейер; здесь — только точка цвета и название. Поле выглядит полем: на телефоне
                нет наведения, по которому было бы видно, что название можно поменять. */}
            <span className="size-2.5 shrink-0 rounded-full transition-colors duration-300" style={{ background: color }} />
            {stage === "naming" ? (
              <label className="focus-within:border-ring/60 flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2 py-1 transition-colors duration-150 @max-md:min-h-11">
                <input
                  aria-invalid={!name.trim() || undefined}
                  aria-label="Название задачи"
                  className="min-w-0 flex-1 bg-transparent font-medium outline-none"
                  onChange={(e) => onName(e.target.value)}
                  value={name}
                />
                <Pencil aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
              </label>
            ) : (
              <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
            )}
            {stage === "created" && (
              <span className={cn("text-muted-foreground flex items-center gap-1 text-xs", ENTER)}>
                <Check className="size-3.5" />
                создана
              </span>
            )}
          </div>
          {stage === "naming" ? (
            <div className="flex flex-wrap items-center gap-3">
              <div aria-label="Цвет задачи" className="flex flex-wrap items-center gap-1.5 @max-md:gap-2.5" role="radiogroup">
                {COLORS.map((c) => (
                  <button
                    aria-checked={c === color}
                    aria-label={`Цвет ${COLORS.indexOf(c) + 1}`}
                    className={cn("size-5 rounded-full ring-offset-2 ring-offset-card transition-[box-shadow,transform] duration-150 active:scale-90 @max-md:size-8", c === color && "ring-2")}
                    key={c}
                    onClick={() => onColor(c)}
                    role="radio"
                    style={{ "--tw-ring-color": c, background: c } as React.CSSProperties}
                    type="button"
                  />
                ))}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button className={PRESS} onClick={() => say("Тестовый запуск: итог появится в этом чате, без уведомлений")} size="sm" variant="ghost">
                  Тестовый запуск
                </Button>
                <Button className={PRESS} disabled={!name.trim()} onClick={onCreate} size="sm">
                  Создать задачу
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-muted-foreground min-w-0 flex-1 text-xs">
                Первый запуск — {first ? runWords(first) : "по расписанию"}. Итоги — на странице задачи.
              </span>
              <a className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors duration-150 @max-md:min-h-11" href={`/dev/prototypes/task-edit?v=3&task=${agent.email ? "mail" : "prices"}`}>
                Открыть задачу
                <ArrowRight className="size-3.5" />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Сам вариант ──────────────────────────────────────────────────────────────────────────────────────────────────────

type Msg = { id: string; role: "user" | "assistant"; text: string; at: string };
const asMessage = (m: Msg): ChatMessage => ({
  id: m.id,
  metadata: { createdAt: m.at, modelId: MODEL.id },
  parts: [{ text: m.text, type: "text" }],
  role: "assistant",
});

export const InChat = () => {
  const setCreated = useFresh();
  const later = useLater();
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [card, setCard] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("building");
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0] ?? "");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, working, card, stage]);

  const add = (role: Msg["role"], t: string) => setMsgs((ms) => [...ms, { at: new Date().toISOString(), id: crypto.randomUUID(), role, text: t }]);
  const reply = (t: string, then?: () => void, ms = 700) => {
    setWorking("Думаю…");
    later(() => {
      setWorking(null);
      add("assistant", t);
      then?.();
    }, ms);
  };

  /** Следующий шаг после того, как слот заполнен: спросить недостающее или предложить имя и цвет. */
  const proceed = (a: Agent, lead: string) => {
    const q = askFor(a);
    if (q) {
      reply(`${lead}${lead ? " " : ""}${q}`);
      return;
    }
    const c = colorFor(a.name);
    reply(`${lead}${lead ? " " : ""}Всё заполнено. Название — «${a.name}», цвет выбран автоматически; оба можно поменять.`, () => {
      setName(a.name);
      setColor(c);
      setStage("naming");
    });
  };

  const send = (t: string) => {
    add("user", t);
    setText("");
    if (!agent) {
      const a = fromText(t);
      setAgent(a);
      setWorking("Разбираю задачу…");
      later(() => {
        setWorking(null);
        add("assistant", "Настраиваю задачу.");
        setCard(true);
        later(() => proceed(a, ""), 500);
      }, 900);
      return;
    }
    if (stage === "created") {
      reply("Задача уже создана: изменения — на её странице, карточкой «было → стало»; применяете вы.");
      return;
    }
    const missing = missingOf(agent);
    if (missing === "when") {
      const u = understand(t, tokenize(t).tokens);
      if (!u.schedule) return reply("Расписание не распознано. Пример: «по будням в 9» или «по понедельникам в 10».");
      const a = { ...agent, schedule: u.schedule };
      setAgent(a);
      return proceed(a, `Расписание: ${scheduleWords(u.schedule)}.`);
    }
    if (missing === "with") {
      if (agent.needSites && agent.tools.length > 0) {
        const sites = sitesFrom(t);
        if (!sites.length) return reply("Адреса сайтов не найдены. Пример: shop-one.ru, shop-two.ru.");
        const a = { ...agent, sites };
        setAgent(a);
        return proceed(a, `${sites.length === 1 ? "Сайт" : "Сайты"}: ${sites.join(", ")}.`);
      }
      const u = understand(t, tokenize(t).tokens);
      const tools = u.tools.length ? u.tools : /поиск|интернет|сам/iu.test(t) ? [{ icon: "globe", id: "search", instr: "поиском в интернете", name: "Поиск в интернете" } as Tool] : [];
      if (!tools.length) return reply("Источник не распознан. Почта, CRM, сайты или поиск в интернете?");
      const a = { ...agent, tools };
      setAgent(a);
      return proceed(a, `Источники: ${tools.map((x) => x.name).join(", ")}.`);
    }
    reply("Добавлено в инструкции задачи.");
  };

  const create = () => {
    if (!agent?.schedule) return;
    const d: Draft = {
      does: agent.does, email: agent.email, name: name.trim(), notes: [], push: agent.push, quiet: agent.quiet,
      schedule: agent.schedule, sites: agent.sites.length ? agent.sites : null, tools: agent.tools,
    };
    setStage("created");
    setCreated({ ...d, chat: true, color });
  };

  const filled = filledOf(agent, true);
  const asking = stage === "building" && agent && !working ? missingOf(agent) : null;

  if (msgs.length === 0) {
    // Экран нового чата: над приветствием идёт конвейер, пока без цвета.
    return (
      <Shell title="Задачи">
        <div className="flex flex-1 items-center justify-center px-4 py-8">
          <div className={cn("flex max-w-xl flex-col items-center text-center", ENTER)}>
            <TaskFigure className="-mb-2 w-64 sm:w-72" />
            <p className="text-muted-foreground mb-2.5 text-[11px] font-medium tracking-[0.22em] uppercase">Задачи</p>
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Что поручить?</h1>
            <p className="text-foreground/65 mt-3 max-w-md text-[15px] leading-snug text-balance">
              Опишите своими словами, что делать и когда, — настрою задачу. Чего не хватит, спрошу.
            </p>
          </div>
        </div>
        <div className="sticky bottom-0 pb-3">
          <div className="mx-auto w-full max-w-3xl px-4">
            <SlotComposer busy={false} onChange={setText} onSend={send} placeholder="Что делать, когда, откуда брать и куда писать" value={text} />
          </div>
        </div>
      </Shell>
    );
  }

  const first = agent?.schedule ? nextRuns(agent.schedule, 1)[0] : undefined;
  const userMsgs = new Set(msgs.filter((m) => m.role === "user").map((m) => m.id));
  return (
    <Shell area="chat" chat={stage === "created" ? name : "Новая задача"} title={stage === "created" ? name : "Новая задача"}>
      <header className="bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b px-4 text-sm backdrop-blur @max-md:hidden">
        {stage === "created" && <span className={cn("size-2 rounded-full", ENTER)} style={{ background: color }} />}
        <span className="truncate font-medium">{stage === "created" ? name : "Новая задача"}</span>
        {stage === "created" && agent?.schedule && (
          <span className={cn("text-muted-foreground truncate", ENTER)}>
            · {scheduleWords(agent.schedule)}
            {first && ` · следующий ${runWords(first)}`}
          </span>
        )}
        {stage === "created" && <Switch aria-label="Задача включена" className="ml-auto" defaultChecked />}
      </header>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 pt-8 pb-6">
        {msgs.map((m) => (
          <div className="flex flex-col gap-4" key={m.id}>
            {userMsgs.has(m.id) ? (
              <div className={cn("bg-muted ml-auto max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap", ENTER)}>
                <Marked text={m.text} />
              </div>
            ) : (
              <div className={cn("[&_[data-slot=message-footer]]:hidden", ENTER)}>
                <AssistantMessage label={MODEL} live={false} message={asMessage(m)} />
              </div>
            )}
          </div>
        ))}
        {/* Карточка всегда последней, у поля ввода: вопрос над ней, ответ под ней. */}
        {card && agent && (
          <AgentCard
            agent={agent}
            asking={asking}
            color={color}
            filled={filled}
            name={name}
            onColor={setColor}
            onCreate={create}
            onName={setName}
            stage={stage}
          />
        )}
        {stage === "created" && (
          <div className={cn("text-muted-foreground flex items-center gap-3 text-xs", ENTER)}>
            <span className="bg-border h-px flex-1" />
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full" style={{ background: color }} />
              Задача «{name}» создана · итоги запусков — в этом чате
            </span>
            <span className="bg-border h-px flex-1" />
          </div>
        )}
        {working && <Thinking>{working}</Thinking>}
        <div ref={end} />
      </div>
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 pt-2 pb-3 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl px-4">
          <SlotComposer
            busy={working !== null}
            onChange={setText}
            onSend={send}
            placeholder={stage === "created" ? "Что поменять в задаче…" : "Ответить…"}
            value={text}
          />
        </div>
      </div>
    </Shell>
  );
};
