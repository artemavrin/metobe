"use client";

// Round 4 «Щелчок» — the composer (spec §3): the same two-layer shell, a toolbar of three — «+», the model chip,
// send. The chip opens the favorites picker; ⌘/ opens the palette from anywhere. Everything the hand touches
// answers: the chip's name rolls to the new model, send morphs into stop and into an upload ring, the context
// percent rolls, badges pop in and shrink out, file cards settle.
import { Button } from "@metobe/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@metobe/ui/components/dropdown-menu";
import { Kbd } from "@metobe/ui/components/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@metobe/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { Activity, AtSign, ChevronDown, Paperclip, Plus, Slash, X } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { BrandLogo } from "@/components/brand-logo";

import { anyModel, type ChatModel, CONNECTIONS, DEFAULT_MODEL, SKILLS } from "./data";
import type { ComposerProps } from "./shared";
import { useFavorites } from "./t3-kit";
import { type EditorHandle, type Token, TokenEditor, TokenIcon, type Trigger } from "./x-editor";
import { type Tray, useDropZone, useTray } from "./x-files";
import { FavoritesPicker } from "./y-favorites";
import { MotionFileTray } from "./y-files";
import { EASE_IN_OUT, EASE_OUT, type NavSource, RollingDigits, SNAP, useListHighlight, Y_CSS } from "./y-motion";
import { ModelPalette, type PaletteOpening } from "./y-palette";

type Item = Token & { hint: string };
type Dir = -1 | 0 | 1;

// --- the model chip: the name rolls to the next model --------------------------------------------

const roll = {
  center: { filter: "blur(0px)", opacity: 1, transform: "translateY(0%)" },
  enter: (d: Dir) => ({ filter: "blur(2px)", opacity: 0, transform: `translateY(${(d || 1) * 100}%)` }),
  exit: (d: Dir) => ({ filter: "blur(2px)", opacity: 0, transform: `translateY(${-(d || 1) * 100}%)`, transition: { duration: 0.15, ease: EASE_OUT } }),
};
// ⌘1–9 from the composer can happen a hundred times a day: no travel, only a quick fade.
const fade = {
  center: { filter: "blur(0px)", opacity: 1, transform: "translateY(0%)" },
  enter: () => ({ filter: "blur(2px)", opacity: 0, transform: "translateY(0%)" }),
  exit: () => ({ filter: "blur(0px)", opacity: 0, transform: "translateY(0%)", transition: { duration: 0.1, ease: EASE_OUT } }),
};

const ChipContent = ({ model, dir, mode }: { model: ChatModel; dir: Dir; mode: "roll" | "fade" }) => {
  const measure = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    // Rounded up: offsetWidth rounds down and the last letter would turn into an ellipsis.
    const w = measure.current?.getBoundingClientRect().width;
    setWidth(w === undefined ? undefined : Math.ceil(w) + 1);
  }, [model.id]);
  const variants = mode === "roll" ? roll : fade;
  return (
    <>
      <AnimatePresence custom={dir} initial={false} mode="popLayout">
        <motion.span
          animate={{ filter: "blur(0px)", opacity: 1, transform: "scale(1)" }}
          className="flex"
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          initial={mode === "roll" ? { filter: "blur(2px)", opacity: 0, transform: "scale(0.9)" } : { opacity: 0 }}
          key={model.id}
          transition={{ duration: mode === "roll" ? 0.2 : 0.15, ease: EASE_OUT }}
        >
          <BrandLogo label={model.makerTitle} logo={model.maker} size={18} tile={false} />
        </motion.span>
      </AnimatePresence>
      <motion.span
        animate={{ width }}
        className="relative inline-flex h-5 max-w-[180px] items-center overflow-hidden"
        initial={false}
        transition={mode === "roll" ? { duration: 0.2, ease: EASE_OUT } : SNAP}
      >
        <AnimatePresence custom={dir} initial={false} mode="popLayout">
          <motion.span
            animate="center"
            className="truncate whitespace-nowrap"
            custom={dir}
            exit="exit"
            initial="enter"
            key={model.id}
            transition={{ duration: mode === "roll" ? 0.2 : 0.15, ease: EASE_OUT }}
            variants={variants}
          >
            {model.title}
          </motion.span>
        </AnimatePresence>
      </motion.span>
      <span aria-hidden className="invisible absolute -z-10 whitespace-nowrap" ref={measure}>
        {model.title}
      </span>
    </>
  );
};

