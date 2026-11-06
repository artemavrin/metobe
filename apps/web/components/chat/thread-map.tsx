"use client";

import { Button } from "@metobe/ui/components/button";
import {
  useMessageScroller,
  useMessageScrollerVisibility,
} from "@metobe/ui/components/message-scroller";
import { cn } from "@metobe/ui/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent, MouseEvent } from "react";

import {
  hitWidth,
  indexAt,
  MAP_MIN_ITEMS,
  MAP_PERSISTENT_GUTTER,
  railHeight,
  sideGutter,
  topPercent,
} from "@/lib/thread-map";
import type { ThreadMapItem } from "@/lib/thread-map";

// The thread's map (after T3 Code's timeline minimap): a strip per question in the margin left of the column. The
// questions on screen are bright; under the pointer the strips swell around it like a fisheye, and a card shows the
// question and the start of its answer. A click, Enter or the arrows above and below go there. The rail never
// reaches into the column — it would steal the text's clicks — and with a narrow margin it shows on hover only;
// a touch screen has no pointer to aim it, so it has none.

const unsubscribe = (): void => undefined;
const noSubscribe = () => unsubscribe;

/** The width of a strip by its distance from the one under the pointer. */
const SCALE = ["scale-x-100", "scale-x-[0.667]", "scale-x-[0.417]"];

