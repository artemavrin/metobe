"use client";

import type { ChatMessage } from "@metobe/contracts/chat";
import { Button } from "@metobe/ui/components/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@metobe/ui/components/popover";
import { ToggleGroup, ToggleGroupItem } from "@metobe/ui/components/toggle-group";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AssistantMessage, UserMessage } from "@/components/chat/messages";

import { applyWords, draftFrom, FREQS, MODEL, nextRuns, runWords, scheduleWords, sitesFrom, WEEKDAY_NAMES } from "./data";
import type { Draft, Freq, Schedule } from "./data";
import { AskField, Created, DraftCard, ENTER, Fact, Intro, NextRuns, PRESS, Shell, Thinking, ToolChip, Toggle } from "./frame";
import { useProto } from "./state";

// P11 · первый агент, три ответа на «как поручение становится агентом»:
// «Разговор» — модель в чате присылает черновик карточкой; чего не хватает, она спрашивает, поправки — словами;
// «На месте» — поле остаётся сверху, под ним черновик-форма: всё правится руками, модель разбирает поручение один раз;
// «Фраза» — черновик — это одно предложение, его части нажимаются и правятся на месте; пробел в нём — вопрос.

const THINK_MS = 750;
const capital = (s: string) => s.replace(/^./u, (c) => c.toUpperCase());
const lower = (s: string) => s.replace(/^./u, (c) => c.toLowerCase());
const sitesWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "сайт" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "сайта" : "сайтов");
const missingSites = (d: Draft) => d.sites !== null && d.sites.length === 0;

/** Каждый вариант начинается заново: созданного агента в боковой панели ещё нет. */
export const useFresh = () => {
  const { setCreated } = useProto();
  useEffect(() => setCreated(null), [setCreated]);
  return setCreated;
};

/** Отложенный ответ «модели»; снимается, если вариант закрыли раньше. */
export const useLater = () => {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (fn: () => void, ms = THINK_MS) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(fn, ms);
  };
};

// ── Разговор ─────────────────────────────────────────────────────────────────────────────────────────────────────────

type Msg = { id: string; role: "user" | "assistant"; text: string; at: string; card?: Draft };

const asMessage = (m: Msg): ChatMessage => ({
  id: m.id,
  metadata: m.role === "assistant" ? { createdAt: m.at, modelId: MODEL.id } : { createdAt: m.at },
  parts: [{ text: m.text, type: "text" }],
  role: m.role,
});

/** Поле внизу треда: ответить модели или сказать, что поменять. */
const Dock = ({ onSend, busy }: { onSend: (t: string) => void; busy: boolean }) => {
  const [value, setValue] = useState("");
  return (
    <form
      className="bg-background flex items-center gap-1 rounded-3xl border p-1.5 pl-4 shadow-xs"
      onSubmit={(e) => {
        e.preventDefault();
        const t = value.trim();
        if (!t || busy) return;
        onSend(t);
        setValue("");
      }}
    >
      <input
        aria-label="Ответить или сказать, что поменять"
        className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-base outline-none sm:text-sm"
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ответить или сказать, что поменять…"
        value={value}
      />
      <Button aria-label="Отправить" className={cn("rounded-full", PRESS)} disabled={!value.trim() || busy} size="icon" type="submit">
        <ArrowUp />
      </Button>
    </form>
  );
};

