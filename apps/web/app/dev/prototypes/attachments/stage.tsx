"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@metobe/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@metobe/ui/components/dropdown-menu";
import { cn } from "@metobe/ui/lib/utils";
import {
  ChartNoAxesColumn,
  ChevronDown,
  File,
  FileText,
  FileType,
  ImageIcon,
  Paperclip,
  Plug,
  Plus,
  Sparkles,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createContext, use, useEffect, useRef, useState } from "react";

import { MODELS, fmtSize, meta } from "./data";
import type { Item, Kind } from "./data";
import { useEngine } from "./engine";
import { useProto } from "./state";

// Сцена: страница чата — прошлый обмен, отправленные сообщения и композер внизу. Файлы попадают в композер тремя
// путями: «+» → «Файлы», перетаскивание на весь экран (зона подсвечивается) и вставка скриншота ⌘V. Клик по картинке
// в сообщении — крупно, по документу — скачать (свой файл скачивается по-настоящему, образец — подписью).

export const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// --- значки и превью --------------------------------------------------------------------------------------------

const ICON: Record<Kind, typeof File> = {
  doc: FileType,
  image: ImageIcon,
  other: File,
  pdf: FileText,
  sheet: ChartNoAxesColumn,
  text: FileText,
};
/** Тон значка по типу — только оттенок фона, без кричащих цветов. */
const TONE: Record<Kind, string> = {
  doc: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  image: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  other: "bg-muted text-muted-foreground",
  pdf: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  sheet: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  text: "bg-muted text-muted-foreground",
};

export const KindBadge = ({ item, className }: { item: Pick<Item, "kind">; className?: string }) => {
  const Icon = ICON[item.kind];
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-md", TONE[item.kind], className)}>
      <Icon className="size-[55%]" />
    </span>
  );
};

/** Картинка — её превью, остальное — значок типа. */
export const Thumb = ({ item, className }: { item: Item; className?: string }) =>
  item.kind === "image" && item.preview ? (
    // biome-ignore lint: the preview is a data/object URL
    <img alt="" className={cn("shrink-0 rounded-md object-cover", className)} src={item.preview} />
  ) : (
    <KindBadge className={className} item={item} />
  );

/** Тонкая полоса загрузки; на 100 % гаснет (150 мс). */
export const Progress = ({ value, className }: { value: number; className?: string }) => (
  <span className={cn("bg-foreground/10 block h-0.5 overflow-hidden rounded-full", className)}>
    <span
      className="bg-foreground/60 block h-full origin-left rounded-full transition-transform duration-150 ease-linear"
      style={{ transform: `scaleX(${value})` }}
    />
  </span>
);

/** Появление и уход файла: из 0.96 и прозрачности, 180 мс, сильный ease-out; без движения — только прозрачность. */
export const useAppear = () => {
  const reduce = useReducedMotion();
  return {
    animate: { opacity: 1, transform: "scale(1)" },
    exit: { opacity: 0, transform: reduce ? "scale(1)" : "scale(0.96)", transition: { duration: 0.15, ease: EASE_OUT } },
    initial: { opacity: 0, transform: reduce ? "scale(1)" : "scale(0.96)" },
    transition: { duration: 0.18, ease: EASE_OUT },
  };
};

// --- просмотр: картинка крупно, документ — скачать ---------------------------------------------------------------

type Viewer = { open: (item: Item) => void };
const ViewerCtx = createContext<Viewer>({ open: () => undefined });
export const useViewer = () => use(ViewerCtx);

const download = (item: Item) => {
  if (!item.file) return false;
  const url = URL.createObjectURL(item.file);
  const a = document.createElement("a");
  a.href = url;
  a.download = item.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
};

// --- композер ----------------------------------------------------------------------------------------------------

export const AddMenu = ({ onFiles }: { onFiles: () => void }) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={
        <button
          aria-label="Добавить"
          className={cn(
            "text-muted-foreground inline-flex size-9 shrink-0 items-center justify-center rounded-full",
            "hover:bg-foreground/[0.06] hover:text-foreground data-[popup-open]:bg-foreground/[0.06] active:scale-[0.97]",
            "[transition:scale_160ms_cubic-bezier(0.23,1,0.32,1),background-color_150ms_ease,color_150ms_ease] motion-reduce:active:scale-100"
          )}
          title="Добавить"
          type="button"
        />
      }
    >
      <Plus className="size-[18px]" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-56" side="top" sideOffset={8}>
      <DropdownMenuItem onClick={onFiles}>
        <Paperclip />
        Файлы
        <span className="text-muted-foreground ml-auto pl-3 text-xs">до {fmtSize(20 * 1024 * 1024)}</span>
      </DropdownMenuItem>
      <DropdownMenuItem disabled>
        <Sparkles />
        Скиллы
        <span className="text-muted-foreground ml-auto pl-3 text-xs">Скоро</span>
      </DropdownMenuItem>
      <DropdownMenuItem disabled>
        <Plug />
        MCP-серверы
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

