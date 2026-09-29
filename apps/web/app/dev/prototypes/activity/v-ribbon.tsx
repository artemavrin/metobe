"use client";

import { cn } from "@metobe/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { Expand, fmtSec, Loader, summary, Timeline } from "./parts";
import { useRun } from "./run";
import { Stage } from "./stage";

// «Лента»: одна карточка на ответ, как в ролике, без рамки и без «Остановить» (остановка — в композере). Шапка — статус и часы; ниже линия шагов, идущий раскрыт
// и пишет своё содержимое, завершённые схлопнуты в строки. Когда работа кончилась, вся карточка сворачивается в одну
// строку «Работал 14 с · 7 шагов», развернуть её можно. Карточка занимает место в ленте, зато всё на виду.

const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

const DOT: Record<string, string> = {
  done: "bg-emerald-500",
  stopped: "bg-muted-foreground",
  waiting: "bg-amber-500",
  working: "bg-blue-500",
};
const LABEL: Record<string, string> = {
  done: "Готово",
  stopped: "Остановлено",
  waiting: "Ждёт разрешения",
  working: "Работает",
};

// Ни рамки, ни заливки: лента лежит прямо на странице. Под значками шагов — фон страницы, они закрывают линию.
const SURFACE = "bg-background";

const Card = () => {
  const r = useRun();
  const [open, setOpen] = useState<boolean | null>(null);
  const finished = r.phase === "done" || r.phase === "stopped";
  const isOpen = open ?? !finished;
  return (
    <section>
      <header className="flex items-center gap-2 py-1">
        <button
          aria-expanded={isOpen}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
          onClick={() => setOpen(!isOpen)}
          type="button"
        >
          <span className={cn("size-2 shrink-0 rounded-full transition-colors duration-200", DOT[r.phase])} />
          {/* Статус сменился («Работает» → «Ждёт разрешения» → итог») — надпись проявляется заново: без сдвига, только opacity. */}
          <span
            className={cn("animate-in fade-in flex min-w-0 items-center gap-2 duration-150", EASE)}
            key={finished ? "summary" : r.phase}
          >
            {finished ? (
              <span className="text-muted-foreground min-w-0 truncate">{summary(r.views, r.elapsed)}</span>
            ) : (
              <>
                <span className="font-medium">{LABEL[r.phase]}</span>
                <span className="text-muted-foreground text-xs tabular-nums">{fmtSec(r.elapsed)}</span>
              </>
            )}
          </span>
          <ChevronRight
            className={cn("text-muted-foreground ml-auto size-4 shrink-0 transition-transform duration-200", EASE, isOpen && "rotate-90")}
          />
        </button>
      </header>
      <Expand open={isOpen}>
        <div className="pb-2">
          <Timeline surface={SURFACE} views={r.views} />
        </div>
      </Expand>
    </section>
  );
};

export const Ribbon = () => <Stage activity={<Card />} />;
export { Loader };
