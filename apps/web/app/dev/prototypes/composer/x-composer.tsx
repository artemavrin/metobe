"use client";

// The composer, chosen direction. Two layers, after the reference: a soft grey shell with a band on top — the
// attached files as cards, or, in a chat, how full the context is — and the white card inside with the text and
// a quiet toolbar: «+», the model, «Думать», the connections in play, send. Monochrome; colour only on send.
import { Button } from "@metobe/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@metobe/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@metobe/ui/components/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@metobe/ui/components/popover";
import { cn } from "@metobe/ui/lib/utils";
import { Activity, AtSign, Brain, ChevronDown, Paperclip, Plus, Slash, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BrandLogo } from "@/components/brand-logo";

import { CONNECTIONS, DEFAULT_MODEL, modelById, SKILLS } from "./data";
import { type ComposerProps, EASE, Kbd, useModelHotkey } from "./shared";
import { useFavorites } from "./t3-kit";
import { type EditorHandle, type Token, TokenEditor, TokenIcon, type Trigger } from "./x-editor";
import { FileTray, type Tray, useDropZone, useTray } from "./x-files";
import { PalettePicker } from "./x-picker";
import { QuickPicker } from "./x-quick";

type Item = Token & { hint: string };

/** The `/` or `@` menu, anchored at the caret — it opens where you are typing. */
const MentionMenu = ({ trigger, items, active, onPick, onHover, box }: { trigger: Trigger; items: Item[]; active: number; onPick: (i: Item) => void; onHover: (i: number) => void; box: DOMRect }) => (
  <div
    className={cn(
      "bg-popover text-popover-foreground ring-foreground/10 absolute z-30 w-72 origin-bottom-left rounded-xl p-1 shadow-lg ring-1",
      "animate-in fade-in zoom-in-[0.97] duration-150 motion-reduce:zoom-in-100",
      EASE
    )}
    id="mention-menu"
    role="listbox"
    style={{ bottom: box.bottom - trigger.rect.top + 6, left: Math.max(8, Math.min(trigger.rect.left - box.left - 8, box.width - 296)) }}
  >
    <p className="text-muted-foreground px-2 pt-1 pb-1.5 text-[11px] font-medium tracking-wide uppercase">{trigger.char === "/" ? "Скиллы" : "Подключения"}</p>
    {items.length === 0 && <p className="text-muted-foreground px-2 py-3 text-sm">Ничего не нашлось</p>}
    {items.map((item, i) => (
      <button
        aria-selected={i === active}
        className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm", i === active && "bg-accent")}
        id={`mention-${item.id}`}
        key={item.id}
        onMouseDown={(e) => {
          e.preventDefault();
          onPick(item);
        }}
        onMouseEnter={() => onHover(i)}
        role="option"
        type="button"
      >
        <span className="bg-muted text-foreground/80 flex size-6 items-center justify-center rounded-md [&_svg]:size-3.5">
          <TokenIcon t={item} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span>{item.label}</span>
          <span className="text-muted-foreground truncate text-xs">{item.hint}</span>
        </span>
      </button>
    ))}
  </div>
);

const fmtK = (n: number) => (n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : `${Math.max(1, Math.round(n / 1000))}K`);

/** The band's quiet status in a chat: how full the context is — tokens from model_runs, the window from the model. */
const ContextBand = ({ used, window, onClose }: { used: number; window: number; onClose: () => void }) => {
  const pct = Math.max(1, Math.round((used / window) * 100));
  return (
    <div className={cn("text-muted-foreground animate-in fade-in flex h-9 items-center gap-2 px-3 text-sm duration-150", EASE)}>
      <Activity className="size-4 shrink-0" />
      <span className="truncate">
        Контекст заполнен на {pct}%<span className="mx-1.5 opacity-50">•</span>
        {fmtK(used)} из {fmtK(window)} токенов
      </span>
      {pct >= 80 && <span className="text-foreground truncate">— начните новый чат, чтобы не терять начало</span>}
      <button aria-label="Скрыть" className="hover:text-foreground hover:bg-background/70 ml-auto flex size-6 items-center justify-center rounded-md transition-colors" onClick={onClose} type="button">
        <X className="size-4" />
      </button>
    </div>
  );
};

