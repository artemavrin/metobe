"use client";

import { Button } from "@metobe/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@metobe/ui/components/dialog";
import { Kbd } from "@metobe/ui/components/kbd";
import { cn } from "@metobe/ui/lib/utils";
import { Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { EASE_OUT, useAppear } from "../attachments/stage";
import { useEngine } from "./engine";
import { AutoText, Tile, editKeys, totals, usePicker } from "./parts";
import { useProto } from "./state";
import { Stage } from "./stage";

// «Лист»: правка открывается крупным окном (на телефоне — листом снизу). Высокое поле для длинного текста, файлы
// плитками с большим превью, в конце сетки — плитка «Добавить» и она же зона для перетаскивания. Внизу — сколько
// файлов и какой они общий размер. Лента за окном остаётся как была: сообщение подсвечено.

const Body = () => {
  const { text, setText, items, send, cancel, pending, retry, remove } = useEngine();
  const { phone } = useProto();
  const { input, open } = usePicker();
  const appear = useAppear();
  const [over, setOver] = useState(false);
  const live = items.filter((i) => !i.removed);
  const going = live.some((i) => i.status !== "error");
  const blocked = !text.trim() && !going;
  const keys = editKeys(send, cancel);
  return (
    <>
      {input}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-1">
        <div className="bg-muted/50 focus-within:ring-foreground/20 rounded-xl px-3.5 py-3 text-sm ring-1 ring-transparent [transition:box-shadow_150ms_ease]">
          <AutoText label="Текст сообщения" max={phone ? 180 : 260} min={phone ? 96 : 120} onChange={setText} onKeyDown={keys} value={text} />
        </div>
        <div
          className={cn("grid gap-2.5 rounded-xl [transition:box-shadow_150ms_ease]", phone ? "grid-cols-2" : "grid-cols-3", over && "ring-foreground/30 ring-2 ring-offset-4 ring-offset-popover")}
          onDragLeave={() => setOver(false)}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) setOver(true);
          }}
          onDrop={() => setOver(false)}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {live.map((item) => (
              <motion.div key={item.id} layout="position" {...appear}>
                <Tile item={item} onRemove={() => remove(item.id)} onRetry={() => retry(item.id)} />
              </motion.div>
            ))}
          </AnimatePresence>
          <button
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50 border-border flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed text-xs [transition:background-color_150ms_ease,color_150ms_ease,transform_160ms_cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98]"
            onClick={open}
            type="button"
          >
            <Plus className="size-5" />
            {phone ? "Добавить файл" : "Добавить или перетащить сюда"}
          </button>
        </div>
      </div>
      <p className="text-muted-foreground text-xs">{totals(items)}</p>
      <span className="sr-only">{pending ? "Ждём файлы" : ""}</span>
      <Footer blocked={blocked} />
    </>
  );
};

const Footer = ({ blocked }: { blocked: boolean }) => {
  const { cancel, send, pending } = useEngine();
  return (
    <div className="flex items-center justify-end gap-2">
      <Button onClick={cancel} type="button" variant="ghost">
        Отмена <Kbd>Esc</Kbd>
      </Button>
      <Button disabled={blocked} onClick={send} type="button">
        {pending ? "Ждём файлы…" : "Отправить"}
      </Button>
    </div>
  );
};

const Lists = () => {
  const { editing, cancel } = useEngine();
  const { phone } = useProto();
  // Рамка телефона в прототипе — не окно браузера, поэтому лист рисуется внутри неё (в продукте это настоящий `Sheet`
  // снизу): затемнение, выезд снизу на 200 мс, закрытие по затемнению и по Esc.
  if (phone) {
    return editing === null ? null : (
      <div className="absolute inset-0 z-30 flex flex-col justify-end">
        <button aria-label="Закрыть" className="animate-in fade-in absolute inset-0 bg-black/10 duration-200" onClick={cancel} type="button" />
        <div
          className="bg-popover text-popover-foreground ring-foreground/10 animate-in slide-in-from-bottom-10 fade-in relative flex max-h-[88%] flex-col gap-3 rounded-t-2xl p-4 text-sm shadow-lg ring-1 duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:animate-none"
          role="dialog"
          aria-label="Правка сообщения"
        >
          <p className="text-base font-medium">Правка сообщения</p>
          <Body />
        </div>
      </div>
    );
  }
  return (
    <Dialog onOpenChange={(o) => !o && cancel()} open={editing !== null}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-3 p-5 sm:max-w-2xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-base">Правка сообщения</DialogTitle>
          <DialogDescription className="sr-only">Текст и файлы сообщения</DialogDescription>
        </DialogHeader>
        <Body />
      </DialogContent>
    </Dialog>
  );
};

export const SheetVariant = () => <Stage dimTail mark overlay={<Lists />} />;
