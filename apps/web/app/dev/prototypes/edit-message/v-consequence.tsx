"use client";

import { Button } from "@metobe/ui/components/button";
import { Kbd } from "@metobe/ui/components/kbd";
import { cn } from "@metobe/ui/lib/utils";
import { Paperclip, RefreshCw } from "lucide-react";

import { useEngine } from "./engine";
import type { Turn } from "./engine";
import { AutoText, ChipRow, editKeys, usePicker } from "./parts";
import { useProto } from "./state";
import { Stage } from "./stage";

// «С последствиями»: карточка правки в ленте, но с видимыми последствиями. Убранный старый файл остаётся призраком
// с «Вернуть»; сводка «изменено: текст · −1 файл · +2 файла» говорит, что вообще поменялось; а ответ ниже гаснет
// с подписью, что он будет создан заново. Отправка названа тем, чем является: «Отправить правку».

const word = (n: number) => {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? "файл" : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "файла" : "файлов";
};

const Summary = () => {
  const { changes } = useEngine();
  const parts: string[] = [];
  if (changes.text) parts.push("текст");
  if (changes.removed) parts.push(`−${changes.removed} ${word(changes.removed)}`);
  if (changes.added) parts.push(`+${changes.added} ${word(changes.added)}`);
  return (
    <p className={cn("text-xs [transition:color_150ms_ease]", parts.length ? "text-foreground" : "text-muted-foreground")}>
      {parts.length ? <>Изменено: {parts.join(" · ")}</> : "Пока без изменений"}
    </p>
  );
};

const Editor = ({ turn }: { turn: Turn }) => {
  const { text, setText, send, cancel, items, pending } = useEngine();
  const { input, open } = usePicker();
  const { phone } = useProto();
  const going = items.some((i) => !i.removed && i.status !== "error");
  const blocked = !text.trim() && !going;
  const keys = editKeys(send, cancel);
  void turn;
  return (
    <div className="bg-muted/60 border-border animate-in fade-in zoom-in-[0.99] ml-auto flex w-full max-w-[85%] flex-col gap-2.5 rounded-2xl border p-2.5 duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:animate-none">
      {input}
      <div className="flex flex-wrap items-center gap-1.5">
        <ChipRow className="min-w-0" ghosts />
        <button
          className="text-muted-foreground hover:text-foreground ring-border hover:bg-background/60 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] ring-1 ring-dashed [transition:background-color_150ms_ease,color_150ms_ease,transform_160ms_cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]"
          onClick={open}
          type="button"
        >
          <Paperclip className="size-3.5" /> Добавить файл
        </button>
      </div>
      <div className="bg-background border-border focus-within:border-foreground/30 rounded-xl border px-3 py-2 text-sm [transition:border-color_150ms_ease]">
        <AutoText onChange={setText} onKeyDown={keys} value={text} />
      </div>
      <div className={cn("flex gap-2", phone ? "flex-col items-stretch" : "items-center justify-between")}>
        <Summary />
        <div className={cn("flex items-center gap-1.5", phone && "justify-end")}>
          <Button onClick={cancel} size="sm" type="button" variant="ghost">
            Отмена {!phone && <Kbd>Esc</Kbd>}
          </Button>
          <Button disabled={blocked} onClick={send} size="sm" type="button">
            {pending ? "Ждём файлы…" : "Отправить правку"}
          </Button>
        </div>
      </div>
    </div>
  );
};

const Note = () => (
  <div className="text-muted-foreground animate-in fade-in flex items-center justify-end gap-2 text-xs duration-200">
    <RefreshCw className="size-3.5 shrink-0" />
    <span>Отправка создаст ответ заново: этот ответ и всё после него будут заменены.</span>
  </div>
);

export const ConsequenceVariant = () => <Stage dimTail editor={(turn) => <Editor turn={turn} />} note={<Note />} />;