const plural = (n: number) => (n === 1 ? "подключение" : n >= 2 && n <= 4 ? "подключения" : "подключений");

export const ComposerFinal = ({
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
  const [empty, setEmpty] = useState(true);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [active, setActive] = useState(0);
  const [modelId, setModelId] = useState(lastModelId ?? DEFAULT_MODEL);
  const [think, setThink] = useState(true);
  const [tools, setTools] = useState<string[]>(CONNECTIONS.map((c) => c.id));
  const [quick, setQuick] = useState(false);
  const [palette, setPalette] = useState(false);
  const [opened, setOpened] = useState(0);
  const [bandClosed, setBandClosed] = useState(false);
  const favorites = useFavorites();
  const tray: Tray = useTray();
  const fileInput = useRef<HTMLInputElement>(null);
  const drop = useDropZone(tray.add);
  const model = modelById(modelId);
  const canThink = model.caps.reasoning !== false;

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

  const openQuick = (o: boolean) => {
    if (o && !quick) {
      setOpened((n) => n + 1);
    }
    setQuick(o);
  };
  useModelHotkey(() => openQuick(true));

  const items: Item[] = useMemo(() => {
    if (!trigger) {
      return [];
    }
    const taken = new Set(editor.current?.tokens().map((t) => `${t.kind}:${t.id}`));
    const all: Item[] =
      trigger.char === "/"
        ? SKILLS.map((s) => ({ hint: s.hint, id: s.id, kind: "skill" as const, label: s.title }))
        : CONNECTIONS.filter((c) => tools.includes(c.id)).map((c) => ({ hint: c.hint, id: c.id, kind: "connection" as const, label: c.title }));
    return all.filter((i) => !taken.has(`${i.kind}:${i.id}`) && (i.label.toLowerCase().includes(trigger.query) || i.id.includes(trigger.query)));
  }, [trigger, tools]);

  const onTrigger = useCallback((t: Trigger | null) => {
    setTrigger(t);
    setActive(0);
  }, []);

  const insert = (i: Item) => {
    editor.current?.insertToken({ id: i.id, kind: i.kind, label: i.label });
    setTrigger(null);
  };

  const pickModel = (id: string) => {
    setModelId(id);
    setQuick(false);
    setPalette(false);
    editor.current?.focus();
  };

  const uploading = tray.files.some((f) => f.progress < 1);
  const submit = () => {
    const segments = editor.current?.value() ?? [];
    const text = segments.map((s) => (typeof s === "string" ? s : s.label)).join("").trim();
    if (!text || streaming || uploading) {
      return;
    }
    const tokens = segments.filter((s): s is Token => typeof s !== "string");
    onSend({
      connections: CONNECTIONS.filter((c) => tools.includes(c.id)),
      effort: canThink && think ? "normal" : "off",
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
  const showContext = !bandClosed && tray.shown.length === 0 && contextTokens !== undefined && model.context !== null;
  const disabled = empty || uploading;

  return (
    <form
      className="relative"
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

      {/* The shell: grey, the band on top, the white card nested inside — radius 22 = 18 + 4 of padding */}
      <div {...drop.props} className="bg-muted/70 dark:bg-muted/40 ring-border/70 relative rounded-[22px] p-1 ring-1" ref={box}>
        {drop.overlay}
        {trigger && boxRect && <MentionMenu active={active} box={boxRect} items={items} onHover={setActive} onPick={insert} trigger={trigger} />}
        <FileTray tray={tray} />
        {showContext && <ContextBand onClose={() => setBandClosed(true)} used={contextTokens} window={model.context as number} />}

        <div className="bg-background border-border/80 flex flex-col rounded-[18px] border shadow-xs">
          <TokenEditor
            autoFocus={autoFocus}
            className={cn("max-h-60", home ? "min-h-24" : "min-h-16")}
            onEmptyChange={setEmpty}
            onFiles={tray.add}
            onKeyDown={(e) => {
              if (trigger && items.length > 0) {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
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
              <DropdownMenuTrigger render={<Button aria-label="Добавить" className="rounded-lg" size="icon-sm" type="button" variant="ghost" />}>
                <Plus />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60" side="top">
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

            <Popover onOpenChange={openQuick} open={quick}>
              <PopoverTrigger render={<Button className="h-8 gap-1.5 rounded-lg px-2 font-normal" size="sm" type="button" variant="ghost" />}>
                <BrandLogo label={model.makerTitle} logo={model.maker} size={18} tile={false} />
                <span className={cn("animate-in fade-in duration-150", EASE)} key={model.id}>
                  {model.title}
                </span>
                <ChevronDown className="opacity-50" />
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto overflow-hidden p-0" side="top" sideOffset={10}>
                <QuickPicker
                  current={model}
                  favorites={favorites}
                  key={opened}
                  onPick={(m) => pickModel(m.id)}
                  onShowAll={() => {
                    setQuick(false);
                    setPalette(true);
                  }}
                />
              </PopoverContent>
            </Popover>

            {canThink && (
              <button
                aria-pressed={think}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm transition-[background-color,color,transform] duration-150 active:scale-[0.97]",
                  think ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
                onClick={() => setThink((t) => !t)}
                type="button"
              >
                <Brain className="size-4" /> Думать
              </button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    className="text-muted-foreground hover:text-foreground hover:border-foreground/20 ml-0.5 flex h-6 items-center gap-1.5 rounded-full border px-2 text-xs transition-colors"
                    type="button"
                  />
                }
              >
                <span className={cn("size-1.5 rounded-full", tools.length > 0 ? "bg-primary" : "bg-muted-foreground/40")} />
                {tools.length === 0 ? "без подключений" : `${tools.length} ${plural(tools.length)}`}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64" side="top">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Что модель может спросить в этом чате</DropdownMenuLabel>
                  {CONNECTIONS.map((c) => (
                    <DropdownMenuCheckboxItem
                      checked={tools.includes(c.id)}
                      key={c.id}
                      onCheckedChange={(on) => setTools((ts) => (on ? [...ts, c.id] : ts.filter((t) => t !== c.id)))}
                    >
                      <TokenIcon t={{ id: c.id, kind: "connection" }} /> {c.title}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <span className="ml-auto flex items-center gap-2">
              {uploading && <span className={cn("text-muted-foreground animate-in fade-in text-xs duration-150", EASE)}>Загружаем файлы…</span>}
              {streaming ? (
                <Button aria-label="Остановить (Esc)" className="size-9 rounded-xl transition-transform duration-150 active:scale-[0.97]" onClick={onStop} size="icon" type="button">
                  <span className="size-3 rounded-[3px] bg-current" />
                </Button>
              ) : (
                <Button
                  aria-disabled={disabled}
                  aria-label="Отправить"
                  className={cn("size-9 rounded-xl transition-[transform,opacity] duration-150 active:scale-[0.97]", disabled && "pointer-events-none opacity-40")}
                  size="icon"
                  type="submit"
                >
                  <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 24 24">
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </Button>
              )}
            </span>
          </div>
        </div>
      </div>
      <p className="text-muted-foreground mt-2 flex items-center justify-center gap-1.5 text-xs">
        Metobe может ошибаться — проверяйте важное <span className="opacity-50">·</span> <Kbd>⌘/</Kbd> модель
      </p>

      <Dialog onOpenChange={setPalette} open={palette}>
        <DialogContent className="top-[16%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-3xl" showCloseButton={false}>
          <DialogTitle className="sr-only">Все модели</DialogTitle>
          <DialogDescription className="sr-only">Список моделей в чате и сведения о выделенной</DialogDescription>
          <PalettePicker className="h-[min(32rem,76vh)] w-full" current={model} favorites={favorites} onPick={(m) => pickModel(m.id)} />
        </DialogContent>
      </Dialog>
    </form>
  );
};