export const Talk = () => {
  const setCreated = useFresh();
  const later = useLater();
  const { say } = useProto();
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [thinking, setThinking] = useState(false);
  const [done, setDone] = useState<Draft | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, thinking]);

  const add = (role: Msg["role"], t: string, card?: Draft) =>
    setMsgs((ms) => [...ms, { at: new Date().toISOString(), card, id: crypto.randomUUID(), role, text: t }]);
  const reply = (t: string, card?: Draft) => {
    setThinking(true);
    later(() => {
      setThinking(false);
      add("assistant", t, card);
    });
  };

  const send = (t: string) => {
    add("user", t);
    setText("");
    if (!draft) {
      const d = draftFrom(t);
      setDraft(d);
      if (missingSites(d)) reply("Каких конкурентов смотреть? Пришлите адреса сайтов через запятую — например, shop-one.ru, shop-two.ru.");
      else reply("Вот агент. Проверьте и создайте — или напишите, что поменять.", d);
      return;
    }
    if (missingSites(draft)) {
      const sites = sitesFrom(t);
      if (sites.length === 0) {
        reply("Не нашёл адресов. Пришлите сайты через запятую — например, shop-one.ru, shop-two.ru.");
        return;
      }
      const d = { ...draft, sites };
      setDraft(d);
      reply(`Буду смотреть ${sites.length} ${sitesWord(sites.length)}. Вот агент — проверьте и создайте.`, d);
      return;
    }
    const { draft: d, said } = applyWords(draft, t);
    setDraft(d);
    reply(said, d);
  };

  if (done) {
    return (
      <Shell title="Агенты">
        <Created draft={done} />
      </Shell>
    );
  }

  if (msgs.length === 0) {
    return (
      <Shell title="Агенты">
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-5 py-10 @lg:px-8">
          <Intro />
          <AskField autoFocus onChange={setText} onSubmit={send} value={text} />
        </div>
      </Shell>
    );
  }

  // Карточка — только у последнего черновика: прежние остаются текстом «что поменял».
  const last = [...msgs].reverse().find((m) => m.card)?.id;
  return (
    <Shell title="Новый агент">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 pt-8 pb-6">
        {msgs.map((m) =>
          m.role === "user" ? (
            <div className={ENTER} key={m.id}>
              <UserMessage message={asMessage(m)} />
            </div>
          ) : (
            <div className="flex flex-col gap-3" key={m.id}>
              <div className={cn("[&_[data-slot=message-footer]]:hidden", ENTER)}>
                <AssistantMessage label={MODEL} live={false} message={asMessage(m)} />
              </div>
              {m.card && m.id === last && (
                <DraftCard
                  draft={m.card}
                  onCreate={() => {
                    setDone(m.card ?? null);
                    setCreated(m.card ?? null);
                  }}
                  onTest={() => say("Тестовый прогон: итог придёт сюда же, в чат, без уведомлений")}
                />
              )}
            </div>
          )
        )}
        {thinking && <Thinking>Составляю агента…</Thinking>}
        <div ref={end} />
      </div>
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 pt-2 pb-4 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl px-4">
          <Dock busy={thinking} onSend={send} />
        </div>
      </div>
    </Shell>
  );
};

// ── Общее для «На месте» и «Фразы»: расписание руками ────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");

