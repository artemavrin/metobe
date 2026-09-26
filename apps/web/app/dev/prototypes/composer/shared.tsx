"use client";

// What every composer variant stands on: the chat around it (thread, streaming reply, stop), the `/` and `@`
// menus, and the model list. Variants differ only in what is visible and how the model is chosen.
import { Button } from "@metobe/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@metobe/ui/components/command";
import { Kbd } from "@metobe/ui/components/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { Brain, Eye, FileText, GitBranch, HardDrive, Mail, SquareKanban, Wrench } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BrandLogo } from "@/components/brand-logo";

import { type Segment, TokenBadge } from "./x-editor";
import { FileCard } from "./x-files";
import { EASE_OUT, SNAP, SPRING_REFLOW } from "./y-motion";

import { CHATS } from "../app-shell/data";
import {
  type ChatModel,
  CONNECTIONS,
  type Connection,
  type Effort,
  fmtContext,
  MODELS,
  modelById,
  RECENT,
  SKILLS,
  type Skill,
} from "./data";

export const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

// --- what a composer sends -----------------------------------------------------------------------

export type Attachment = { id: string; name: string; size: number; preview?: string };

export type Sent = {
  /** Text with inline badges, as the composer read it (the chosen direction). */
  segments?: Segment[];
  /** The mode the message went with, when modes are in play. */
  mode?: string;
  text: string;
  model: ChatModel;
  effort: Effort;
  skill?: Skill;
  connections: Connection[];
  files: Attachment[];
};

export type ComposerProps = {
  onSend: (m: Sent) => void;
  onStop: () => void;
  streaming: boolean;
  autoFocus?: boolean;
  /** Home screen: the composer sits in the middle, a bit larger. */
  home?: boolean;
  /** The model this chat used last: a chat keeps its model. */
  lastModelId?: string;
};

// --- the chat around the composer ---------------------------------------------------------------

type Msg =
  | { id: string; role: "user"; sent: Sent }
  | { id: string; role: "assistant"; model: ChatModel; mode?: string; text: string; thinking: boolean; done: boolean };

const REPLIES = [
  "Разобью на шаги. Сначала соберу, что уже известно, потом предложу план с оценкой по времени и отмечу, где нужны ваши решения. Если пришлёте документы или выгрузки, прочитаю их и вернусь с первым вариантом.",
  "Коротко: да, так можно. Но есть два нюанса — объём данных и то, кто будет это поддерживать. Ниже расписал оба варианта с плюсами и минусами, чтобы было проще выбрать.",
  "Готово. Сохранил структуру и термины, поправил пару мест, где смысл был неоднозначным, — они отмечены. Если нужен более формальный тон, скажите.",
];

const seed = (id?: string): Msg[] => {
  const chat = CHATS.find((c) => c.id === id);
  if (!chat) {
    return [];
  }
  const model = modelById("claude-sonnet-4.6");
  return [
    {
      id: "s1",
      role: "user",
      sent: { connections: [], effort: "normal", files: [], model, text: `${chat.title}. С чего начать?` },
    },
    { done: true, id: "s2", model, role: "assistant", text: REPLIES[0] as string, thinking: false },
  ];
};

/** The thread with a fake but honest stream: words arrive at a model's pace, «думает» first when it thinks. */
const useThread = (id?: string) => {
  const [messages, setMessages] = useState<Msg[]>(() => seed(id));
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const streaming = messages.some((m) => m.role === "assistant" && !m.done);

  const stop = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
    }
    setMessages((ms) => ms.map((m) => (m.role === "assistant" ? { ...m, done: true, thinking: false } : m)));
  }, []);
  useEffect(() => stop, [stop]);

  const send = useCallback((sent: Sent) => {
    const reply = REPLIES[Math.floor(Math.random() * REPLIES.length)] as string;
    const words = reply.split(" ");
    const aid = crypto.randomUUID();
    const thinks = sent.effort !== "off" && sent.model.caps.reasoning !== false;
    setMessages((ms) => [
      ...ms,
      { id: crypto.randomUUID(), role: "user", sent },
      { done: false, id: aid, mode: sent.mode, model: sent.model, role: "assistant", text: "", thinking: thinks },
    ]);
    let i = 0;
    const start = () => {
      timer.current = setInterval(() => {
        i += 1;
        setMessages((ms) =>
          ms.map((m) =>
            m.id === aid && m.role === "assistant"
              ? { ...m, done: i >= words.length, text: words.slice(0, i).join(" "), thinking: false }
              : m
          )
        );
        if (i >= words.length && timer.current) {
          clearInterval(timer.current);
        }
      }, 45);
    };
    setTimeout(start, thinks ? (sent.effort === "deep" ? 1600 : 700) : 250);
  }, []);

  return { messages, send, stop, streaming };
};

