"use client";

import { cn } from "@metobe/ui/lib/utils";
import { RotateCw, TriangleAlert, Undo2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";

import { PROBLEM_TEXT } from "../attachments/data";
import { KindBadge, Thumb, useAppear } from "../attachments/stage";
import { ACCEPT, fmtSize, meta } from "./data";
import type { Draft } from "./engine";
import { useEngine } from "./engine";

// Общие части вариантов: чипы и плитки файлов (те же значки и превью, что у вложений), призрак убранного файла, поле
// ввода, растущее по тексту, скрытый выбор файлов.

export const usePicker = () => {
  const { addFiles } = useEngine();
  const input = useRef<HTMLInputElement>(null);
  return {
    input: (
      <input
        accept={ACCEPT.map((e) => `.${e}`).join(",")}
        className="hidden"
        multiple
        onChange={(e) => {
          addFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
        ref={input}
        tabIndex={-1}
        type="file"
      />
    ),
    open: () => input.current?.click(),
  };
};

/** Enter отправляет, Shift+Enter — перенос, Esc — отмена; во время ввода через IME Enter не трогаем. */
export const editKeys = (send: () => void, cancel: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
    e.preventDefault();
    send();
  } else if (e.key === "Escape") {
    e.preventDefault();
    cancel();
  }
};

/** Поле, растущее по тексту до `max` пикселей; курсор — в конце при входе в правку. */
export const AutoText = ({
  value,
  onChange,
  onKeyDown,
  className,
  max = 320,
  min,
  label = "Правка сообщения",
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  className?: string;
  max?: number;
  min?: number;
  label?: string;
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(max, Math.max(min ?? 0, el.scrollHeight))}px`;
  }, [value, max, min]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  return (
    <textarea
      aria-label={label}
      className={cn("w-full resize-none bg-transparent leading-6 outline-none", className)}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      ref={ref}
      rows={1}
      value={value}
    />
  );
};

const Bar = ({ value }: { value: number }) => (
  <span className="absolute inset-x-0 bottom-0 h-[2px]">
    <span className="bg-foreground/50 block h-full origin-left transition-transform duration-150 ease-linear" style={{ transform: `scaleX(${value})` }} />
  </span>
);

/** Чип файла, как в композере: значок или превью, имя; по наведению (мышь) значок становится ×, на касании × стоит справа. */
export const Chip = ({ item, onRemove, onRetry }: { item: Draft; onRemove?: () => void; onRetry?: () => void }) => {
  const failed = item.status === "error";
  return (
    <span
      className={cn(
        "group/chip bg-background relative inline-flex h-8 max-w-64 shrink-0 items-center gap-2 overflow-hidden rounded-lg px-2.5 text-[13px] ring-1",
        failed ? "text-destructive ring-destructive/40" : "ring-border",
        item.status === "uploading" && "text-foreground/60"
      )}
      title={failed && item.problem ? PROBLEM_TEXT[item.problem] : meta(item)}
    >
      <span className="relative grid size-4 shrink-0 place-items-center">
        <span className={cn(onRemove && "[@media(hover:hover)]:group-hover/chip:opacity-0 [transition:opacity_120ms_ease]")}>
          {failed ? <TriangleAlert className="text-destructive size-4" strokeWidth={1.75} /> : <Thumb className="size-4" item={item} />}
        </span>
        {onRemove && (
          <button
            aria-label={`Убрать «${item.name}»`}
            className="text-muted-foreground hover:text-foreground absolute inset-0 hidden place-items-center rounded-sm opacity-0 [@media(hover:hover)]:grid [@media(hover:hover)]:group-hover/chip:opacity-100 focus-visible:opacity-100 [transition:opacity_120ms_ease]"
            onClick={onRemove}
            type="button"
          >
            <X className="size-3.5" strokeWidth={2} />
          </button>
        )}
      </span>
      <span className="truncate">{item.name}</span>
      {failed && item.problem === "network" && onRetry && (
        <button className="hover:bg-foreground/[0.06] -mr-1 inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs" onClick={onRetry} type="button">
          <RotateCw className="size-3" /> Повторить
        </button>
      )}
      {failed && item.problem !== "network" && item.problem && <span className="text-destructive/80 shrink-0 text-xs">{PROBLEM_TEXT[item.problem]}</span>}
      {onRemove && (
        <button
          aria-label={`Убрать «${item.name}»`}
          className="text-muted-foreground -mr-1 grid size-5 shrink-0 place-items-center rounded-full [@media(hover:hover)]:hidden"
          onClick={onRemove}
          type="button"
        >
          <X className="size-3.5" />
        </button>
      )}
      {item.status === "uploading" && <Bar value={item.progress} />}
    </span>
  );
};

/** Убранный старый файл: остаётся на месте, зачёркнут, возвращается одним нажатием. */
export const Ghost = ({ item, onRestore }: { item: Draft; onRestore: () => void }) => (
  <span className="text-muted-foreground ring-border/70 inline-flex h-8 max-w-64 shrink-0 items-center gap-2 rounded-lg px-2.5 text-[13px] ring-1 ring-dashed">
    <Thumb className="size-4 opacity-50 grayscale" item={item} />
    <span className="truncate line-through decoration-1">{item.name}</span>
    <button
      className="text-foreground hover:bg-foreground/[0.06] -mr-1 inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs [transition:background-color_150ms_ease]"
      onClick={onRestore}
      type="button"
    >
      <Undo2 className="size-3" /> Вернуть
    </button>
  </span>
);

/** Плитка файла: крупное превью или значок на всю ширину, имя и сведения, × в углу. */
export const Tile = ({ item, onRemove, onRetry }: { item: Draft; onRemove: () => void; onRetry: () => void }) => {
  const failed = item.status === "error";
  return (
    <div className={cn("bg-background group/tile relative flex flex-col overflow-hidden rounded-xl ring-1", failed ? "ring-destructive/40" : "ring-border")}>
      <div className="bg-muted/60 relative grid aspect-[16/10] place-items-center overflow-hidden">
        {item.kind === "image" && item.preview && !failed ? (
          // biome-ignore lint: the preview is a data/object URL
          <img alt="" className="size-full object-cover" src={item.preview} />
        ) : failed ? (
          <TriangleAlert className="text-destructive size-6" strokeWidth={1.5} />
        ) : (
          <KindBadge className="size-11 rounded-xl" item={item} />
        )}
        {item.status === "uploading" && <Bar value={item.progress} />}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
        <span className="truncate text-[13px] leading-4">{item.name}</span>
        <span className={cn("truncate text-xs", failed ? "text-destructive" : "text-muted-foreground")}>
          {failed && item.problem ? PROBLEM_TEXT[item.problem] : item.status === "uploading" ? `Загрузка… ${Math.round(item.progress * 100)} %` : `${meta(item)}`}
        </span>
      </div>
      {failed && item.problem === "network" && (
        <button className="text-foreground absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs hover:bg-foreground/[0.06]" onClick={onRetry} type="button">
          <RotateCw className="size-3" /> Повторить
        </button>
      )}
      <button
        aria-label={`Убрать «${item.name}»`}
        className="bg-background/90 text-foreground ring-border hover:bg-background absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full ring-1 backdrop-blur-sm [transition:background-color_150ms_ease,transform_160ms_cubic-bezier(0.23,1,0.32,1)] active:scale-95"
        onClick={onRemove}
        type="button"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
};

/** Ряд чипов с появлением и уходом; убранные старые — призраками, если `ghosts`. */
export const ChipRow = ({ ghosts = false, nowrap = false, className }: { ghosts?: boolean; nowrap?: boolean; className?: string }) => {
  const { items, remove, restore, retry } = useEngine();
  const appear = useAppear();
  const list = ghosts ? items : items.filter((i) => !i.removed);
  return (
    <div className={cn("flex items-center gap-1.5", nowrap ? "no-scrollbar overflow-x-auto" : "flex-wrap", className)}>
      <AnimatePresence initial={false} mode="popLayout">
        {list.map((item) => (
          <motion.div className="shrink-0" key={item.id} layout="position" {...appear}>
            {item.removed ? <Ghost item={item} onRestore={() => restore(item.id)} /> : <Chip item={item} onRemove={() => remove(item.id)} onRetry={() => retry(item.id)} />}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

/** Общий размер файлов правки: «3 файла · 1,6 МБ». */
export const totals = (items: Draft[]) => {
  const live = items.filter((i) => !i.removed && i.status !== "error");
  const bytes = live.reduce((n, i) => n + i.size, 0);
  const n = live.length;
  const m10 = n % 10;
  const m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? "файл" : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "файла" : "файлов";
  return n === 0 ? "Без файлов" : `${n} ${word} · ${fmtSize(bytes)}`;
};