/** `unset` — расписания ещё нет: ничего не нажато, первое нажатие его задаёт. */
export const ScheduleEditor = ({ schedule, onChange, unset = false }: { schedule: Schedule; onChange: (s: Schedule) => void; unset?: boolean }) => (
  <div className="flex flex-col gap-2">
    <ToggleGroup
      className="flex-wrap"
      onValueChange={(v) => v[0] && onChange({ ...schedule, freq: v[0] as Freq })}
      size="sm"
      spacing={0}
      value={unset ? [] : [schedule.freq]}
      variant="outline"
    >
      {FREQS.map((f) => (
        <ToggleGroupItem key={f.id} value={f.id}>
          {f.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
    {schedule.freq === "weekly" && (
      <ToggleGroup
        className={ENTER}
        onValueChange={(v) => v[0] && onChange({ ...schedule, weekday: Number(v[0]) })}
        size="sm"
        spacing={0}
        value={[String(schedule.weekday)]}
        variant="outline"
      >
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <ToggleGroupItem aria-label={WEEKDAY_NAMES[d]} key={d} value={String(d)}>
            {WEEKDAY_NAMES[d]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    )}
    <label className="flex items-center gap-2 text-sm">
      {schedule.freq === "monthly" ? "в последний день, в" : "в"}
      <input
        className="bg-background h-7 rounded-md border px-2 text-sm tabular-nums"
        onChange={(e) => {
          const [h, m] = e.target.value.split(":").map(Number);
          if (h !== undefined && m !== undefined && !Number.isNaN(h) && !Number.isNaN(m)) onChange({ ...schedule, hour: h, minute: m });
        }}
        type="time"
        value={`${pad(schedule.hour)}:${pad(schedule.minute)}`}
      />
    </label>
  </div>
);

export const SitesInput = ({ draft, onChange, autoFocus = false }: { draft: Draft; onChange: (sites: string[]) => void; autoFocus?: boolean }) => {
  const [value, setValue] = useState((draft.sites ?? []).join(", "));
  const missing = missingSites(draft);
  return (
    <div className="flex flex-col gap-1">
      <input
        aria-invalid={missing}
        aria-label="Сайты конкурентов"
        // biome-ignore lint/a11y/noAutofocus: opened to type the sites.
        autoFocus={autoFocus}
        className="bg-background aria-invalid:border-warning/70 h-8 rounded-md border px-2.5 text-base outline-none focus:ring-3 focus:ring-ring/20 sm:text-sm"
        onChange={(e) => {
          setValue(e.target.value);
          onChange(sitesFrom(e.target.value));
        }}
        placeholder="shop-one.ru, shop-two.ru"
        value={value}
      />
      <span className={cn("text-xs", missing ? "text-warning" : "text-muted-foreground")}>
        {missing ? "Без сайтов агенту нечего сравнивать" : `${draft.sites?.length} ${sitesWord(draft.sites?.length ?? 0)}`}
      </span>
    </div>
  );
};

const Channels = ({ draft, up }: { draft: Draft; up: (p: Partial<Draft>) => void }) => (
  <>
    <Toggle checked={draft.quiet} hint="Иначе — итог после каждого запуска" label="Молчать, если нечего сказать" onChange={(quiet) => up({ quiet })} />
    <Toggle checked={draft.push} hint="На телефон и в браузер" label="Уведомлять" onChange={(push) => up({ push })} />
    <Toggle checked={draft.email} label="Копия на почту" onChange={(email) => up({ email })} />
  </>
);

/** Общий ход «На месте» и «Фразы»: поле → «разбираю» → черновик → создан. */
const useDraftFlow = () => {
  const setCreated = useFresh();
  const later = useLater();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"idle" | "parsing" | "draft" | "created">("idle");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [round, setRound] = useState(0);
  const submit = (t: string) => {
    setPhase("parsing");
    later(() => {
      setDraft(draftFrom(t));
      setRound((r) => r + 1);
      setPhase("draft");
    });
  };
  const create = () => {
    if (!draft) return;
    setCreated(draft);
    setPhase("created");
  };
  return { create, draft, phase, round, setDraft, setPhase, setText, submit, text };
};

// ── На месте ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const EditCard = ({ draft, set, onCreate, onTest }: { draft: Draft; set: (d: Draft) => void; onCreate: () => void; onTest: () => void }) => {
  const up = (p: Partial<Draft>) => set({ ...draft, ...p });
  const missing = missingSites(draft);
  return (
    <div className={cn("bg-card @container flex flex-col rounded-xl border shadow-xs", ENTER)}>
      <div className="flex flex-col gap-0.5 px-4 pt-3 pb-2">
        <input
          aria-label="Название агента"
          className="hover:bg-muted/50 focus:bg-muted/60 -mx-1.5 rounded-md px-1.5 py-0.5 font-medium outline-none transition-colors duration-150"
          onChange={(e) => up({ name: e.target.value })}
          value={draft.name}
        />
        <textarea
          aria-label="Что делает агент"
          className="text-muted-foreground hover:bg-muted/50 focus:bg-muted/60 focus:text-foreground -mx-1.5 resize-none rounded-md px-1.5 py-0.5 text-sm outline-none transition-colors duration-150 [field-sizing:content]"
          onChange={(e) => up({ does: e.target.value })}
          value={draft.does}
        />
      </div>
      <div className="divide-y border-t px-4">
        <Fact label="Когда" n={1}>
          <ScheduleEditor onChange={(schedule) => up({ schedule })} schedule={draft.schedule} />
          <NextRuns draft={draft} />
        </Fact>
        {draft.sites && (
          <Fact label="Сайты" n={2}>
            <SitesInput draft={draft} onChange={(sites) => up({ sites })} />
          </Fact>
        )}
        <Fact label="Пользуется" n={3}>
          <div className="flex flex-wrap gap-1.5">
            {draft.tools.map((t) => (
              <ToolChip key={t.id} onRemove={draft.tools.length > 1 ? () => up({ tools: draft.tools.filter((x) => x.id !== t.id) }) : undefined} tool={t} />
            ))}
          </div>
        </Fact>
        <Fact label="Сообщает" n={4}>
          <Channels draft={draft} up={up} />
        </Fact>
      </div>
      <div className="flex items-center justify-end gap-2 border-t px-3 py-2.5">
        {missing && <span className="text-muted-foreground mr-auto pl-1 text-xs">Осталось указать сайты</span>}
        <Button className={PRESS} disabled={missing} onClick={onTest} size="sm" variant="ghost">
          Прогнать сейчас
        </Button>
        <Button className={PRESS} disabled={missing} onClick={onCreate} size="sm">
          Создать агента
        </Button>
      </div>
    </div>
  );
};

export const Inline = () => {
  const { say } = useProto();
  const f = useDraftFlow();
  if (f.phase === "created" && f.draft) {
    return (
      <Shell title="Агенты">
        <Created draft={f.draft} />
      </Shell>
    );
  }
  return (
    <Shell title="Агенты">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-10 @lg:px-8">
        <Intro />
        <AskField autoFocus busy={f.phase === "parsing"} examples={f.phase === "idle"} onChange={f.setText} onSubmit={f.submit} value={f.text} />
        {f.phase === "parsing" && <Thinking>Разбираю поручение…</Thinking>}
        {f.phase === "draft" && f.draft && (
          <EditCard
            draft={f.draft}
            key={f.round}
            onCreate={f.create}
            onTest={() => say("Тестовый прогон: итог придёт сюда, без уведомлений")}
            set={f.setDraft}
          />
        )}
      </div>
    </Shell>
  );
};

// ── Фраза ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Часть фразы: подчёркнута точками, нажимается, открывает поповер у себя. `warn` — пробел, который надо заполнить. */
const Part = ({ children, title, warn = false, content, wide = false }: { children: React.ReactNode; title: string; warn?: boolean; content: React.ReactNode; wide?: boolean }) => (
  <Popover>
    <PopoverTrigger
      className={cn(
        "decoration-muted-foreground/30 hover:decoration-foreground/60 hover:bg-muted/70 data-[popup-open]:bg-muted -mx-0.5 cursor-pointer rounded-md px-0.5 underline decoration-dotted decoration-[1.5px] underline-offset-[6px] [box-decoration-break:clone] transition-[background-color,text-decoration-color] duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
        warn && "text-warning decoration-warning/70 bg-warning/10"
      )}
      nativeButton={false}
      render={<span />}
    >
      {children}
    </PopoverTrigger>
    <PopoverContent align="start" className={cn("max-w-[calc(100vw-2rem)] gap-3 p-3", wide ? "w-[27rem]" : "w-80")}>
      <PopoverTitle className="text-muted-foreground text-xs font-normal">{title}</PopoverTitle>
      {content}
    </PopoverContent>
  </Popover>
);

const SentenceView = ({ draft, set, onCreate, onTest, onEdit }: { draft: Draft; set: (d: Draft) => void; onCreate: () => void; onTest: () => void; onEdit: () => void }) => {
  const { mail } = useProto();
  const up = (p: Partial<Draft>) => set({ ...draft, ...p });
  const missing = missingSites(draft);
  const signIn = draft.tools.some((t) => t.signIn) && !mail;
  const where = ["здесь", draft.push && "уведомлением", draft.email && "на почту"].filter(Boolean).join(", ");
  return (
    <div className="flex flex-col gap-6">
      <div className={cn("flex flex-col gap-3", ENTER)}>
        <span className="text-muted-foreground text-sm">
          <Part content={<input aria-label="Название агента" className="bg-background h-8 rounded-md border px-2.5 text-base outline-none sm:text-sm" onChange={(e) => up({ name: e.target.value })} value={draft.name} />} title="Название">
            {draft.name}
          </Part>
        </span>
        <p className="text-xl leading-[1.6] font-medium tracking-tight text-pretty @max-sm:text-lg">
          <Part content={<ScheduleEditor onChange={(schedule) => up({ schedule })} schedule={draft.schedule} />} title="Когда" wide>
            {capital(scheduleWords(draft.schedule))}
          </Part>{" "}
          агент{" "}
          <Part
            content={
              <>
                <textarea
                  aria-label="Что делает агент"
                  className="bg-background min-h-24 resize-none rounded-md border px-2.5 py-2 text-base outline-none [field-sizing:content] sm:text-sm"
                  onChange={(e) => up({ does: capital(e.target.value) })}
                  value={draft.does}
                />
                <span className="text-muted-foreground text-xs">Это его инструкции: по ним он работает каждый запуск.</span>
              </>
            }
            title="Что делает"
            wide
          >
            {lower(draft.does)}
          </Part>{" "}
          {draft.sites && (
            <>
              Сайты:{" "}
              <Part content={<SitesInput autoFocus draft={draft} onChange={(sites) => up({ sites })} />} title="Каких конкурентов смотреть" warn={missing}>
                {missing ? "какие?" : draft.sites.join(", ")}
              </Part>
              .{" "}
            </>
          )}
          Пользуется{" "}
          <Part
            content={
              <div className="flex flex-wrap gap-1.5">
                {draft.tools.map((t) => (
                  <ToolChip key={t.id} onRemove={draft.tools.length > 1 ? () => up({ tools: draft.tools.filter((x) => x.id !== t.id) }) : undefined} tool={t} />
                ))}
              </div>
            }
            title="Чем пользуется"
            warn={signIn}
          >
            {draft.tools.map((t) => t.instr).join(" и ")}
          </Part>
          {signIn && <span className="text-warning"> — нужен вход</span>}. Пишет{" "}
          <Part content={<Channels draft={draft} up={up} />} title="Когда и куда писать">
            {draft.quiet ? "только когда есть что сказать" : "после каждого запуска"}
            {" — "}
            {where}
          </Part>
          .
        </p>
        <span className="text-muted-foreground text-xs tabular-nums">
          Ближайшие запуски: {nextRuns(draft.schedule).map((d) => runWords(d)).join(" · ")}
        </span>
      </div>
      <div className={cn("flex flex-wrap items-center gap-2", ENTER)} style={{ animationDelay: "80ms", animationFillMode: "both" }}>
        <Button className={PRESS} disabled={missing} onClick={onCreate}>
          Создать агента
        </Button>
        <Button className={PRESS} disabled={missing} onClick={onTest} variant="ghost">
          Прогнать сейчас
        </Button>
        <Button className="text-muted-foreground" onClick={onEdit} variant="link">
          Изменить поручение
        </Button>
        {missing && <span className="text-muted-foreground text-xs">Осталось указать сайты — нажмите «какие?»</span>}
      </div>
    </div>
  );
};

export const Sentence = () => {
  const { say } = useProto();
  const f = useDraftFlow();
  if (f.phase === "created" && f.draft) {
    return (
      <Shell title="Агенты">
        <Created draft={f.draft} />
      </Shell>
    );
  }
  return (
    <Shell title="Агенты">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 py-10 @lg:px-8">
        <Intro />
        {f.phase === "draft" && f.draft ? (
          <SentenceView
            draft={f.draft}
            key={f.round}
            onCreate={f.create}
            onEdit={() => f.setPhase("idle")}
            onTest={() => say("Тестовый прогон: итог придёт сюда, без уведомлений")}
            set={f.setDraft}
          />
        ) : (
          <>
            <AskField autoFocus busy={f.phase === "parsing"} onChange={f.setText} onSubmit={f.submit} value={f.text} />
            {f.phase === "parsing" && <Thinking>Разбираю поручение…</Thinking>}
          </>
        )}
      </div>
    </Shell>
  );
};