// --- send: one button, three states ----------------------------------------------------------------

type SendState = "send" | "upload" | "stop";

const Ring = ({ p }: { p: number }) => (
  <svg aria-hidden className="size-4 -rotate-90" viewBox="0 0 16 16">
    <circle className="opacity-30" cx="8" cy="8" fill="none" r="7" stroke="currentColor" strokeWidth="2" />
    <circle
      cx="8"
      cy="8"
      fill="none"
      r="7"
      stroke="currentColor"
      strokeDasharray="43.98"
      strokeDashoffset={43.98 * (1 - p)}
      strokeLinecap="round"
      strokeWidth="2"
      style={{ transition: "stroke-dashoffset 100ms linear" }}
    />
  </svg>
);

const SEND_ICON = {
  send: (
    <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 24 24">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  ),
  stop: <span className="size-3 rounded-[3px] bg-current" />,
};

/** The arrow flies out through the top when a message goes; the stop square settles in; uploads show a ring. */
const SendButton = ({
  state,
  progress,
  ready,
  onStop,
  shakeRef,
}: {
  state: SendState;
  progress: number;
  ready: boolean;
  onStop: () => void;
  shakeRef: React.RefObject<HTMLButtonElement | null>;
}) => {
  const prev = useRef<SendState>(state);
  const from = prev.current;
  prev.current = state;
  // Direction of the morph: send → stop sends the arrow up; stop → send brings it up from below.
  const up = from === "send" && state === "stop" ? -1 : 1;
  const label = { send: "Отправить", stop: "Остановить (Esc)", upload: `Загружаем файлы — ${Math.round(progress * 100)}%` }[state];
  const dim = state === "send" && !ready;
  return (
    <Button
      aria-disabled={dim || state === "upload"}
      aria-label={label}
      className={cn(
        "relative size-9 overflow-hidden rounded-xl active:translate-y-0 active:scale-[0.97]",
        "[transition:scale_160ms_cubic-bezier(0.23,1,0.32,1),opacity_150ms_ease]",
        dim && "opacity-40"
      )}
      onClick={(e) => {
        if (state === "stop") {
          e.preventDefault();
          onStop();
        }
      }}
      ref={shakeRef}
      size="icon"
      type={state === "stop" ? "button" : "submit"}
    >
      <AnimatePresence custom={up} initial={false} mode="popLayout">
        <motion.span
          animate={{ filter: "blur(0px)", opacity: 1, transform: "translateY(0%) scale(1)" }}
          className="flex items-center justify-center"
          custom={up}
          exit={
            state === "stop"
              ? { opacity: 0, transform: "translateY(-100%) scale(1)", transition: { duration: 0.15, ease: EASE_OUT } }
              : { filter: "blur(2px)", opacity: 0, transform: "translateY(0%) scale(0.9)", transition: { duration: 0.15, ease: EASE_OUT } }
          }
          initial={
            state === "send" && from === "stop"
              ? { opacity: 0, transform: "translateY(100%) scale(1)" }
              : { filter: "blur(2px)", opacity: 0, transform: "translateY(0%) scale(0.9)" }
          }
          key={state}
          transition={{ duration: state === "upload" || from === "upload" ? 0.16 : 0.2, ease: EASE_OUT }}
        >
          {state === "upload" ? <Ring p={progress} /> : SEND_ICON[state]}
        </motion.span>
      </AnimatePresence>
    </Button>
  );
};

// --- the band's context status: the percent rolls -------------------------------------------------

const fmtK = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : `${Math.max(1, Math.round(n / 1000))}K`);

