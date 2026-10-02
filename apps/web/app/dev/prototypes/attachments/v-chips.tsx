"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@metobe/ui/components/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@metobe/ui/components/tooltip";
import { cn } from "@metobe/ui/lib/utils";
import { EyeOff, RotateCw, TriangleAlert, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { PROBLEM_TEXT, meta } from "./data";
import type { Item } from "./data";
import { useEngine } from "./engine";
import { RemoveButton, StatusLine, VisionNote, useVisionNote } from "./parts";
import { Pill, Stage, Thumb, useAppear, useViewer } from "./stage";

// «Чипы в строке»: файл — компактный чип прямо в строке ввода, рядом с текстом, как упоминание `@`. Наведение —
// превью и подробности. Больше трёх — последние сворачиваются в «ещё N», список открывается поверх: строка ввода не
// растёт от числа файлов. В сообщении — те же чипы над текстом.

const VISIBLE = 3;

/** Кольцо загрузки вместо значка, пока файл едет. */
const Ring = ({ value }: { value: number }) => (
  <svg aria-hidden className="size-4 -rotate-90" viewBox="0 0 20 20">
    <circle className="stroke-foreground/15" cx="10" cy="10" fill="none" r="8" strokeWidth="2.5" />
    <circle
      className="stroke-foreground/70 transition-[stroke-dashoffset] duration-150 ease-linear"
      cx="10"
      cy="10"
      fill="none"
      r="8"
      strokeDasharray={50.27}
      strokeDashoffset={50.27 * (1 - value)}
      strokeLinecap="round"
      strokeWidth="2.5"
    />
  </svg>
);

const short = (name: string) => {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  return base.length > 14 ? `${base.slice(0, 12).trimEnd()}…${ext}` : name;
};

/** Подробности по наведению: превью картинки, имя, тип и размер, состояние и пометка о зрении. */
const Details = ({ item }: { item: Item }) => (
  <div className="flex w-60 flex-col gap-2">
    {item.kind === "image" && item.preview && (
      // biome-ignore lint: the preview is a data/object URL
      <img alt="" className="max-h-36 w-full rounded-md object-cover" src={item.preview} />
    )}
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium break-words">{item.name}</span>
      <span className="text-muted-foreground text-[11px]">{meta(item)}</span>
    </div>
    {item.status === "error" && item.problem && <span className="text-destructive text-[11px]">{PROBLEM_TEXT[item.problem]}</span>}
    <VisionNote item={item} />
  </div>
);

const Chip = ({ item, removable }: { item: Item; removable: boolean }) => {
  const { remove, retry } = useEngine();
  const { open } = useViewer();
  const note = useVisionNote(item);
  const failed = item.status === "error";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "bg-background ring-border/80 inline-flex h-7 max-w-full items-center gap-1.5 rounded-full py-0.5 pr-1 pl-1 text-xs ring-1",
              failed && "ring-destructive/40 text-destructive",
              !removable && "cursor-pointer hover:bg-muted/60 [transition:background-color_150ms_ease]"
            )}
            onClick={removable ? undefined : () => open(item)}
          />
        }
      >
        {item.status === "uploading" ? (
          <Ring value={item.progress} />
        ) : failed ? (
          <TriangleAlert className="size-4 p-0.5" />
        ) : (
          <Thumb className="size-5 rounded-full" item={item} />
        )}
        <span className="truncate">{short(item.name)}</span>
        {note && item.status === "done" && <EyeOff aria-label={note} className="text-muted-foreground size-3 shrink-0" />}
        {removable && failed && item.problem === "network" && (
          <button
            aria-label="Повторить загрузку"
            className="hover:text-foreground grid size-5 place-items-center rounded-full"
            onClick={() => retry(item.id)}
            type="button"
          >
            <RotateCw className="size-3" />
          </button>
        )}
        {removable && (
          <button
            aria-label={`Убрать «${item.name}»`}
            className="text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] grid size-5 place-items-center rounded-full [transition:background-color_150ms_ease,color_150ms_ease]"
            onClick={() => remove(item.id)}
            type="button"
          >
            <X className="size-3" />
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent className="bg-popover text-popover-foreground ring-border p-2.5 ring-1" side="top">
        <Details item={item} />
      </TooltipContent>
    </Tooltip>
  );
};

/** «ещё N»: список остальных поверх, с теми же действиями. Ошибка среди скрытых красит сам счётчик. */
const More = ({ list, removable }: { list: Item[]; removable: boolean }) => {
  const { open } = useViewer();
  const failed = list.some((i) => i.status === "error");
  const uploading = list.some((i) => i.status === "uploading");
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            className={cn(
              "bg-background ring-border/80 hover:bg-muted/60 inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs ring-1 [transition:background-color_150ms_ease]",
              failed && "ring-destructive/40 text-destructive"
            )}
            type="button"
          />
        }
      >
        ещё {list.length}
        {uploading && <span className="bg-foreground/50 size-1.5 animate-pulse rounded-full motion-reduce:animate-none" />}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1.5" side="top">
        <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {list.map((item) => (
            <div className="hover:bg-muted/60 flex items-center gap-2.5 rounded-lg p-1.5" key={item.id}>
              <button className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => open(item)} type="button">
                <Thumb className="size-8" item={item} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-xs font-medium">{item.name}</span>
                  <StatusLine item={item} />
                </span>
              </button>
              {removable && <RemoveButton item={item} />}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const Chips = ({ list, removable }: { list: Item[]; removable: boolean }) => {
  const appear = useAppear();
  const shown = list.slice(0, VISIBLE);
  const rest = list.slice(VISIBLE);
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {shown.map((item) => (
        <motion.span className="inline-flex max-w-full" key={item.id} layout="position" {...appear}>
          <Chip item={item} removable={removable} />
        </motion.span>
      ))}
      {rest.length > 0 && (
        <motion.span className="inline-flex" key="more" layout="position" {...appear}>
          <More list={rest} removable={removable} />
        </motion.span>
      )}
    </AnimatePresence>
  );
};

const SentFiles = ({ items }: { items: Item[] }) => (
  <div className="flex max-w-[85%] flex-wrap justify-end gap-1">
    <Chips list={items} removable={false} />
  </div>
);

const ChipsComposer = () => {
  const { draft, items } = useEngine();
  return <Pill inline={<Chips list={draft.map((id) => items[id])} removable />} />;
};

export const ChipsVariant = () => <Stage Files={SentFiles} composer={<ChipsComposer />} />;
