"use client";

import { Kbd } from "@metobe/ui/components/kbd";
import { cn } from "@metobe/ui/lib/utils";
import { ArrowUp, Paperclip, Pencil } from "lucide-react";

import { IdlePill, Stage } from "./stage";
import { useEngine } from "./engine";
import { AutoText, ChipRow, editKeys, usePicker } from "./parts";
import { useProto } from "./state";

// «В композере»: сообщение остаётся в ленте — подсвечено, а правят его в настоящем композере внизу: единственном
// месте, где вообще вводят текст. Над полем полоса «Правка сообщения · Esc», ряд файлов, скрепка. Всё, что шло после
// сообщения, гаснет — сразу видно, что уйдёт при отправке.

const EditPill = () => {
  const { editing, text, setText, send, cancel, items, pending } = useEngine();
  const { input, open } = usePicker();
  const { phone } = useProto();
  if (!editing) return <IdlePill />;
  const going = items.some((i) => !i.removed && i.status !== "error");
  const blocked = !text.trim() && !going;
  const keys = editKeys(send, cancel);
  return (
    <form
      className="animate-in fade-in slide-in-from-bottom-1 duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:animate-none"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      {input}
      <div className="bg-muted/70 dark:bg-muted/40 border-foreground/20 rounded-[24px] border p-1.5">
        <div className="text-muted-foreground flex items-center gap-2 px-2.5 pt-1 pb-1.5 text-xs">
          <Pencil className="size-3.5" />
          <span className="text-foreground font-medium">Правка сообщения</span>
          {!phone && <span className="truncate">ответы ниже будут заменены</span>}
          <button className="hover:text-foreground ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 [transition:color_150ms_ease]" onClick={cancel} type="button">
            Отмена {!phone && <Kbd>Esc</Kbd>}
          </button>
        </div>
        {items.length > 0 && <ChipRow className="px-1 pb-1.5" nowrap />}
        <div className="flex items-end gap-1">
          <button
            aria-label="Прикрепить файл"
            className="text-muted-foreground hover:text-foreground hover:bg-background/60 grid size-8 shrink-0 place-items-center rounded-full [transition:background-color_150ms_ease,color_150ms_ease,transform_160ms_cubic-bezier(0.23,1,0.32,1)] active:scale-95"
            onClick={open}
            type="button"
          >
            <Paperclip className="size-4" />
          </button>
          <div className="min-w-0 flex-1 py-0.5 text-sm">
            <AutoText className="px-2 py-1" max={200} onChange={setText} onKeyDown={keys} value={text} />
          </div>
          <button
            aria-label="Отправить правку"
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-full [transition:background-color_150ms_ease,opacity_150ms_ease,transform_160ms_cubic-bezier(0.23,1,0.32,1)] active:scale-95",
              blocked ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-primary text-primary-foreground hover:bg-primary/90",
              pending && "animate-pulse"
            )}
            disabled={blocked}
            type="submit"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </div>
      <p className="text-muted-foreground mt-2 flex h-4 items-center justify-center gap-1.5 text-xs">
        {pending ? <span className="animate-pulse">Отправится, когда загрузятся файлы</span> : phone ? "Ответы ниже будут заменены" : "Enter — отправить, Shift+Enter — перенос"}
      </p>
    </form>
  );
};

export const ComposerVariant = () => (
  <Stage composer={<EditPill />} dimTail mark note={null} />
);