const ContextBand = ({ used, window, onClose }: { used: number; window: number; onClose: () => void }) => {
  const pct = Math.min(99, Math.max(1, Math.round((used / window) * 100)));
  const full = pct >= 80;
  return (
    <div className="text-muted-foreground flex h-9 items-center gap-2 px-3 pb-1 text-sm">
      <Activity className="size-4 shrink-0" />
      <span className={cn("flex min-w-0 items-center truncate transition-colors duration-200", full && "text-amber-700 dark:text-amber-300")}>
        Контекст заполнен на&nbsp;
        <RollingDigits text={String(pct)} />%<span className="mx-1.5 opacity-50">•</span>
        {fmtK(used)} из&nbsp;
        <span className="y-fade-in" key={window}>
          {fmtK(window)}
        </span>
        &nbsp;токенов
      </span>
      {full && <span className="text-foreground y-fade-in hidden truncate sm:inline">— начните новый чат</span>}
      <button
        aria-label="Скрыть"
        className="hover:text-foreground hover:bg-background/70 ml-auto flex size-6 items-center justify-center rounded-md transition-[color,background-color] duration-150 active:scale-[0.97]"
        onClick={onClose}
        type="button"
      >
        <X className="size-4" />
      </button>
    </div>
  );
};

// --- `/` and `@`: the menu at the caret, the highlight travels -----------------------------------

