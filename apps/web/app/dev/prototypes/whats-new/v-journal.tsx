"use client";

import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";

import { CloseOnCover, Cover, DontShow, EASE, Shot, Stage, WhatsNewDialog } from "./parts";
import { Rest } from "./rest";
import { useChanges, useProto } from "./state";

// «Журнал» — one page to scroll, like a post: the cover, then each change with its words and its screenshot, «И ещё»
// at the end. Read at one's own pace, nothing to click through; the footer — «Больше не показывать» and «Понятно» —
// stays in place while the page scrolls.

export const Journal = () => {
  const changes = useChanges();
  const { setOpen } = useProto();
  const shown = changes.filter((c) => c.shot);
  return (
    <Stage>
      <WhatsNewDialog className="sm:max-w-[600px]">
        <div className="relative shrink-0">
          <Cover />
          <CloseOnCover />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex flex-col gap-8 px-6 pt-6 pb-8">
            {shown.map((c, i) => (
              <article
                className={cn(
                  "animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards flex flex-col gap-3 duration-300 motion-reduce:slide-in-from-bottom-0",
                  EASE
                )}
                key={c.id}
                // The first few arrive one after another; the rest are below the fold anyway.
                style={{ animationDelay: `${120 + Math.min(i, 2) * 60}ms` }}
              >
                <div className="flex flex-col gap-1">
                  <h2 className="text-base font-semibold">{c.title}</h2>
                  <p className="text-muted-foreground text-sm leading-relaxed">{c.text}</p>
                </div>
                <Shot alt={c.title} name={c.shot ?? ""} />
              </article>
            ))}
            <Rest changes={changes} className="border-t pt-6" />
          </div>
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t px-6 py-3">
          <DontShow />
          <Button className="ml-auto" onClick={() => setOpen(false)}>Понятно</Button>
        </footer>
      </WhatsNewDialog>
    </Stage>
  );
};