/**
 * Пилюля композера, как в продукте: «+», поле, модель, отправка. `top` — что лежит в пилюле над строкой ввода,
 * `inline` — что стоит в самой строке перед текстом. Отправка ждёт загрузки, но не блокируется ею.
 */
/** Черновик композера: текст, скрытый выбор файлов, отправка (ждёт загрузки, но не блокируется ею). */
export const useComposer = (minHeight = 0) => {
  const { draft, items, send, addFiles } = useEngine();
  const { model, setModel } = useProto();
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const sendable = draft.some((id) => items[id]?.status !== "error") || text.trim().length > 0;
  const uploading = draft.filter((id) => items[id]?.status === "uploading").length;
  const order = ["yes", "no", "unknown"] as const;
  const submit = () => {
    if (!sendable) return;
    send(text);
    setText("");
    area.current?.focus();
  };
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(minHeight, Math.min(el.scrollHeight, 200))}px`;
  }, [text, minHeight]);
  const fileInput = (
    <input
      className="hidden"
      multiple
      onChange={(e) => {
        addFiles([...(e.target.files ?? [])]);
        e.target.value = "";
      }}
      ref={input}
      type="file"
    />
  );
  return {
    area,
    cycleModel: () => setModel(order[(order.indexOf(model) + 1) % order.length]),
    fileInput,
    model,
    pickFiles: () => input.current?.click(),
    sendable,
    setText,
    submit,
    text,
    uploading,
  };
};

export const ModelButton = ({ onClick }: { onClick: () => void }) => {
  const { model, phone } = useProto();
  return (
    <button
      className="text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-2.5 text-sm [transition:background-color_150ms_ease,color_150ms_ease]"
      onClick={onClick}
      title="Сменить модель (в прототипе — по кругу)"
      type="button"
    >
      <span className={cn("truncate", phone ? "max-w-24" : "max-w-44")}>{MODELS[model].label}</span>
      <ChevronDown className="size-3.5" />
    </button>
  );
};

export const SendButton = ({ sendable, uploading }: { sendable: boolean; uploading: number }) => (
  <button
    aria-disabled={!sendable}
    aria-label={uploading > 0 ? "Отправить, когда файлы загрузятся" : "Отправить"}
    className={cn(
      "bg-primary text-primary-foreground inline-flex size-9 shrink-0 items-center justify-center rounded-full active:scale-[0.97]",
      "[transition:scale_160ms_cubic-bezier(0.23,1,0.32,1),opacity_150ms_ease]",
      !sendable && "opacity-40"
    )}
    title={uploading > 0 ? "Отправится, когда файлы загрузятся" : "Отправить"}
    type="submit"
  >
    <svg aria-hidden className="size-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 24 24">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  </button>
);

export const Pill = ({ top, inline, below }: { top?: React.ReactNode; inline?: React.ReactNode; below?: React.ReactNode }) => {
  const c = useComposer();
  const { area, text, setText, submit, sendable, uploading } = c;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {c.fileInput}
      <div className="bg-muted/70 dark:bg-muted/40 border-border/70 focus-within:border-foreground/15 rounded-[24px] border p-1.5 [transition:border-color_200ms_ease]">
        {top}
        <div className="flex items-end gap-1">
          <AddMenu onFiles={c.pickFiles} />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 py-0.5">
            {inline}
            <textarea
              className="placeholder:text-muted-foreground min-h-8 min-w-[8rem] flex-1 resize-none bg-transparent px-2 py-1 text-sm leading-6 outline-none"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Спросите что-нибудь…"
              ref={area}
              rows={1}
              value={text}
            />
          </div>
          <ModelButton onClick={c.cycleModel} />
          <SendButton sendable={sendable} uploading={uploading} />
        </div>
      </div>
      {below}
    </form>
  );
};

// --- сцена -------------------------------------------------------------------------------------------------------

const Earlier = () => (
  <>
    <div className="bg-muted ml-auto w-fit max-w-[85%] rounded-2xl px-3.5 py-2 text-sm">
      Сверь, пожалуйста, суммы по счетам за сентябрь с выгрузкой из 1С.
    </div>
    <p className="text-sm leading-relaxed">
      Пришлите счета и выгрузку — сверю суммы и покажу расхождения. Подойдут PDF, Excel и скриншоты.
    </p>
  </>
);

/** Отправленное: текст и вложения варианта; пока файлы догружаются, сообщение ждёт их. */
const SentMessage = ({ text, ids, Files }: { text: string; ids: string[]; Files: SentFiles }) => {
  const { items } = useEngine();
  const list = ids.map((id) => items[id]).filter(Boolean);
  const waiting = list.filter((i) => i.status === "uploading").length;
  return (
    <div className="flex flex-col items-end gap-1.5">
      {list.length > 0 && <Files items={list} />}
      {text && <div className="bg-muted w-fit max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap">{text}</div>}
      {waiting > 0 && (
        <span className="text-muted-foreground animate-in fade-in text-xs duration-150">
          Отправится, когда загрузятся файлы: осталось {waiting}
        </span>
      )}
    </div>
  );
};

export type SentFiles = (props: { items: Item[] }) => React.ReactNode;

export const Stage = ({ composer, Files }: { composer: React.ReactNode; Files: SentFiles }) => {
  const { phone } = useProto();
  const { sent, addFiles } = useEngine();
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState<Item | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const depth = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  // Перетаскивание на весь экран чата и вставка скриншота.
  useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current += 1;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      addFiles([...(e.dataTransfer?.files ?? [])]);
    };
    const paste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length > 0) {
        e.preventDefault();
        addFiles(files);
      }
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    window.addEventListener("paste", paste);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
      window.removeEventListener("paste", paste);
    };
  }, [addFiles]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [sent.length]);

  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 1800);
    return () => clearTimeout(timer);
  }, [note]);

  const open = (item: Item) => {
    if (item.status !== "done") return;
    if (item.kind === "image" && item.preview) {
      setViewing(item);
      return;
    }
    if (!download(item)) setNote(`Скачается «${item.name}»`);
  };

  const body = (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div className={cn("mx-auto flex w-full max-w-3xl flex-col gap-5 pt-20 pb-6", phone ? "px-3" : "px-4")}>
          <Earlier />
          {sent.map((m) => (
            <SentMessage Files={Files} ids={m.ids} key={m.id} text={m.text} />
          ))}
          <div ref={bottom} />
        </div>
      </div>
      <div className={cn("mx-auto w-full max-w-3xl pb-4", phone ? "px-2" : "px-4")}>{composer}</div>
      <AnimatePresence>
        {dragging && (
          <motion.div
            animate={{ opacity: 1 }}
            className="bg-background/80 pointer-events-none absolute inset-2 z-40 grid place-items-center rounded-2xl border-2 border-dashed border-foreground/25 backdrop-blur-[2px]"
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            initial={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: EASE_OUT }}
          >
            <motion.div
              animate={{ opacity: 1, transform: "scale(1)" }}
              className="flex flex-col items-center gap-2 text-center"
              initial={{ opacity: 0, transform: reduce ? "scale(1)" : "scale(0.96)" }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
            >
              <Paperclip className="text-muted-foreground size-6" />
              <span className="text-sm font-medium">Отпустите, чтобы прикрепить</span>
              <span className="text-muted-foreground text-xs">Картинки, PDF, Word, Excel, CSV, текст — до 20 МБ</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {note && (
        <div className="bg-foreground text-background animate-in fade-in absolute bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full px-3 py-1.5 text-xs whitespace-nowrap duration-150">
          {note}
        </div>
      )}
    </div>
  );

  return (
    <ViewerCtx value={{ open }}>
      {phone ? (
        <div className="bg-background flex h-dvh items-center justify-center overflow-hidden p-3 pb-20">
          <div className="ring-border bg-background relative h-[760px] max-h-[calc(100dvh-7rem)] w-[390px] overflow-hidden rounded-[2rem] ring-1">
            {body}
          </div>
        </div>
      ) : (
        <div className="bg-background h-dvh overflow-hidden pb-14">{body}</div>
      )}
      <Dialog onOpenChange={(o) => !o && setViewing(null)} open={viewing !== null}>
        <DialogContent className="max-w-3xl p-2 sm:max-w-3xl">
          <DialogTitle className="sr-only">{viewing?.name}</DialogTitle>
          <DialogDescription className="sr-only">{viewing && meta(viewing)}</DialogDescription>
          {viewing?.preview && (
            // biome-ignore lint: the preview is a data/object URL
            <img alt={viewing.name} className="max-h-[75vh] w-full rounded-lg object-contain" src={viewing.preview} />
          )}
          <div className="text-muted-foreground flex items-center justify-between px-2 pb-1 text-xs">
            <span className="truncate">{viewing?.name}</span>
            <span>{viewing && meta(viewing)}</span>
          </div>
        </DialogContent>
      </Dialog>
    </ViewerCtx>
  );
};
