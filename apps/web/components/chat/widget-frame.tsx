"use client";

import { Skeleton } from "@metobe/ui/components/skeleton";
import { GridLoader } from "gridora";
import type { ReactNode } from "react";

/**
 * A widget the model builds in its answer — a table, a chart — in one frame: the title and a count on the left;
 * while the model writes, «Строит…» on the right, then the widget's own actions there.
 */
export const WidgetFrame = ({
  title,
  meta,
  streaming,
  building,
  actions,
  children,
}: {
  title: string;
  meta?: ReactNode;
  streaming: boolean;
  /** What is going on while the model writes: «Собирает таблицу…». */
  building: string;
  actions?: ReactNode;
  children: ReactNode;
}) => (
  // A border, not a ring: a grid's rows paint over a ring's sides; `overflow-hidden` clips inside a border.
  <section
    aria-busy={streaming}
    aria-label={title || undefined}
    className="bg-card border-foreground/10 w-full overflow-hidden rounded-xl border"
  >
    <header className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2">
      <div className="me-auto flex min-w-0 items-baseline gap-2">
        {title ? (
          <h3 className="truncate text-sm font-medium">{title}</h3>
        ) : (
          streaming && <Skeleton className="h-3.5 w-32 rounded-sm" />
        )}
        {meta && (
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {meta}
          </span>
        )}
      </div>
      {streaming ? (
        <output className="text-muted-foreground flex h-7 items-center gap-2 text-xs">
          <span className="grid size-3.5 place-items-center">
            <GridLoader
              cellSize={3}
              gap={1.5}
              respectReducedMotion
              variant="cacheWarm"
            />
          </span>
          <span className="shimmer">{building}</span>
        </output>
      ) : (
        actions
      )}
    </header>
    {children}
  </section>
);