const MentionMenu = ({
  trigger,
  items,
  active,
  onPick,
  onHover,
  box,
  nav,
}: {
  trigger: Trigger;
  items: Item[];
  active: number;
  onPick: (i: Item) => void;
  onHover: (i: number) => void;
  box: DOMRect;
  nav: React.RefObject<NavSource>;
}) => {
  const list = useRef<HTMLDivElement>(null);
  const hl = useListHighlight({ container: list, deps: [active, items.length, trigger.char], source: nav });
  return (
    // No entrance: it appears on a keystroke, tens of times a day.
    <div
      className="bg-popover text-popover-foreground ring-foreground/10 absolute z-30 w-72 rounded-xl p-1 shadow-lg ring-1"
      id="mention-menu"
      role="listbox"
      style={{ bottom: box.bottom - trigger.rect.top + 6, left: Math.max(8, Math.min(trigger.rect.left - box.left - 8, box.width - 296)) }}
    >
      <p className="text-muted-foreground px-2 pt-1 pb-1.5 text-[11px] font-medium tracking-wide uppercase">{trigger.char === "/" ? "Скиллы" : "Подключения"}</p>
      {items.length === 0 && <p className="text-muted-foreground px-2 py-3 text-sm">Ничего не нашлось</p>}
      <div className="relative" ref={list}>
        <div aria-hidden className="bg-accent pointer-events-none absolute inset-x-0 top-0 rounded-lg opacity-0" ref={hl} />
        {items.map((item, i) => (
          <button
            aria-selected={i === active}
            className="relative z-[1] flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm"
            id={`mention-${item.id}`}
            key={item.id}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(item);
            }}
            onPointerMove={() => {
              if (i !== active) {
                nav.current = "step";
                onHover(i);
              }
            }}
            role="option"
            type="button"
          >
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-md [&_svg]:size-3.5",
                item.kind === "skill" ? "bg-violet-500/10 text-violet-700 dark:text-violet-300" : "bg-sky-500/10 text-sky-700 dark:text-sky-300"
              )}
            >
              <TokenIcon t={item} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span>{item.label}</span>
              <span className="text-muted-foreground truncate text-xs">{item.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

// --- the composer -----------------------------------------------------------------------------------

export const ComposerClick = ({
  onSend,
  onStop,
  streaming,
  autoFocus,
  home,
  demoFiles,
  lastModelId,
  contextTokens,
}: ComposerProps & { demoFiles?: boolean; contextTokens?: number }) => {
  const editor = useRef<EditorHandle>(null);
  const box = useRef<HTMLDivElement>(null);
  const sendRef = useRef<HTMLButtonElement>(null);
  const nav = useRef<NavSource>("snap");
  const [empty, setEmpty] = useState(true);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [active, setActive] = useState(0);
  const [modelId, setModelId] = useState(lastModelId ?? DEFAULT_MODEL);
  const [chip, setChip] = useState<{ dir: Dir; mode: "roll" | "fade" }>({ dir: 1, mode: "roll" });
  const [picker, setPicker] = useState(false);
  /** The chip's hint; never while its picker is open (it would pop over the list a moment later). */
  const [chipTip, setChipTip] = useState(false);
  /** Leaving the picker for the palette: the picker vanishes at once, no exit. */
  const [pickerInstantClose, setPickerInstantClose] = useState(false);
  const [palette, setPalette] = useState(false);
  const [opening, setOpening] = useState<PaletteOpening>({ via: "key" });
  const [bandClosed, setBandClosed] = useState(false);
  const [live, setLive] = useState("");
  const favorites = useFavorites();
  const tray: Tray = useTray();
  const fileInput = useRef<HTMLInputElement>(null);
  const drop = useDropZone(tray.add);
  const model = anyModel(modelId) ?? anyModel(DEFAULT_MODEL);

  // The home screen starts with the reference's three files, to judge the band without picking any.
  const { add } = tray;
  const seeded = useRef(false);
  useEffect(() => {
    if (demoFiles && !seeded.current) {
      seeded.current = true;
      add([
        { name: "churn-q3.csv", size: 184_000 },
        { name: "stripe-webhook.ts", size: 6200 },
        { name: "release-notes-3.4.md", size: 9100 },
      ]);
    }
  }, [demoFiles, add]);

  const choose = useCallback((m: ChatModel, dir: Dir, mode: "roll" | "fade" = "roll") => {
    setChip({ dir, mode });
    setModelId(m.id);
  }, []);

  /** The picker is closing because the palette opens: it must not hand focus back to the text. */
  const toPalette = useRef(false);
  const openPalette = useCallback((o: PaletteOpening) => {
    editor.current?.saveCaret();
    toPalette.current = true;
    setPickerInstantClose(true);
    setPicker(false);
    setOpening(o);
    setPalette(true);
  }, []);

  // ⌘/ from anywhere, by the physical key (works on ЙЦУКЕН too). Toggles the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.code === "Slash") {
        e.preventDefault();
        if (palette) {
          setPalette(false);
        } else {
          openPalette({ via: "key" });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [palette, openPalette]);

  const items: Item[] = useMemo(() => {
    if (!trigger) {
      return [];
    }
    const taken = new Set(editor.current?.tokens().map((t) => `${t.kind}:${t.id}`));
    const all: Item[] =
      trigger.char === "/"
        ? SKILLS.map((s) => ({ hint: s.hint, id: s.id, kind: "skill" as const, label: s.title }))
        : CONNECTIONS.map((c) => ({ hint: c.hint, id: c.id, kind: "connection" as const, label: c.title }));
    return all.filter((i) => !taken.has(`${i.kind}:${i.id}`) && (i.label.toLowerCase().includes(trigger.query) || i.id.includes(trigger.query)));
  }, [trigger]);

  const onTrigger = useCallback((t: Trigger | null) => {
    nav.current = "snap";
    setTrigger(t);
    setActive(0);
  }, []);

  const insert = (i: Item) => {
    editor.current?.insertToken({ id: i.id, kind: i.kind, label: i.label });
    setTrigger(null);
  };

  const uploadingFiles = tray.files.filter((f) => f.progress < 1);
  const uploading = uploadingFiles.length > 0;
  const progress = uploading ? uploadingFiles.reduce((n, f) => n + f.progress, 0) / uploadingFiles.length : 1;

  /** A send that cannot go yet (files still uploading) shakes the button and says why. */
  const refuse = () => {
    const el = sendRef.current;
    if (!el) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.animate([{ opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }], { duration: 150, easing: "ease" });
    } else {
      el.classList.remove("animate-shake");
      void el.offsetWidth;
      el.classList.add("animate-shake");
    }
    setLive("Дождитесь загрузки файлов");
  };

  const submit = () => {
    const segments = editor.current?.value() ?? [];
    const text = segments.map((s) => (typeof s === "string" ? s : s.label)).join("").trim();
    if (!text || streaming) {
      return;
    }
    if (uploading) {
      refuse();
      return;
    }
    const tokens = segments.filter((s): s is Token => typeof s !== "string");
    onSend({
      connections: CONNECTIONS,
      effort: model.caps.reasoning === false ? "off" : "normal",
      files: tray.files.map((f) => ({ id: f.id, name: f.name, preview: f.preview, size: f.size })),
      model,
      segments,
      skill: SKILLS.find((s) => tokens.some((t) => t.kind === "skill" && t.id === s.id)),
      text,
    });
    editor.current?.clear();
    tray.clear();
  };

  const boxRect = box.current?.getBoundingClientRect();
  const showContext = !bandClosed && tray.files.length === 0 && contextTokens !== undefined && model.context !== null;
  // The band's height is set, not measured: 36 for files (28px cards) and for the context line alike, else 0. One
  // motion when the last file goes — the card shrinks away while the band closes, instead of a step and then another.
  const bandHeight = tray.files.length > 0 || showContext ? 36 : 0;
  const sendState: SendState = streaming ? "stop" : uploading ? "upload" : "send";

  return (
    <MotionConfig reducedMotion="user">
      <style>{Y_CSS}</style>
      <form
        className="relative"
        onKeyDown={(e) => {
          // ⌘1–9 from the composer: the n-th favorite, no surface — the chip only fades to the new name.
          const n = /^Digit([1-9])$/u.exec(e.code)?.[1];
          if (n && (e.metaKey || e.ctrlKey) && !e.altKey) {
            const id = favorites.ids[Number(n) - 1];
            if (id) {
              e.preventDefault();
              choose(anyModel(id), 0, "fade");
            }
          }
        }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          className="hidden"
          multiple
          onChange={(e) => {
            tray.add([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
          ref={fileInput}
          type="file"
        />
        <span aria-live="polite" className="sr-only">
          {live}
        </span>

        {/* The shell: grey, the band on top, the white card nested inside — radius 22 = 18 + 4 of padding */}
        <div {...drop.props} className="bg-muted/70 dark:bg-muted/40 ring-border/70 relative rounded-[22px] p-1 ring-1" ref={box}>
          {drop.overlay}
          {trigger && boxRect && <MentionMenu active={active} box={boxRect} items={items} nav={nav} onHover={setActive} onPick={insert} trigger={trigger} />}
          {/* One band with a set height: files, then nothing or the context status — no jumps. */}
          <motion.div animate={{ height: bandHeight }} className="overflow-hidden" initial={false} transition={{ duration: 0.22, ease: EASE_IN_OUT }}>
            {tray.shown.length > 0 ? (
              <MotionFileTray tray={tray} />
            ) : (
              showContext && (
                <div className="y-fade-in">
                  <ContextBand onClose={() => setBandClosed(true)} used={contextTokens} window={model.context as number} />
                </div>
              )
            )}
          </motion.div>

          <div
            className={cn(
              "bg-background border-border/80 flex flex-col rounded-[18px] border shadow-xs",
              "[transition:border-color_200ms_ease,box-shadow_200ms_ease] focus-within:border-foreground/15",
              "focus-within:shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_-1px_rgba(0,0,0,0.06),0_2px_4px_0_rgba(0,0,0,0.04)] dark:focus-within:shadow-xs"
            )}
          >
            <TokenEditor
              autoFocus={autoFocus}
              className={cn("max-h-60", home ? "min-h-24" : "min-h-16")}
              onEmptyChange={setEmpty}
              onFiles={tray.add}
              onKeyDown={(e) => {
                if (trigger && items.length > 0) {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    nav.current = e.repeat ? "snap" : "step";
                    setActive((a) => (a + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
                    return true;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    insert(items[active] as Item);
                    return true;
                  }
                }
                if (trigger && e.key === "Escape") {
                  e.preventDefault();
                  setTrigger(null);
                  return true;
                }
                if (e.key === "Escape" && streaming) {
                  onStop();
                  return true;
                }
                return false;
              }}
              onSubmit={submit}
              onTrigger={onTrigger}
              placeholder={tray.shown.length > 0 ? "Спросите про файлы или о чём угодно…" : "Спросите что-нибудь…"}
              ref={editor}
            />

            <div className="flex items-center gap-1 px-2 pt-1 pb-2">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      aria-label="Добавить"
                      className="group/plus rounded-lg active:translate-y-0 active:scale-[0.97] [transition:scale_160ms_cubic-bezier(0.23,1,0.32,1),background-color_150ms_ease]"
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    />
                  }
                >
                  <Plus className="transition-[rotate] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] group-data-[popup-open]/plus:rotate-45 motion-reduce:transition-none" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-60 duration-150 data-closed:duration-100 data-[instant]:animate-none data-[side=top]:slide-in-from-bottom-0"
                  side="top"
                >
                  <DropdownMenuItem onClick={() => fileInput.current?.click()}>
                    <Paperclip /> Файл или картинка
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setTimeout(() => editor.current?.type("/"), 0)}>
                    <Slash /> Скилл
                    <DropdownMenuShortcut>/</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTimeout(() => editor.current?.type("@"), 0)}>
                    <AtSign /> Подключение
                    <DropdownMenuShortcut>@</DropdownMenuShortcut>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Popover
                onOpenChange={(o) => {
                  if (o) {
                    editor.current?.saveCaret();
                    setPickerInstantClose(false);
                    toPalette.current = false;
                  }
                  setPicker(o);
                }}
                open={picker}
              >
                <Tooltip onOpenChange={(o) => setChipTip(o)} open={chipTip && !picker}>
                  <TooltipTrigger
                    delay={600}
                    render={
                      <PopoverTrigger
                        render={
                          <button
                            className={cn(
                              "group/chip relative flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm",
                              "hover:bg-muted data-[popup-open]:bg-muted active:scale-[0.97]",
                              "[transition:scale_160ms_cubic-bezier(0.23,1,0.32,1),background-color_150ms_ease] motion-reduce:active:scale-100"
                            )}
                            type="button"
                          />
                        }
                      />
                    }
                  >
                    <ChipContent dir={chip.dir} mode={chip.mode} model={model} />
                    <ChevronDown className="size-3.5 opacity-50 transition-[rotate] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] group-data-[popup-open]/chip:rotate-180 motion-reduce:transition-none" />
                  </TooltipTrigger>
                  <TooltipContent>
                    Избранные модели · все — <Kbd>⌘/</Kbd>
                  </TooltipContent>
                </Tooltip>
                <PopoverContent
                  align="start"
                  className={cn(
                    "w-72 gap-0 rounded-[14px] p-1 duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] data-closed:duration-100 data-[instant]:animate-none data-[side=top]:slide-in-from-bottom-0",
                    "motion-reduce:zoom-in-100 motion-reduce:zoom-out-100",
                    pickerInstantClose && "data-closed:animate-none"
                  )}
                  finalFocus={() => {
                    // Leaving for the palette: its search keeps the focus; the caret comes back when it closes.
                    if (!toPalette.current) {
                      requestAnimationFrame(() => editor.current?.restoreCaret());
                    }
                    return false;
                  }}
                  side="top"
                  sideOffset={8}
                >
                  <FavoritesPicker
                    current={model}
                    favorites={favorites}
                    onClose={() => setPicker(false)}
                    onOpenPalette={openPalette}
                    onPick={(m, dir) => {
                      setPicker(false);
                      choose(m, dir);
                    }}
                    open={picker}
                  />
                </PopoverContent>
              </Popover>

              <span className="ml-auto">
                <SendButton onStop={onStop} progress={progress} ready={!empty} shakeRef={sendRef} state={sendState} />
              </span>
            </div>
          </div>
        </div>
        <p className="text-muted-foreground mt-2 flex items-center justify-center gap-1.5 text-xs">
          Metobe может ошибаться — проверяйте важное <span className="opacity-50">·</span> <Kbd>⌘/</Kbd> все модели
        </p>

        <ModelPalette
          contextTokens={contextTokens}
          current={model}
          favorites={favorites}
          hasImages={tray.files.some((f) => f.preview)}
          onClosed={() => requestAnimationFrame(() => editor.current?.restoreCaret())}
          onOpenChange={(o) => {
            if (!o) {
              toPalette.current = false;
            }
            setPalette(o);
          }}
          onPick={(m, dir) => {
            toPalette.current = false;
            setPalette(false);
            choose(m, dir);
          }}
          open={palette}
          opening={opening}
        />
      </form>
    </MotionConfig>
  );
};
