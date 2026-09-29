"use client";

import { cn } from "@metobe/ui/lib/utils";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

/** Whether there is more of the text above and below what shows. */
const edgesOf = (box: HTMLElement) => ({
  bottom: box.scrollHeight - box.scrollTop - box.clientHeight > 1,
  top: box.scrollTop > 1,
});
type Edges = ReturnType<typeof edgesOf>;
const sameEdges = (a: Edges, b: Edges) =>
  a.top === b.top && a.bottom === b.bottom;

/**
 * Reasoning in a window a few lines high: the rest scrolls, and an edge with more text beyond it fades out (shadcn's
 * scroll-fade — driven by the scroll itself where the browser can, by the window where it cannot). While the model
 * thinks, the newest line stays in view — gliding up as lines come — unless the reader scrolls up to read; back at
 * the end, it follows again.
 */
export const ThoughtWindow = ({
  following,
  startAtEnd = false,
  bounded = true,
  maxHeightClass = "max-h-48",
  className,
  children,
}: {
  /** The text is still growing: keep its end in view. */
  following: boolean;
  /** Opened while the work goes on: it begins at its last words, where the reader was, not at its top. */
  startAtEnd?: boolean;
  /** A few lines high; off, it shows everything (a call waiting for the user's yes must be read whole). */
  bounded?: boolean;
  /** How high the window is: a max-height, or a fixed height for a slot that must not change size. */
  maxHeightClass?: string;
  className?: string;
  children: ReactNode;
}) => {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<Edges>({ bottom: false, top: false });
  const overflows = edges.top || edges.bottom;
  // Whether the window keeps to the end: the reader lets go, reaching the end takes hold again. The first fit jumps,
  // later ones glide; a text that has stopped while followed is shown to its last words.
  const follow = useRef({ at: true, followed: false, last: 0, settled: false });
  useEffect(() => {
    const box = scroller.current;
    const inner = content.current;
    if (!box || !inner) {
      return;
    }
    const f = follow.current;
    const toEnd = () =>
      // The class's smooth scrolling, unless the reader asked for less motion.
      box.scrollTo({
        behavior: f.settled ? "auto" : "instant",
        top: box.scrollHeight,
      });
    if (following) {
      f.followed = true;
    } else if (f.followed && f.at) {
      toEnd();
    }
    const observer = new ResizeObserver(() => {
      const next = edgesOf(box);
      setEdges((was) => (sameEdges(was, next) ? was : next));
      if ((following || (startAtEnd && !f.settled)) && f.at) {
        toEnd();
      }
      f.settled = true;
    });
    observer.observe(inner);
    return () => observer.disconnect();
  }, [following, startAtEnd]);
  return (
    // The window's focus outline on the frame: the fade would mask one drawn on the window itself.
    <div
      className={cn(
        "has-[>:focus-visible]:outline-2 has-[>:focus-visible]:outline-offset-2",
        className
      )}
    >
      <div
        className={cn(
          "no-scrollbar outline-none motion-safe:scroll-smooth",
          bounded && cn(maxHeightClass, "overflow-y-auto"),
          overflows && "scroll-fade-y scroll-fade-8"
        )}
        // Only the reader lets go — the wheel up, a finger, the keys (the window has the focus then); not a scroll
        // that is ours or the text's own.
        onScroll={(e) => {
          const box = e.currentTarget;
          const f = follow.current;
          if (document.activeElement === box && box.scrollTop < f.last - 1) {
            f.at = false;
          }
          if (box.scrollHeight - box.scrollTop - box.clientHeight < 4) {
            f.at = true;
          }
          f.last = box.scrollTop;
          const next = edgesOf(box);
          setEdges((was) => (sameEdges(was, next) ? was : next));
        }}
        onTouchMove={() => {
          follow.current.at = false;
        }}
        onWheel={(e) => {
          if (e.deltaY < 0) {
            follow.current.at = false;
          }
        }}
        ref={scroller}
        // A browser that drives the fade by the scroll itself (scroll timelines) animates it over these; one that
        // cannot would fade both edges always — hiding half a line at the very top and bottom — so the window says
        // which edge has more beyond it.
        style={
          overflows
            ? ({
                "--scroll-fade-b": edges.bottom ? "2rem" : "0px",
                "--scroll-fade-t": edges.top ? "2rem" : "0px",
              } as CSSProperties)
            : undefined
        }
        // Scrolled from the keyboard too, once there is anything to scroll.
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolled region must take the focus to scroll from the keyboard
        tabIndex={overflows ? 0 : undefined}
      >
        <div ref={content}>{children}</div>
      </div>
    </div>
  );
};
