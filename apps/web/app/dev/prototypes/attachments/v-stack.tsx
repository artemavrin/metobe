"use client";

import { cn } from "@metobe/ui/lib/utils";
import { ChevronDown, EyeOff, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { fmtSize, visionNote } from "./data";
import type { Item } from "./data";
import { useEngine } from "./engine";
import { RemoveButton, StatusLine, VisionNote } from "./parts";
import { Pill, Stage, Thumb, useAppear, useViewer } from "./stage";
import { useProto } from "./state";

// «Стопка»: все файлы — один свёрнутый блок: веер превью, «3 файла · 2,1 МБ» и сводка — сколько грузится, сколько с
// ошибкой. Раскрывается списком (высота ограничена, дальше прокрутка). Композер растёт на одну строку, сколько бы
// файлов ни было. В сообщении — тот же свёрнутый блок.

const filesWord = (n: number) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "файл";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "файла";
  return "файлов";
};

/** Веер из трёх превью — по нему видно, что внутри, не раскрывая. */
const Fan = ({ list }: { list: Item[] }) => (
  <span className="flex shrink-0 items-center">
    {list.slice(0, 3).map((item, i) => (
      <span className={cn("bg-background ring-background rounded-md ring-2", i > 0 && "-ml-3")} key={item.id} style={{ zIndex: 3 - i }}>
        <Thumb className="size-8" item={item} />
      </span>
    ))}
  </span>
);

const Summary = ({ list }: { list: Item[] }) => {
  const { model, slot } = useProto();
  const uploading = list.filter((i) => i.status === "uploading");
  const failed = list.filter((i) => i.status === "error").length;
  // Размер того, что уйдёт: отклонённые (больше лимита, чужой тип) не в счёт.
  const size = list.filter((i) => i.problem !== "too-big" && i.problem !== "type").reduce((s, i) => s + i.size, 0);
  const progress = uploading.length ? uploading.reduce((s, i) => s + i.progress, 0) / uploading.length : 1;
  const unseen = list.some((i) => i.kind === "image" && i.status === "done") ? visionNote(model, slot) : null;
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
      <span className="truncate text-xs font-medium leading-4">
        {list.length} {filesWord(list.length)} <span className="text-muted-foreground font-normal">· {fmtSize(size)}</span>
      </span>
      <span className="flex min-w-0 items-center gap-2 text-[11px] leading-4">
        {uploading.length > 0 && (
          <span className="text-muted-foreground flex items-center gap-1.5">
            <span className="bg-foreground/10 block h-0.5 w-14 overflow-hidden rounded-full">
              <span className="bg-foreground/60 block h-full origin-left transition-transform duration-150 ease-linear" style={{ transform: `scaleX(${progress})` }} />
            </span>
            загружается {uploading.length}
          </span>
        )}
        {failed > 0 && (
          <span className="text-destructive flex items-center gap-1">
            <TriangleAlert className="size-3" /> с ошибкой {failed}
          </span>
        )}
        {uploading.length === 0 && failed === 0 && !unseen && <span className="text-muted-foreground">готово</span>}
        {uploading.length === 0 && unseen && (
          <span className="text-muted-foreground flex min-w-0 items-center gap-1">
            <EyeOff className="size-3 shrink-0" />
            <span className="truncate">{unseen}</span>
          </span>
        )}
      </span>
    </span>
  );
};

const Row = ({ item, removable }: { item: Item; removable: boolean }) => {
  const { open } = useViewer();
  return (
    <div className="hover:bg-foreground/[0.04] flex items-center gap-2.5 rounded-lg px-1.5 py-1 [transition:background-color_150ms_ease]">
      <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => open(item)} type="button">
        <Thumb className={cn("size-8", item.status === "error" && "opacity-50")} item={item} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-xs leading-4">{item.name}</span>
          {item.status === "done" && item.kind === "image" ? <VisionNote item={item} /> : null}
          {!(item.status === "done" && item.kind === "image") && <StatusLine item={item} />}
        </span>
      </button>
      {removable && <RemoveButton item={item} />}
    </div>
  );
};

const Stack = ({ list, removable }: { list: Item[]; removable: boolean }) => {
  const [open, setOpen] = useState(false);
  const appear = useAppear();
  if (list.length === 0) return null;
  return (
    <div className={cn("rounded-xl", removable ? "mx-1 mt-1 mb-0.5" : "bg-background ring-border/80 w-80 max-w-full ring-1")}>
      <button
        aria-expanded={open}
        className="hover:bg-foreground/[0.04] flex w-full items-center gap-2.5 rounded-xl p-1.5 [transition:background-color_150ms_ease]"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <Fan list={list} />
        <Summary list={list} />
        <ChevronDown className={cn("text-muted-foreground mr-1 size-4 shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none", open && "rotate-180")} />
      </button>
      {/* Раскрытие — grid-rows 0fr→1fr: высота следует содержимому, без замеров */}
      <div className={cn("grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="min-h-0 overflow-hidden">
          <div className="no-scrollbar flex max-h-52 flex-col gap-0.5 overflow-y-auto px-0.5 pb-1">
            <AnimatePresence initial={false}>
              {list.map((item) => (
                <motion.div key={item.id} layout="position" {...appear}>
                  <Row item={item} removable={removable} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};

const StackComposer = () => {
  const { draft, items } = useEngine();
  return <Pill top={<Stack list={draft.map((id) => items[id])} removable />} />;
};

const SentFiles = ({ items }: { items: Item[] }) => <Stack list={items} removable={false} />;

export const StackVariant = () => <Stage Files={SentFiles} composer={<StackComposer />} />;
