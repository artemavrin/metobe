"use client";

import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { useState } from "react";

import { CloseOnCover, Cover, DontShow, EASE, Shot, Stage, WhatsNewDialog } from "./parts";
import { Rest } from "./rest";
import { useChanges, useProto } from "./state";

// «Тур» — a change per page, the picture on top taking the cover's place: first the cover with a word of what is
// coming, then each change full width, «И ещё» last. «Далее» or ←/→, the dots jump. One thing at a time — read even
// by the one who reads nothing; the cost is clicks, and what is past the second page may go unseen.

const plural = (n: number) => (n === 1 ? "изменение" : n < 5 ? "изменения" : "изменений");

export const Tour = () => {
  const changes = useChanges();
  const { setOpen } = useProto();
  const shown = changes.filter((c) => c.shot);
  /** 0 — the cover, 1…n — the changes with pictures, n + 1 — the rest. */
  const last = shown.length + 1;
  const [page, setPage] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const go = (to: number) => {
    const next = Math.max(0, Math.min(last, to));
    if (next === page) return;
    setDir(next > page ? 1 : -1);
    setPage(next);
  };
  const change = page >= 1 && page <= shown.length ? shown[page - 1] : null;

  return (
    <Stage>
      <WhatsNewDialog className="sm:max-w-[560px]">
        {/* ←/→ from anywhere in the window: the focus sits on its buttons, the keys bubble here. */}
        <div
          className="flex min-h-0 flex-col"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") go(page + 1);
            if (e.key === "ArrowLeft") go(page - 1);
          }}
          role="presentation"
        >
          <div className="relative aspect-[8/5] shrink-0 overflow-hidden border-b">
            <div className={cn("animate-in fade-in absolute inset-0 duration-200", EASE)} key={page}>
              {change ? <Shot alt={change.title} className="h-full rounded-none ring-0" name={change.shot ?? ""} /> : <Cover className="h-full" />}
            </div>
            {/* On a screenshot the cross gets a dark round under it, so it reads on light pages too. */}
            <CloseOnCover className={change ? "bg-black/35 text-white backdrop-blur-sm hover:bg-black/50" : undefined} />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div
              className={cn(
                "animate-in fade-in flex min-h-[9.5rem] flex-col gap-1.5 px-6 pt-5 pb-4 duration-200 motion-reduce:slide-in-from-left-0 motion-reduce:slide-in-from-right-0",
                dir === 1 ? "slide-in-from-right-2" : "slide-in-from-left-2",
                EASE
              )}
              key={page}
            >
              {page === 0 && (
                <>
                  <h2 className="text-lg font-semibold">Мы обновились</h2>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {shown.length} {plural(shown.length)} покрупнее — по одному на страницу, и немного мелочей в конце. Листайте кнопкой или стрелками ← →.
                  </p>
                </>
              )}
              {change && (
                <>
                  <h2 className="text-lg font-semibold">{change.title}</h2>
                  <p className="text-muted-foreground text-sm leading-relaxed">{change.text}</p>
                </>
              )}
              {page === last && <Rest changes={changes} />}
            </div>
          </div>

          <div className="flex justify-center gap-1.5 pb-4">
            {Array.from({ length: last + 1 }, (_, i) => (
              <button
                aria-current={i === page ? "step" : undefined}
                aria-label={`Страница ${i + 1}`}
                className="group grid h-4 place-items-center"
                key={i}
                onClick={() => go(i)}
                type="button"
              >
                <span
                  className={cn(
                    "block h-1.5 rounded-full transition-[width,background-color] duration-200",
                    EASE,
                    i === page ? "bg-foreground w-4" : "bg-foreground/20 group-hover:bg-foreground/40 w-1.5"
                  )}
                />
              </button>
            ))}
          </div>

          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t px-6 py-3">
            <DontShow />
            <div className="ml-auto flex gap-2">
              {page > 0 && (
                <Button onClick={() => go(page - 1)} variant="ghost">
                  Назад
                </Button>
              )}
              {page < last ? <Button onClick={() => go(page + 1)}>Далее</Button> : <Button onClick={() => setOpen(false)}>Понятно</Button>}
            </div>
          </footer>
        </div>
      </WhatsNewDialog>
    </Stage>
  );
};
