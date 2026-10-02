"use client";

import { Kbd } from "@metobe/ui/components/kbd";
import { cn } from "@metobe/ui/lib/utils";
import { Plus } from "lucide-react";

import { useEngine } from "./engine";
import type { Turn } from "./engine";
import { AutoText, ChipRow, editKeys, usePicker } from "./parts";
import { Stage } from "./stage";

// «На месте»: пузырь сам становится полем — тот же шрифт и скругление. Файлы стоят над ним чипами; добавляются тем же
// «+», что в композере (круглая кнопка слева от текста, то же меню), и тем же перетаскиванием на весь экран. Кнопок
// почти нет: мелкая строка под пузырём — Esc отменяет, Enter отправляет.

/** «+» композера: та же круглая кнопка; для правки — сразу выбор файлов (меню из одного пункта ни к чему). */
const AddButton = ({ onFiles }: { onFiles: () => void }) => (
  <button
    aria-label="Добавить файл"
    className={cn(
      "text-muted-foreground inline-flex size-9 shrink-0 items-center justify-center rounded-full",
      "hover:bg-foreground/[0.06] hover:text-foreground active:scale-[0.97]",
      "[transition:scale_160ms_cubic-bezier(0.23,1,0.32,1),background-color_150ms_ease,color_150ms_ease] motion-reduce:active:scale-100"
    )}
    onClick={onFiles}
    title="Добавить файл"
    type="button"
  >
    <Plus className="size-[18px]" />
  </button>
);

const Editor = ({ turn }: { turn: Turn }) => {
  const { text, setText, send, cancel, items, pending, changes } = useEngine();
  const { input, open } = usePicker();
  const going = items.some((i) => !i.removed && i.status !== "error");
  const blocked = !text.trim() && !going;
  const keys = editKeys(send, cancel);
  void turn;
  return (
    <div className="animate-in fade-in zoom-in-[0.99] ml-auto flex w-full max-w-[85%] flex-col items-end gap-1.5 duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:animate-none">
      {input}
      {items.length > 0 && (
        <div className="flex w-full justify-end p-px">
          <ChipRow className="justify-end" />
        </div>
      )}
      <div className="bg-muted ring-foreground/20 focus-within:ring-foreground/35 flex w-full items-end gap-0.5 rounded-2xl rounded-br-md py-0.5 pr-4 pl-1 text-sm ring-2 [transition:box-shadow_150ms_ease]">
        <AddButton onFiles={open} />
        <div className="min-w-0 flex-1 py-1.5">
          <AutoText className="px-1.5" onChange={setText} onKeyDown={keys} value={text} />
        </div>
      </div>
      <div className="text-muted-foreground flex h-7 items-center gap-2 text-xs">
        <button className="hover:text-foreground inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 [transition:color_150ms_ease]" onClick={cancel} type="button">
          Отмена <Kbd>Esc</Kbd>
        </button>
        <button
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full px-3 font-medium [transition:background-color_150ms_ease,opacity_150ms_ease,transform_160ms_cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]",
            blocked ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
          disabled={blocked}
          onClick={send}
          type="button"
        >
          {pending ? "Ждём файлы…" : "Отправить"}
          {!pending && <Kbd className="bg-primary-foreground/15 text-primary-foreground">⏎</Kbd>}
        </button>
      </div>
      <span className="sr-only">{changes.text || changes.added || changes.removed ? "Есть изменения" : "Без изменений"}</span>
    </div>
  );
};

export const InPlaceVariant = () => <Stage editor={(turn) => <Editor turn={turn} />} />;
