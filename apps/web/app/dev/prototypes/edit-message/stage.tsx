"use client";

import { cn } from "@metobe/ui/lib/utils";
import { Paperclip, Pencil, Plus } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { EASE_OUT } from "../attachments/stage";
import type { Turn } from "./engine";
import { useEngine } from "./engine";
import { Chip } from "./parts";
import { useProto } from "./state";

// Сцена: страница чата — прошлый обмен, правимое сообщение, то, что шло после него, и композер внизу. Вариант говорит,
// чем заменить сообщение на время правки (`editor`), что стоит в композере, гаснут ли реплики после сообщения и что
// подписать под ним. Файлы в правку попадают скрепкой, перетаскиванием на весь экран и вставкой ⌘V.

export interface StageSlots {
  /** Чем заменить сообщение на время правки; без него сообщение остаётся в ленте, а правят в другом месте. */
  editor?: (turn: Turn) => React.ReactNode;
  /** Свой композер (он же и правка); без него — обычный, пустой. */
  composer?: React.ReactNode;
  /** Реплики после сообщения гаснут, пока идёт правка. */
  dimTail?: boolean;
  /** Подпись между правимым сообщением и тем, что за ним. */
  note?: React.ReactNode;
  /** Выделить правимое сообщение, пока оно остаётся в ленте. */
  mark?: boolean;
  /** Поверх сцены (лист). */
  overlay?: React.ReactNode;
}

/** Отправленное сообщение: файлы, пузырь, под ним — карандаш (по наведению; на касании всегда). */
export const SentMessage = ({ turn, mark }: { turn: Turn; mark?: boolean }) => {
  const { start, editing, turns } = useEngine();
  const busy = turns.at(-1)?.live !== undefined;
  return (
    <div className="group/msg flex flex-col items-end gap-1.5">
      {turn.files.length > 0 && (
        <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5 p-px">
          {turn.files.map((f) => (
            <Chip item={f} key={f.id} />
          ))}
        </div>
      )}
      {turn.text && (
        <div
          className={cn(
            "bg-muted w-fit max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap [transition:box-shadow_200ms_ease]",
            mark && "ring-foreground/25 ring-2 ring-offset-2 ring-offset-background"
          )}
        >
          {turn.text}
        </div>
      )}
      <div className="text-muted-foreground flex h-6 items-center gap-1 text-xs opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/msg:opacity-100 [@media(hover:hover)]:group-hover/msg:opacity-100 [transition:opacity_150ms_ease]">
        <span className="px-1">только что</span>
        <button
          aria-label="Изменить сообщение"
          className="hover:bg-muted hover:text-foreground grid size-6 place-items-center rounded-md [transition:background-color_150ms_ease] disabled:pointer-events-none disabled:opacity-40"
          disabled={busy || (editing !== null && editing !== turn.id)}
          onClick={() => start(turn.id)}
          type="button"
        >
          <Pencil className="size-3.5" />
        </button>
      </div>
    </div>
  );
};

const AssistantTurn = ({ turn, dim }: { turn: Turn; dim: boolean }) => (
  <div className={cn("text-sm leading-relaxed [transition:opacity_200ms_ease]", dim && "opacity-35")}>
    {turn.live === "preparing" ? <span className="text-muted-foreground animate-pulse">Готовит ответ…</span> : turn.text}
  </div>
);

/** Обычный композер: пустое поле, как оно выглядит, пока правят не в нём. */
export const IdlePill = () => (
  <div className="bg-muted/70 dark:bg-muted/40 border-border/70 flex items-end gap-1 rounded-[24px] border p-1.5">
    <span className="text-muted-foreground grid size-8 shrink-0 place-items-center">
      <Plus className="size-4" />
    </span>
    <span className="text-muted-foreground min-h-8 flex-1 px-2 py-1 text-sm leading-6">Спросите что-нибудь…</span>
  </div>
);

export const Stage = ({ editor, composer, dimTail = false, note, mark = false, overlay }: StageSlots) => {
  const { phone } = useProto();
  const { turns, editing, editIndex, addFiles } = useEngine();
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  // Перетаскивание на весь экран и вставка работают, пока идёт правка.
  useEffect(() => {
    if (!editing) return;
    const has = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!has(e)) return;
      depth.current += 1;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!has(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const over = (e: DragEvent) => has(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!has(e)) return;
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
  }, [editing, addFiles]);

  // Новый ответ или вход в правку — ленту к концу.
  const last = turns.at(-1)?.text.length ?? 0;
  useEffect(() => {
    if (!editing) bottom.current?.scrollIntoView({ block: "end" });
  }, [turns.length, last, editing]);

  const body = (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div className={cn("mx-auto flex w-full max-w-3xl flex-col gap-5 pt-16 pb-6", phone ? "px-3" : "px-4")}>
          {turns.map((turn, i) => {
            const tail = editing !== null && i > editIndex && dimTail;
            if (turn.role === "assistant") return <AssistantTurn dim={tail} key={turn.id} turn={turn} />;
            const isEdited = turn.id === editing;
            if (!isEdited) {
              return (
                <div className={cn("[transition:opacity_200ms_ease]", tail && "opacity-35")} key={turn.id}>
                  <SentMessage turn={turn} />
                </div>
              );
            }
            return (
              <div className="flex flex-col gap-3" key={turn.id}>
                {editor ? editor(turn) : <SentMessage mark={mark} turn={turn} />}
                {note}
              </div>
            );
          })}
          <div ref={bottom} />
        </div>
      </div>
      <div className={cn("mx-auto w-full max-w-3xl pb-4", phone ? "px-2" : "px-4")}>{composer ?? <IdlePill />}</div>
      <AnimatePresence>
        {dragging && (
          <motion.div
            animate={{ opacity: 1 }}
            className="bg-background/80 border-foreground/25 pointer-events-none absolute inset-2 z-40 grid place-items-center rounded-2xl border-2 border-dashed backdrop-blur-[2px]"
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
              <span className="text-muted-foreground text-xs">Картинки, PDF, Word, Excel и текстовые файлы — до 20 МБ</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {overlay}
    </div>
  );

  return phone ? (
    <div className="bg-background flex h-dvh items-center justify-center overflow-hidden p-3 pb-20">
      <div className="ring-border bg-background relative h-[760px] max-h-[calc(100dvh-7rem)] w-[390px] overflow-hidden rounded-[2rem] ring-1">{body}</div>
    </div>
  ) : (
    <div className="bg-background h-dvh overflow-hidden pb-14">{body}</div>
  );
};