const UserBubble = ({ sent }: { sent: Sent }) =>
  sent.segments ? (
    <div className={cn("animate-in fade-in slide-in-from-bottom-1 flex flex-col items-end gap-1.5 duration-200 motion-reduce:slide-in-from-bottom-0", EASE)}>
      {sent.files.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {sent.files.map((f) => (
            <FileCard f={{ ...f, progress: 1 }} key={f.id} />
          ))}
        </div>
      )}
      <div className="bg-muted max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 leading-7 whitespace-pre-wrap">
        {sent.segments.map((s, i) => (typeof s === "string" ? <span key={i}>{s}</span> : <TokenBadge key={i} t={s} />))}
      </div>
    </div>
  ) : (
  <div className={cn("animate-in fade-in slide-in-from-bottom-1 flex flex-col items-end gap-1.5 duration-200 motion-reduce:slide-in-from-bottom-0", EASE)}>
    {(sent.skill || sent.connections.length > 0 || sent.files.length > 0) && (
      <div className="flex flex-wrap justify-end gap-1">
        {sent.skill && <Chip icon={<span className="text-muted-foreground">/</span>} label={sent.skill.title} />}
        {sent.connections.map((c) => (
          <Chip icon={<ConnectionIcon id={c.id} />} key={c.id} label={c.title} />
        ))}
        {sent.files.map((f) => (
          <Chip icon={<FileText />} key={f.id} label={f.name} />
        ))}
      </div>
    )}
    <div className="bg-muted max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 whitespace-pre-wrap">{sent.text}</div>
  </div>
  );

const AssistantRow = ({ m }: { m: Extract<Msg, { role: "assistant" }> }) => (
  <div className="flex gap-3">
    <BrandLogo className="mt-0.5 shrink-0" label={m.model.makerTitle} logo={m.model.maker} size={22} />
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-muted-foreground text-xs">
        {m.mode ? `${m.mode} · ` : ""}
        {m.model.title}
      </span>
      {m.thinking ? (
        <span className="text-muted-foreground animate-pulse text-sm">Думает…</span>
      ) : (
        <p className="leading-relaxed">
          {m.text}
          {!m.done && <span className="bg-foreground/60 ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse rounded-sm" />}
        </p>
      )}
    </div>
  </div>
);

/** The chat screen: greeting and the composer in the middle when empty, the thread with the composer below it otherwise. */
// The screen's own entrance: an empty chat opens with the greeting rising in, the composer 60ms after it. A CSS
// animation (off the main thread, smooth while the page hydrates) on `translate`, so it never fights the composer's
// layout transform; `backwards` keeps both hidden through the delay and leaves nothing behind.
const SCREEN_CSS = `
@keyframes y-rise { from { opacity: 0; translate: 0 8px; } }
@keyframes y-rise-fade { from { opacity: 0; } }
.y-rise { animation: y-rise 300ms cubic-bezier(0.23, 1, 0.32, 1) backwards; }
.y-rise-next { animation-delay: 60ms; }
@media (prefers-reduced-motion: reduce) { .y-rise { animation-name: y-rise-fade; } }
`;

