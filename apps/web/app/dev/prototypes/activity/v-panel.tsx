"use client";

import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";

import { fmtSec, Loader, stepTitle, summary, Timeline } from "./parts";
import { useRun } from "./run";
import { Stage } from "./stage";

// «Панель»: ответ остаётся чистым. В нём только плашка «Шаги · 3» с тем, что происходит сейчас; ход работы живёт в панели
// справа (на телефоне — шторка снизу). Панель открывается сама, когда шаг ждёт разрешения, и только тогда: человек нужен
// именно там. Читающему ответ панель не мешает, а кто хочет проверить работу, видит её целиком и не теряет место в тексте.

const Body = ({ onClose, phone }: { onClose: () => void; phone: boolean }) => {
  const r = useRun();
  const finished = r.phase === "done" || r.phase === "stopped";
  const content = (
    <>
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium">Ход работы</span>
          <span className="text-muted-foreground truncate text-xs">
            {finished ? summary(r.views, r.elapsed) : `${fmtSec(r.elapsed)} · ${r.phase === "waiting" ? "ждёт разрешения" : "работает"}`}
          </span>
        </div>
        {!finished && (
          <Button onClick={r.stop} size="sm" variant="outline">
            Остановить
          </Button>
        )}
        <Button aria-label="Закрыть" onClick={onClose} size="icon-sm" variant="ghost">
          <X />
        </Button>
      </header>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <Timeline surface="bg-popover" views={r.views} />
      </div>
    </>
  );
  if (phone) {
    return (
      <div className="absolute inset-0 z-40 flex items-end">
        <button aria-label="Закрыть" className="absolute inset-0 bg-black/30" onClick={onClose} type="button" />
        <div className="bg-popover text-popover-foreground animate-in slide-in-from-bottom-6 fade-in-0 relative flex max-h-[80%] w-full flex-col rounded-t-2xl shadow-lg duration-200 motion-reduce:animate-none">
          {content}
        </div>
      </div>
    );
  }
  return (
    <aside className="bg-popover text-popover-foreground animate-in slide-in-from-right-4 fade-in-0 flex w-[380px] shrink-0 flex-col border-l duration-200 motion-reduce:animate-none">
      {content}
    </aside>
  );
};

const Chip = ({ onOpen, open }: { onOpen: () => void; open: boolean }) => {
  const r = useRun();
  const last = r.views.at(-1);
  const finished = r.phase === "done" || r.phase === "stopped";
  const waiting = r.phase === "waiting";
  return (
    <button
      className={cn(
        "hover:bg-muted/60 flex w-fit max-w-full items-center gap-2 rounded-full border py-1 pr-3 pl-2 text-sm transition-colors duration-150",
        waiting && "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300",
        open && "bg-muted/60"
      )}
      onClick={onOpen}
      type="button"
    >
      {finished ? (
        <span className="bg-emerald-500 size-2 rounded-full" />
      ) : (
        <span className="grid size-4 place-items-center">{waiting ? <span className="size-2 rounded-full bg-amber-500" /> : <Loader />}</span>
      )}
      <span className="font-medium">Шаги · {r.views.length}</span>
      <span className={cn("text-muted-foreground min-w-0 truncate text-xs", !finished && !waiting && "shimmer")}>
        {finished ? fmtSec(r.elapsed) : last ? stepTitle(last) : ""}
      </span>
      <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
    </button>
  );
};

export const Panel = () => {
  const r = useRun();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (r.phase === "waiting") {
      setOpen(true);
    }
  }, [r.phase]);
  return (
    <Stage
      activity={<Chip onOpen={() => setOpen(!open)} open={open} />}
      panel={(phone) => <Body onClose={() => setOpen(false)} phone={phone} />}
      panelOpen={open}
    />
  );
};
