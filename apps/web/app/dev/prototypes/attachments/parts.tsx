"use client";

import { cn } from "@metobe/ui/lib/utils";
import { EyeOff, RotateCw, TriangleAlert, X } from "lucide-react";

import { PROBLEM_TEXT, meta, visionNote } from "./data";
import type { Item } from "./data";
import { useEngine } from "./engine";
import { Progress } from "./stage";
import { useProto } from "./state";

// Общие кусочки вариантов: строка состояния файла, пометка о зрении модели, кнопки «убрать» и «повторить».

/** Пометка для картинки, если модель её не увидит сама (D33); null — пометка не нужна. */
export const useVisionNote = (item: Item) => {
  const { model, slot } = useProto();
  return item.kind === "image" ? visionNote(model, slot) : null;
};

export const VisionNote = ({ item, className }: { item: Item; className?: string }) => {
  const note = useVisionNote(item);
  if (!note) return null;
  return (
    <span className={cn("text-muted-foreground inline-flex min-w-0 items-center gap-1 text-[11px] leading-4", className)}>
      <EyeOff className="size-3 shrink-0 opacity-70" />
      <span className="truncate">{note}</span>
    </span>
  );
};

/** Вторая строка файла: прогресс, ошибка с «повторить» или тип · страницы · размер. */
export const StatusLine = ({ item, className }: { item: Item; className?: string }) => {
  const { retry } = useEngine();
  if (item.status === "uploading") {
    return (
      <span className={cn("flex items-center gap-2", className)}>
        <Progress className="flex-1" value={item.progress} />
        <span className="text-muted-foreground w-8 text-right text-[11px] tabular-nums">{Math.round(item.progress * 100)}%</span>
      </span>
    );
  }
  if (item.status === "error" && item.problem) {
    return (
      <span className={cn("text-destructive flex min-w-0 items-center gap-1 text-[11px] leading-4", className)}>
        <TriangleAlert className="size-3 shrink-0" />
        <span className="truncate">{PROBLEM_TEXT[item.problem]}</span>
        {item.problem === "network" && (
          <button
            className="text-foreground ml-auto inline-flex shrink-0 items-center gap-0.5 rounded px-1 hover:underline"
            onClick={() => retry(item.id)}
            type="button"
          >
            <RotateCw className="size-3" /> Повторить
          </button>
        )}
      </span>
    );
  }
  return <span className={cn("text-muted-foreground truncate text-[11px] leading-4", className)}>{meta(item)}</span>;
};

export const RemoveButton = ({ item, className }: { item: Item; className?: string }) => {
  const { remove } = useEngine();
  return (
    <button
      aria-label={`Убрать «${item.name}»`}
      className={cn(
        "bg-background/90 text-muted-foreground hover:text-foreground ring-border grid size-5 place-items-center rounded-full ring-1 active:scale-[0.97]",
        "[transition:scale_160ms_cubic-bezier(0.23,1,0.32,1),color_150ms_ease]",
        className
      )}
      onClick={() => remove(item.id)}
      title="Убрать"
      type="button"
    >
      <X className="size-3" />
    </button>
  );
};
