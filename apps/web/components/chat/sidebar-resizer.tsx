"use client";

import { COOKIE } from "@metobe/i18n/config";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import {
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  clampSidebarWidth,
} from "@/lib/sidebar-width";

// The handle on the sidebar's right edge: in the gutter of the floating sidebar, between it and the page. A drag moves
// `--sidebar-width` on the wrapper directly (no render per pixel) and is kept when the pointer is let go; a double
// click puts the default back; the arrows move it by 16 px (48 with Shift). Nothing animates while it is dragged.

const WRAPPER = '[data-slot="sidebar-wrapper"]';
const STEP = 16;
const STEP_BIG = 48;

// Written by hand: the Cookie Store API is not in every Safari yet, and the cookie is read on the server, plain.
const write = (value: string, maxAge: number) => {
  // oxlint-disable-next-line unicorn/no-document-cookie -- see above
  document.cookie = `${COOKIE.sidebarWidth}=${value}; path=/; max-age=${maxAge}; samesite=lax`;
};
const save = (px: number) => write(String(px), 60 * 60 * 24 * 365);

const NO_TRANSITION = `[data-resizing] [data-slot="sidebar-gap"], [data-resizing] [data-slot="sidebar-container"] { transition: none; }`;

export const SidebarResizer = ({
  width,
  onCommit,
}: {
  /** The width the server drew the sidebar at; null — the default. */
  width: number | null;
  onCommit: (px: number | null) => void;
}) => {
  const t = useTranslations("chat");
  const handle = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; start: number } | null>(null);
  const wrapper = () => handle.current?.closest<HTMLElement>(WRAPPER) ?? null;
  // The last width set: the element itself still moves for a moment after a key press (the panel's own transition), so
  // the next press must start from what was asked for, not from where the element is on its way.
  const set = useRef<number | null>(null);
  const apply = (px: number) => {
    set.current = px;
    wrapper()?.style.setProperty("--sidebar-width", `${px}px`);
  };
  const now = () =>
    set.current ??
    handle.current?.closest<HTMLElement>('[data-slot="sidebar-container"]')
      ?.offsetWidth ??
    width ??
    SIDEBAR_DEFAULT;

  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { start: now(), x: event.clientX };
    wrapper()?.toggleAttribute("data-resizing", true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current) {
      apply(
        clampSidebarWidth(drag.current.start + event.clientX - drag.current.x)
      );
    }
  };
  const up = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) {
      return;
    }
    const px = clampSidebarWidth(
      drag.current.start + event.clientX - drag.current.x
    );
    drag.current = null;
    wrapper()?.toggleAttribute("data-resizing", false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    apply(px);
    save(px);
    onCommit(px);
  };
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? STEP_BIG : STEP;
    let by = 0;
    if (event.key === "ArrowRight") {
      by = step;
    } else if (event.key === "ArrowLeft") {
      by = -step;
    }
    if (!by) {
      return;
    }
    event.preventDefault();
    const px = clampSidebarWidth(now() + by);
    apply(px);
    save(px);
    onCommit(px);
  };
  const reset = () => {
    apply(SIDEBAR_DEFAULT);
    set.current = null;
    write("", 0);
    onCommit(null);
  };

  return (
    <div
      aria-label={t("sidebarResize")}
      aria-orientation="vertical"
      aria-valuemax={SIDEBAR_MAX}
      aria-valuemin={SIDEBAR_MIN}
      aria-valuenow={width ?? SIDEBAR_DEFAULT}
      // Laid over the sidebar's own edge (same top, bottom and radius as its inner box): the border it shows follows the
      // rounded corners like the sidebar's ring does, instead of a straight line sticking out past them. The `after:`
      // strip carries the hit area on into the gutter; it belongs to this element, so the pointer events are its own.
      className="group/resize hover:border-foreground/20 focus-visible:border-ring active:border-foreground/35 absolute top-2 right-[7px] bottom-2 z-20 w-2 cursor-col-resize touch-none rounded-r-lg border-r-2 border-transparent transition-colors duration-150 outline-none after:absolute after:inset-y-0 after:left-full after:w-2.5 max-md:hidden"
      onDoubleClick={reset}
      onKeyDown={key}
      onPointerCancel={up}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      ref={handle}
      // A window splitter: focusable, with a value and arrow keys — `hr` cannot be that.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="separator"
      tabIndex={0}
    >
      <style>{NO_TRANSITION}</style>
    </div>
  );
};
