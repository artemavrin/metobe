"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { ChartNoAxesColumn, EyeOff, File, FileText, FileType, ImageIcon, RotateCw, TriangleAlert, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { PROBLEM_TEXT, meta } from "./data";
import type { Item, Kind } from "./data";
import { useEngine } from "./engine";
import { useVisionNote } from "./parts";
import { Pill, Stage, useAppear, useViewer } from "./stage";

// «Полка» (по референсу): в нашей пилюле композера сверху встаёт полка светлых чипов — значок типа и полное имя. Полка — одна строка: лишнее уезжает вправо под гаснущий
// край, высота не растёт с числом файлов. Значок чипа по наведению становится ×; загрузка — тонкая черта по низу чипа.

const ICON: Record<Kind, typeof File> = {
  doc: FileType,
  image: ImageIcon,
  other: File,
  pdf: FileText,
  sheet: ChartNoAxesColumn,
  text: FileText,
};

/** Значок слева: превью картинки или значок типа; по наведению (мышь) — ×, на касание × стоит отдельно справа. */
const Lead = ({ item, removable }: { item: Item; removable: boolean }) => {
  const { remove } = useEngine();
  const Icon = item.status === "error" ? TriangleAlert : ICON[item.kind];
  const glyph =
    item.kind === "image" && item.preview && item.status !== "error" ? (
      // biome-ignore lint: the preview is a data/object URL
      <img alt="" className="size-4 rounded-[4px] object-cover" src={item.preview} />
    ) : (
      <Icon className={cn("size-4", item.status === "error" ? "text-destructive" : "text-foreground/70")} strokeWidth={1.75} />
    );
  if (!removable) return <span className="grid size-4 shrink-0 place-items-center">{glyph}</span>;
  return (
    <span className="relative grid size-4 shrink-0 place-items-center">
      <span className="[@media(hover:hover)]:group-hover/chip:opacity-0 [transition:opacity_120ms_ease]">{glyph}</span>
      <button
        aria-label={`Убрать «${item.name}»`}
        className="text-muted-foreground hover:text-foreground absolute inset-0 hidden place-items-center rounded-sm opacity-0 [@media(hover:hover)]:grid [@media(hover:hover)]:group-hover/chip:opacity-100 focus-visible:opacity-100 [transition:opacity_120ms_ease]"
        onClick={(e) => {
          e.stopPropagation();
          remove(item.id);
        }}
        type="button"
      >
        <X className="size-3.5" strokeWidth={2} />
      </button>
    </span>
  );
};

const Chip = ({ item, removable }: { item: Item; removable: boolean }) => {
  const { remove, retry } = useEngine();
  const { open } = useViewer();
  const note = useVisionNote(item);
  const failed = item.status === "error";
  const hint = failed && item.problem ? PROBLEM_TEXT[item.problem] : (note ?? meta(item));
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "group/chip bg-background relative inline-flex h-8 max-w-64 shrink-0 items-center gap-2 overflow-hidden rounded-lg px-2.5 text-[13px] ring-1",
              failed ? "ring-destructive/40 text-destructive" : "ring-border",
              item.status === "uploading" && "text-foreground/60",
              !removable && item.status === "done" && "cursor-pointer hover:bg-muted/50 [transition:background-color_150ms_ease]"
            )}
            onClick={!removable ? () => open(item) : undefined}
          />
        }
      >
        <Lead item={item} removable={removable} />
        <span className="truncate">{item.name}</span>
        {note && item.status === "done" && <EyeOff aria-label={note} className="text-muted-foreground size-3.5 shrink-0" strokeWidth={1.75} />}
        {removable && failed && item.problem === "network" && (
          <button
            className="text-foreground hover:bg-foreground/[0.06] -mr-1 inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs [transition:background-color_150ms_ease]"
            onClick={() => retry(item.id)}
            type="button"
          >
            <RotateCw className="size-3" /> Повторить
          </button>
        )}
        {removable && (
          // На касание наведения нет — × стоит справа всегда.
          <button
            aria-label={`Убрать «${item.name}»`}
            className="text-muted-foreground -mr-1 grid size-5 shrink-0 place-items-center rounded-full [@media(hover:hover)]:hidden"
            onClick={() => remove(item.id)}
            type="button"
          >
            <X className="size-3.5" />
          </button>
        )}
        {item.status === "uploading" && (
          <span className="absolute inset-x-0 bottom-0 h-[2px]">
            <span
              className="bg-foreground/50 block h-full origin-left transition-transform duration-150 ease-linear"
              style={{ transform: `scaleX(${item.progress})` }}
            />
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent side="top">{hint}</TooltipContent>
    </Tooltip>
  );
};

/** Одна строка чипов; гаснет тот край, за которым ещё есть файлы. */
const Shelf = ({ list, removable }: { list: Item[]; removable: boolean }) => {
  const appear = useAppear();
  const row = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const count = list.length;
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const update = () => setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [count]);
  const mask = `linear-gradient(to right, ${edges.left ? "transparent, black 20px" : "black"}, ${edges.right ? "black calc(100% - 20px), transparent" : "black"})`;
  return (
    <div
      className={cn("flex items-center gap-1.5", removable ? "no-scrollbar overflow-x-auto px-1 pt-1 pb-1.5" : "flex-wrap justify-end p-px")}
      ref={row}
      style={removable ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {list.map((item) => (
          <motion.div className="shrink-0" key={item.id} layout="position" {...appear}>
            <Chip item={item} removable={removable} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

/** Композер как в продукте — та же пилюля; полка встаёт в неё сверху и раскрывается по высоте один раз (grid-rows, 200 мс). */
const ShelfComposer = () => {
  const { draft, items } = useEngine();
  const list = draft.map((id) => items[id]);
  return (
    <Pill
      top={
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
            list.length > 0 ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <Shelf list={list} removable />
          </div>
        </div>
      }
    />
  );
};

const SentFiles = ({ items }: { items: Item[] }) => (
  <div className="max-w-[85%]">
    <Shelf list={items} removable={false} />
  </div>
);

export const ShelfVariant = () => <Stage Files={SentFiles} composer={<ShelfComposer />} />;
