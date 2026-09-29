"use client";

import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { Check, ChevronRight } from "lucide-react";
import { useState } from "react";

import { Expand, fmtSec, Loader, StepDetail, stepTitle, summary, Timeline } from "./parts";
import { useRun } from "./run";
import { Stage } from "./stage";

// «Строка»: карточки нет. В потоке ответа одна строка-статус: значок, что происходит сейчас, время. Надпись сменяется
// вместе с шагами (мягкий сдвиг вверх), шаги раскрываются под строкой нажатием. Подтверждение всплывает под строкой само:
// это единственное, что требует человека, остальное можно не читать. Готово — «Работал 14 с · 7 шагов ›».

const Status = () => {
  const r = useRun();
  const [open, setOpen] = useState(false);
  const last = r.views.at(-1);
  const finished = r.phase === "done" || r.phase === "stopped";
  const waiting = r.phase === "waiting" ? last : null;
  let label = "Начинает работу…";
  let icon = <Loader />;
  if (finished) {
    label = summary(r.views, r.elapsed);
    icon = <Check className="size-3.5" />;
  } else if (last) {
    label = stepTitle(last);
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <button
          aria-expanded={open}
          className="hover:text-foreground flex min-w-0 items-center gap-2 rounded-md py-0.5 text-left transition-colors duration-150"
          onClick={() => setOpen(!open)}
          type="button"
        >
          <span className={cn("grid size-4 shrink-0 place-items-center", waiting && "text-amber-600 dark:text-amber-400")}>{icon}</span>
          <span
            className={cn(
              "min-w-0 truncate",
              !finished && !waiting && "shimmer",
              waiting && "text-amber-700 dark:text-amber-300"
            )}
            // Новый шаг — новая надпись: мягкий сдвиг вверх; в завершённом состоянии ничего не движется.
            key={finished ? "done" : (last?.step.id ?? "start")}
          >
            <span className={cn("inline-block", !finished && "animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none")}>
              {label}
            </span>
          </span>
          {!finished && <span className="text-xs tabular-nums">{fmtSec(r.elapsed)}</span>}
          <ChevronRight className={cn("size-3.5 shrink-0 transition-transform duration-200", open && "rotate-90")} />
        </button>
        {!finished && (
          <Button className="ml-auto" onClick={r.stop} size="xs" variant="ghost">
            Остановить
          </Button>
        )}
      </div>
      {waiting && (
        <div className="animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none">
          <StepDetail controls v={waiting} />
        </div>
      )}
      <Expand open={open}>
        <div className="border-l pl-3">
          <Timeline controls={false} surface="bg-background" views={r.views} />
        </div>
      </Expand>
    </div>
  );
};

export const Line = () => <Stage activity={<Status />} />;