export const ChatScreen = ({ id, Composer }: { id?: string; Composer: (p: ComposerProps & { demoFiles?: boolean; contextTokens?: number }) => React.ReactNode }) => {
  const { messages, send, stop, streaming } = useThread(id);
  const bottom = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  const empty = messages.length === 0;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  // One tree for both states. When the first message goes, the same composer travels from the middle of the empty
  // chat to its place at the bottom (a layout animation) and keeps its model, files and focus — instead of one
  // vanishing in the middle and another appearing below. The greeting fades out of its way; the message rises in.
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <style>{SCREEN_CSS}</style>
      <div className={cn("min-h-0 flex-1 overflow-y-auto px-6", !empty && "py-8")}>
        {!empty && (
          <div className="mx-auto flex max-w-4xl flex-col gap-6 text-sm">
            {messages.map((m) => (m.role === "user" ? <UserBubble key={m.id} sent={m.sent} /> : <AssistantRow key={m.id} m={m} />))}
            <div ref={bottom} />
          </div>
        )}
      </div>
      <AnimatePresence initial={false} mode="popLayout">
        {empty && (
          <motion.h1
            className="y-rise w-full px-6 pb-6 text-center text-2xl font-semibold tracking-tight"
            exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
            key="hello"
          >
            Добрый вечер, Артём
          </motion.h1>
        )}
      </AnimatePresence>
      <motion.div className={cn("y-rise y-rise-next w-full px-6", !empty && "pb-6")} layout="position" transition={reduce ? SNAP : SPRING_REFLOW}>
        <div className="mx-auto max-w-4xl">
          <Composer
            autoFocus
            // Here a rough count by length; the product takes the last run's input tokens from model_runs.
            contextTokens={empty ? undefined : 1800 + messages.reduce((n, m) => n + Math.round((m.role === "user" ? m.sent.text : m.text).length / 3.2) * 40, 0)}
            demoFiles={empty}
            home={empty}
            lastModelId={[...messages].reverse().find((m) => m.role === "user")?.sent.model.id}
            onSend={send}
            onStop={stop}
            streaming={streaming}
          />
        </div>
      </motion.div>
      {/* Below an empty chat's composer: its share of the free space and a bit more, so the pair sits above the middle */}
      {empty && <div className="flex-1 pb-[14vh]" />}
    </div>
  );
};

// --- small pieces ---------------------------------------------------------------------------------

export const Chip = ({ icon, label, onRemove }: { icon?: React.ReactNode; label: string; onRemove?: () => void }) => (
  <span className="bg-background text-foreground/80 inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-xs [&_svg]:size-3.5">
    {icon}
    <span className="max-w-40 truncate">{label}</span>
    {onRemove && (
      <button aria-label={`Убрать ${label}`} className="text-muted-foreground hover:text-foreground -mr-0.5 rounded-sm px-0.5 transition-colors" onClick={onRemove} type="button">
        ×
      </button>
    )}
  </span>
);

const CONNECTION_ICON: Record<string, typeof Mail> = { drive: HardDrive, github: GitBranch, jira: SquareKanban, mail: Mail };
export const ConnectionIcon = ({ id }: { id: string }) => {
  const Icon = CONNECTION_ICON[id] ?? Mail;
  return <Icon />;
};

const CAP_ICONS = [
  { icon: Wrench, key: "tools", label: "Инструменты" },
  { icon: Eye, key: "vision", label: "Картинки" },
  { icon: Brain, key: "reasoning", label: "Размышления" },
] as const;

/** Capabilities as quiet icons: solid — yes, faint — no, dashed — the source did not say. */
export const Caps = ({ m, className }: { m: ChatModel; className?: string }) => (
  <span className={cn("flex items-center gap-1", className)}>
    {CAP_ICONS.map(({ icon: Icon, key, label }) => {
      const v = m.caps[key];
      return (
        <Tooltip key={key}>
          <TooltipTrigger render={<span className={cn("flex size-4 items-center justify-center", v === true ? "text-foreground/70" : v === false ? "text-foreground/15" : "text-foreground/30")} />}>
            <Icon className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>
            {label}: {v === true ? "да" : v === false ? "нет" : "не проверено"}
          </TooltipContent>
        </Tooltip>
      );
    })}
  </span>
);

export const hotkeyLabel = "⌘/";

/** ⌘/ from anywhere on the page, as ARCH §0.7 says. */
export const useModelHotkey = (open: () => void) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
};

// --- the model list (cmdk) ----------------------------------------------------------------------