/** «Предыдущий / следующий вопрос»: over and under the rail, seen when the pointer comes to it. */
const Arrow = ({
  up,
  label,
  disabled,
  onClick,
}: {
  up?: boolean;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) => {
  const Icon = up ? ChevronUp : ChevronDown;
  return (
    <span
      className={cn(
        "absolute left-1 z-10 inline-flex -translate-x-1/2 opacity-0 transition-opacity duration-150 focus-within:opacity-100 hover:opacity-100",
        up ? "bottom-[calc(100%+2px)]" : "top-[calc(100%+2px)]"
      )}
    >
      <Button
        aria-label={label}
        className="size-5"
        disabled={disabled}
        onClick={onClick}
        size="icon-sm"
        variant="ghost"
      >
        <Icon className="size-4" />
      </Button>
    </span>
  );
};

export const ThreadMap = ({
  items,
  column,
}: {
  items: ThreadMapItem[];
  /** The thread column's widest, px: the margin beside it is the map's room. */
  column: number;
}) => {
  const t = useTranslations("chat.map");
  const { scrollToMessage } = useMessageScroller();
  const { currentAnchorId, visibleMessageIds } = useMessageScrollerVisibility();
  const [gutter, setGutter] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  // Drawn in the browser only: what is on screen is the browser's to know, the server's guess would not match it —
  // and the map is for a pointer, which the server-rendered page does not have yet anyway.
  const mounted = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false
  );
  // Measured when the rail comes into the page, and again whenever the margin beside the column changes.
  const root = useCallback(
    (node: HTMLDivElement | null) => {
      const box = node?.parentElement;
      if (!box) {
        return;
      }
      const measure = () => setGutter(sideGutter(box.clientWidth, column));
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(box);
      return () => observer.disconnect();
    },
    [column]
  );

  if (!mounted || items.length < MAP_MIN_ITEMS) {
    return null;
  }

  const visible = new Set(visibleMessageIds);
  const current = items.findIndex((it) => it.id === currentAnchorId);
  const shown = active === null ? null : (items[active] ?? null);
  const width = hitWidth(gutter);
  const go = (item: ThreadMapItem | undefined) => {
    if (item) {
      scrollToMessage(item.id, { align: "start", behavior: "smooth" });
    }
  };
  const pointed = (e: MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return indexAt(items.length, rect.top, rect.height, e.clientY);
  };
  const keys = (e: KeyboardEvent) => {
    const last = items.length - 1;
    const step: Record<string, (i: number) => number> = {
      ArrowDown: (i) => Math.min(last, i + 1),
      ArrowUp: (i) => Math.max(0, i - 1),
      End: () => last,
      Home: () => 0,
    };
    if (step[e.key]) {
      e.preventDefault();
      setActive((i) => step[e.key]?.(i ?? Math.max(current, 0)) ?? i);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      go(shown ?? undefined);
    }
  };
  // The card stays inside the rail's height: the first opens downward, the last upward.
  let shift = "-50%";
  if (active === 0) {
    shift = "0%";
  } else if (active === items.length - 1) {
    shift = "-100%";
  }

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-y-0 left-0 z-20 hidden w-18 [@media(pointer:fine)]:block",
        gutter >= MAP_PERSISTENT_GUTTER
          ? "opacity-100"
          : "opacity-0 transition-opacity duration-150 focus-within:opacity-100 hover:opacity-100"
      )}
      ref={root}
    >
      <div
        className={cn(
          "absolute top-1/2 left-3 -translate-y-1/2",
          width > 0 ? "pointer-events-auto" : "pointer-events-none"
        )}
        // Once the card is open, the way to it takes the pointer too, so it can be reached and its text selected.
        style={{
          height: railHeight(items.length),
          width: shown ? "22rem" : width,
        }}
      >
        <Arrow
          disabled={current <= 0}
          label={t("previous")}
          onClick={() => go(items[current - 1])}
          up
        />
        <button
          aria-label={t("jump", { question: shown?.question ?? "" })}
          className="focus-visible:ring-ring/70 absolute inset-y-0 left-0 w-full cursor-pointer rounded-sm outline-none focus-visible:ring-2"
          // What «Что нового» points its cursor at, whatever the language of the label.
          data-map-rail
          onBlur={() => setActive(null)}
          onClick={(e) => {
            if ((e.target as Element).closest("[data-map-card]")) {
              return;
            }
            go(items[pointed(e) ?? -1]);
            e.currentTarget.blur();
          }}
          onFocus={() => setActive((i) => i ?? Math.max(current, 0))}
          onKeyDown={keys}
          onMouseDown={(e) => {
            // A click on the rail jumps; it must not take the focus and leave the card open after.
            if (!(e.target as Element).closest("[data-map-card]")) {
              e.preventDefault();
            }
          }}
          onMouseLeave={() => setActive(null)}
          onMouseMove={(e) => setActive(pointed(e))}
          type="button"
        >
          {items.map((item, i) => {
            const distance = active === null ? null : Math.abs(i - active);
            const seen =
              visible.has(item.id) ||
              (item.answerId !== null && visible.has(item.answerId));
            return (
              // Only transform and opacity move: the strips change on every scroll tick and every streamed word.
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute left-0 h-0.5 w-6 origin-left -translate-y-1/2 rounded-full transition-transform duration-150 ease-out",
                  distance === 0
                    ? "bg-muted-foreground/75"
                    : "bg-muted-foreground/35",
                  SCALE[distance ?? 3] ?? "scale-x-[0.333]"
                )}
                key={item.id}
                style={{ top: `${topPercent(i, items.length)}%` }}
              >
                <span
                  className={cn(
                    "bg-foreground/90 absolute inset-0 rounded-full transition-opacity duration-150",
                    seen ? "opacity-100" : "opacity-0"
                  )}
                />
              </span>
            );
          })}
          {shown && (
            <span
              className="bg-sidebar text-sidebar-foreground pointer-events-auto absolute left-8 block w-80 cursor-text rounded-xl border p-3 text-left shadow-lg select-text"
              data-map-card
              onMouseMove={(e) => e.stopPropagation()}
              style={{
                top: `${topPercent(active ?? 0, items.length)}%`,
                transform: `translateY(${shift})`,
              }}
            >
              <span className="block truncate text-sm leading-5 font-medium">
                {shown.question || t("noText")}
              </span>
              {shown.answer && (
                <span className="text-muted-foreground mt-1 line-clamp-3 text-sm leading-5">
                  {shown.answer}
                </span>
              )}
            </span>
          )}
        </button>
        <Arrow
          disabled={current === -1 || current >= items.length - 1}
          label={t("next")}
          onClick={() => go(items[current + 1])}
        />
      </div>
    </div>
  );
};
