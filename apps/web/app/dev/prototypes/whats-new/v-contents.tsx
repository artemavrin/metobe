"use client";

import { Button } from "@metobe/ui/components/button";
import { cn } from "@metobe/ui/lib/utils";
import { useState } from "react";

import { CloseOnCover, Cover, DontShow, EASE, Shot, Stage, WhatsNewDialog } from "./parts";
import { Rest } from "./rest";
import { useChanges, useProto } from "./state";

// «Оглавление» — wide, the whole release at a glance: a narrow cover, on the left every change as a line, on the
// right the screenshot of the one under the pointer (↑/↓ walk the list). A glance shows all there is, a hover shows
// how it looks. On a phone there is no side — the list turns into the journal's page, picture under each.

export const Contents = () => {
  const changes = useChanges();
  const { setOpen } = useProto();
  const shown = changes.filter((c) => c.shot);
  const [at, setAt] = useState(0);
  const current = shown[at] ?? shown[0];

  return (
    <Stage>
      <WhatsNewDialog className="sm:max-w-[880px]">
        <div className="relative shrink-0">
          <Cover compact />
          <CloseOnCover />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* Wide: the list and the picture side by side. */}
          <div className="hidden gap-6 p-6 md:grid md:grid-cols-[260px_1fr]">
            <div className="flex flex-col gap-6">
              <div
                aria-label="Изменения"
                className="flex flex-col gap-1"
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    const next = (at + (e.key === "ArrowDown" ? 1 : shown.length - 1)) % shown.length;
                    setAt(next);
                    (e.currentTarget.children[next] as HTMLElement | undefined)?.focus();
                  }
                }}
                role="tablist"
                aria-orientation="vertical"
              >
                {shown.map((c, i) => (
                  <button
                    aria-selected={i === at}
                    className={cn(
                      "flex flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                      i === at ? "bg-muted" : "hover:bg-muted/60"
                    )}
                    key={c.id}
                    onClick={() => setAt(i)}
                    onFocus={() => setAt(i)}
                    onMouseEnter={() => setAt(i)}
                    role="tab"
                    tabIndex={i === at ? 0 : -1}
                    type="button"
                  >
                    <span className="text-sm font-medium">{c.title}</span>
                    <span className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">{c.text}</span>
                  </button>
                ))}
              </div>
              <Rest changes={changes} className="px-3" />
            </div>
            {current && (
              <div className="sticky top-0 flex flex-col gap-3 self-start" role="tabpanel">
                {/* The picture changes in place: a short fade, no slide — the pointer is moving, the eye should not. */}
                <div className="relative">
                  <div className={cn("animate-in fade-in duration-150", EASE)} key={current.id}>
                    <Shot alt={current.title} name={current.shot ?? ""} />
                  </div>
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed">{current.text}</p>
              </div>
            )}
          </div>

          {/* A phone: one column, each change with its picture. */}
          <div className="flex flex-col gap-8 px-5 pt-5 pb-8 md:hidden">
            {shown.map((c) => (
              <article className="flex flex-col gap-3" key={c.id}>
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