const byMaker = () => {
  const groups = new Map<string, ChatModel[]>();
  for (const m of MODELS) {
    groups.set(m.makerTitle, [...(groups.get(m.makerTitle) ?? []), m]);
  }
  return [...groups.entries()];
};

/**
 * Search, «Недавние», then makers. `onHighlight` follows the keyboard/pointer highlight (for a detail pane);
 * `dense` drops context and source for a narrow popover.
 */
export const ModelList = ({
  current,
  onPick,
  onHighlight,
  dense,
  autoFocus = true,
  className,
}: {
  current: string;
  onPick: (m: ChatModel) => void;
  onHighlight?: (m: ChatModel) => void;
  dense?: boolean;
  autoFocus?: boolean;
  className?: string;
}) => {
  const groups = useMemo(byMaker, []);
  const [value, setValue] = useState(current);
  const row = (m: ChatModel, prefix: string) => (
    <CommandItem className="gap-2.5 py-1.5" key={`${prefix}${m.id}`} keywords={[m.makerTitle, m.source]} onSelect={() => onPick(m)} value={`${prefix}${m.id}`}>
      <BrandLogo label={m.makerTitle} logo={m.maker} size={20} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{m.title}</span>
        {!dense && <span className="text-muted-foreground truncate text-xs">{m.source}</span>}
      </span>
      <Caps m={m} />
      {!dense && <span className="text-muted-foreground w-10 text-right text-xs tabular-nums">{fmtContext(m.context) ?? "—"}</span>}
    </CommandItem>
  );
  return (
    <Command
      className={cn("bg-transparent", className)}
      onValueChange={(v) => {
        setValue(v);
        const id = v.replace(/^r:/u, "");
        const m = MODELS.find((x) => x.id === id);
        if (m) {
          onHighlight?.(m);
        }
      }}
      value={value}
    >
      <CommandInput autoFocus={autoFocus} placeholder="Модель, провайдер или источник" />
      <CommandList className="max-h-80">
        <CommandEmpty>Такой модели нет в чате</CommandEmpty>
        <CommandGroup heading="Недавние">{RECENT.map((id) => row(modelById(id), "r:"))}</CommandGroup>
        {groups.map(([maker, list]) => (
          <CommandGroup heading={maker} key={maker}>
            {list.map((m) => row(m, ""))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
};

// --- `/` skills and `@` connections --------------------------------------------------------------

type Trigger = { char: "/" | "@"; start: number; query: string };

/** A trigger right before the caret: `/` at the start of a line, `@` after a space or at the start. */
const findTrigger = (text: string, caret: number): Trigger | null => {
  const before = text.slice(0, caret);
  const match = /(?:^|\s)([/@])([\p{L}\p{N}-]*)$/u.exec(before);
  if (!match?.[1]) {
    return null;
  }
  const char = match[1] as "/" | "@";
  const start = before.length - (match[2]?.length ?? 0) - 1;
  if (char === "/" && start > 0 && before[start - 1] !== "\n") {
    return null;
  }
  return { char, query: (match[2] ?? "").toLowerCase(), start };
};

type MenuItem = { id: string; title: string; hint: string; icon: React.ReactNode };

/**
 * The `/` and `@` menus over the textarea. Focus stays in the text: arrows move, Enter or Tab takes, Esc closes.
 * Picking removes the typed trigger and hands the item to the composer, which shows it as a chip.
 */
export const useMentions = ({
  text,
  setText,
  onSkill,
  onConnection,
  taken,
}: {
  text: string;
  setText: (t: string) => void;
  onSkill: (s: Skill) => void;
  onConnection: (c: Connection) => void;
  taken: string[];
}) => {
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [active, setActive] = useState(0);

  const items: MenuItem[] = useMemo(() => {
    if (!trigger) {
      return [];
    }
    const source =
      trigger.char === "/"
        ? SKILLS.map((s) => ({ hint: s.hint, icon: <span className="text-muted-foreground w-4 text-center">/</span>, id: s.id, title: s.title }))
        : CONNECTIONS.filter((c) => !taken.includes(c.id)).map((c) => ({ hint: c.hint, icon: <ConnectionIcon id={c.id} />, id: c.id, title: c.title }));
    return source.filter((i) => i.title.toLowerCase().includes(trigger.query) || i.id.includes(trigger.query));
  }, [trigger, taken]);

  const onCaret = (el: HTMLTextAreaElement) => {
    const t = findTrigger(el.value, el.selectionStart);
    setTrigger(t);
    setActive(0);
  };

  const pick = (item: MenuItem) => {
    if (!trigger) {
      return;
    }
    const end = trigger.start + 1 + trigger.query.length;
    setText(`${text.slice(0, trigger.start)}${text.slice(end)}`.replace(/^\s+/u, ""));
    if (trigger.char === "/") {
      onSkill(SKILLS.find((s) => s.id === item.id) as Skill);
    } else {
      onConnection(CONNECTIONS.find((c) => c.id === item.id) as Connection);
    }
    setTrigger(null);
  };

  /** Returns true when the key was the menu's. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!trigger || items.length === 0) {
      return false;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pick(items[active] as MenuItem);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setTrigger(null);
      return true;
    }
    return false;
  };

  const menu =
    trigger && items.length > 0 ? (
      <div
        className={cn(
          "bg-popover text-popover-foreground ring-foreground/10 absolute inset-x-0 bottom-[calc(100%+6px)] z-20 origin-bottom rounded-xl p-1 shadow-md ring-1",
          "animate-in fade-in zoom-in-[0.98] duration-150 motion-reduce:zoom-in-100",
          EASE
        )}
        id="mention-menu"
        role="listbox"
      >
        <p className="text-muted-foreground px-2 pt-1 pb-1.5 text-xs">{trigger.char === "/" ? "Скиллы" : "Подключения"}</p>
        {items.map((item, i) => (
          <button
            aria-selected={i === active}
            className={cn("flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm [&_svg]:size-4", i === active && "bg-accent")}
            id={`mention-${item.id}`}
            key={item.id}
            onMouseDown={(e) => {
              e.preventDefault();
              pick(item);
            }}
            onMouseEnter={() => setActive(i)}
            role="option"
            type="button"
          >
            {item.icon}
            <span className="flex-1">{item.title}</span>
            <span className="text-muted-foreground text-xs">{item.hint}</span>
          </button>
        ))}
      </div>
    ) : null;

  return { activeId: trigger && items[active] ? `mention-${items[active].id}` : undefined, menu, onCaret, onKeyDown, open: Boolean(menu) };
};

// --- attachments ----------------------------------------------------------------------------------

export const useFiles = () => {
  const [files, setFiles] = useState<Attachment[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const picker = (
    <input
      className="hidden"
      multiple
      onChange={(e) => {
        const list = [...(e.target.files ?? [])].map((f) => ({ id: crypto.randomUUID(), name: f.name, size: f.size }));
        setFiles((fs) => [...fs, ...list]);
        e.target.value = "";
      }}
      ref={input}
      type="file"
    />
  );
  return {
    clear: () => setFiles([]),
    files,
    open: () => input.current?.click(),
    picker,
    remove: (id: string) => setFiles((fs) => fs.filter((f) => f.id !== id)),
  };
};

export const Hint = ({ children }: { children: React.ReactNode }) => (
  <span className="text-muted-foreground hidden items-center gap-1 text-[11px] sm:flex">{children}</span>
);

export const SendButton = ({ streaming, disabled, onStop }: { streaming: boolean; disabled: boolean; onStop: () => void }) =>
  streaming ? (
    <Button aria-label="Остановить (Esc)" className="size-8 rounded-full active:scale-[0.97]" onClick={onStop} size="icon" type="button">
      <span className="size-2.5 rounded-[2px] bg-current" />
    </Button>
  ) : (
    // aria-disabled, not disabled: InputGroup fades as a whole (has-disabled) when any control inside is disabled.
    <Button
      aria-disabled={disabled}
      className={cn("size-8 rounded-full transition-[transform,opacity] duration-150 active:scale-[0.97]", disabled && "pointer-events-none opacity-40")}
      size="icon"
      type="submit"
    >
      <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 24 24">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </Button>
  );

export { Kbd };
