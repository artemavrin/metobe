"use client";

import { GripVertical, House, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useDraggable } from "./draggable";

export type Variant = { name: string; Component: () => React.ReactNode; pickerTop?: boolean };

// Picker chrome from the prototype skill spec, plus our additions: a drag grip and a «Параметры» sheet for the
// prototype's own knobs (states, hints), so there is one piece of chrome to move out of the way.
const PICKER_CSS = `
.proto-picker { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 2147483647; display: flex; align-items: center; gap: 2px; padding: 4px; border-radius: 999px; background: rgba(10, 10, 10, 0.82); -webkit-backdrop-filter: blur(12px) saturate(1.4); backdrop-filter: blur(12px) saturate(1.4); box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08) inset, 0 8px 24px rgba(0, 0, 0, 0.24), 0 2px 6px rgba(0, 0, 0, 0.12); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 13px; line-height: 1; -webkit-font-smoothing: antialiased; user-select: none; -webkit-user-select: none; }
.proto-picker-highlight { position: absolute; top: 4px; left: 0; height: 28px; border-radius: 999px; background: rgba(255, 255, 255, 0.12); will-change: transform; }
.proto-picker[data-ready] .proto-picker-highlight { transition: transform 250ms cubic-bezier(0.23, 1, 0.32, 1), width 250ms cubic-bezier(0.23, 1, 0.32, 1); }
@media (prefers-reduced-motion: reduce) { .proto-picker[data-ready] .proto-picker-highlight { transition: none; } }
.proto-picker-item { position: relative; display: flex; align-items: center; height: 28px; padding: 0 12px; border: 0; border-radius: 999px; background: transparent; color: rgba(255, 255, 255, 0.55); font: inherit; white-space: nowrap; cursor: pointer; transition: color 150ms ease-out; }
.proto-picker-item:hover { color: rgba(255, 255, 255, 0.85); }
.proto-picker-item:active { transform: scale(0.97); }
.proto-picker-item:focus-visible { outline: 2px solid rgba(255, 255, 255, 0.4); outline-offset: 2px; }
.proto-picker-item[data-active] { color: #fff; }
.proto-picker-divider { width: 1px; height: 16px; margin: 0 4px; background: rgba(255, 255, 255, 0.12); }
.proto-picker-replay { padding: 0 10px; font-size: 14px; }
.proto-picker[data-position="top"] { bottom: auto; top: 24px; }
.proto-picker-grip { padding: 0 4px 0 6px; cursor: grab; touch-action: none; color: rgba(255, 255, 255, 0.35); }
.proto-picker-grip:active { cursor: grabbing; transform: none; }
.proto-picker-item[aria-expanded="true"] { color: #fff; }
.proto-params { position: absolute; left: 0; right: 0; bottom: calc(100% + 8px); display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; border-radius: 16px; background: rgba(10, 10, 10, 0.82); -webkit-backdrop-filter: blur(12px) saturate(1.4); backdrop-filter: blur(12px) saturate(1.4); box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08) inset, 0 8px 24px rgba(0, 0, 0, 0.24); color: rgba(255, 255, 255, 0.7); font-size: 12px; line-height: 1.3; transform-origin: bottom center; transition: opacity 150ms cubic-bezier(0.23, 1, 0.32, 1), transform 150ms cubic-bezier(0.23, 1, 0.32, 1); }
.proto-params[data-side="below"] { bottom: auto; top: calc(100% + 8px); transform-origin: top center; }
@starting-style { .proto-params { opacity: 0; transform: scale(0.97); } }
@media (prefers-reduced-motion: reduce) { .proto-params { transition: none; } }
`;

const PARAMS_OPEN_KEY = "proto-params-open";

const initial = (count: number) => {
  if (typeof window === "undefined") return 0;
  const v = Number.parseInt(new URLSearchParams(window.location.search).get("v") ?? "", 10);
  return v >= 1 && v <= count ? v - 1 : 0;
};

/** Variant switcher from the prototype skill spec: one variant at a time, full size. */
/** `params` — the prototype's own knobs, shown in a sheet over the picker; rows lay out vertically. */
export const Picker = ({ variants: VARIANTS, params }: { variants: Variant[]; params?: React.ReactNode }) => {
  const [current, setCurrent] = useState(0);
  const [mountKey, setMountKey] = useState(0);
  const [ready, setReady] = useState(false);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const highlight = useRef<HTMLSpanElement>(null);
  // Local addition to the skill's picker: drag it off whatever it covers (grip on the left, double-click resets).
  const { ref: navRef, gripProps } = useDraggable<HTMLElement>("proto-picker-pos");
  const [paramsOpen, setParamsOpen] = useState(false);
  const [paramsSide, setParamsSide] = useState<"above" | "below">("above");
  // The sheet opens toward the free side: above when the picker sits in the lower half, below otherwise.
  const openParams = useCallback(
    (open: boolean) => {
      const rect = navRef.current?.getBoundingClientRect();
      if (rect) setParamsSide(rect.top > window.innerHeight / 2 ? "above" : "below");
      setParamsOpen(open);
      try {
        localStorage.setItem(PARAMS_OPEN_KEY, open ? "1" : "0");
      } catch {
        // Storage blocked: the sheet just starts closed next time.
      }
    },
    [navRef]
  );
  useEffect(() => {
    if (!params) return;
    try {
      if (localStorage.getItem(PARAMS_OPEN_KEY) === "1") openParams(true);
    } catch {
      // Storage blocked.
    }
  }, [params, openParams]);

  // URL param is read after hydration so server and client render the same first frame.
  useEffect(() => {
    setCurrent(initial(VARIANTS.length));
    requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
  }, [VARIANTS.length]);

  const moveHighlight = useCallback(() => {
    const el = items.current[current];
    if (!el || !highlight.current) return;
    highlight.current.style.width = `${el.offsetWidth}px`;
    highlight.current.style.transform = `translateX(${el.offsetLeft}px)`;
  }, [current]);

  useLayoutEffect(moveHighlight, [moveHighlight]);
  useEffect(() => {
    window.addEventListener("resize", moveHighlight);
    return () => window.removeEventListener("resize", moveHighlight);
  }, [moveHighlight]);

  const setActive = useCallback((i: number) => {
    if (i < 0 || i >= VARIANTS.length) return;
    setCurrent(i);
    setMountKey((k) => k + 1);
    const url = new URL(window.location.href);
    url.searchParams.set("v", String(i + 1));
    window.history.replaceState(null, "", url);
  }, [VARIANTS.length]);

  const replay = useCallback(() => setMountKey((k) => k + 1), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc closes the sheet even from a field: it types nothing there.
      if (e.key === "Escape" && paramsOpen) {
        openParams(false);
        return;
      }
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const num = Number.parseInt(e.key, 10);
      if (num >= 1 && num <= VARIANTS.length) setActive(num - 1);
      else if (e.key === "ArrowRight") setActive((current + 1) % VARIANTS.length);
      else if (e.key === "ArrowLeft") setActive((current - 1 + VARIANTS.length) % VARIANTS.length);
      else if (e.key === "r" || e.key === "R") replay();

    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [current, setActive, replay, VARIANTS.length, paramsOpen, openParams]);

  const variant = VARIANTS[current] ?? VARIANTS[0];
  const { Component } = variant;

  return (
    <>
      <style>{PICKER_CSS}</style>
      <Component key={`${current}-${mountKey}`} />
      <nav
        aria-label="Prototype variants"
        className="proto-picker"
        data-position={variant.pickerTop ? "top" : undefined}
        data-ready={ready ? "" : undefined}
        ref={navRef}
      >
        <span aria-hidden="true" className="proto-picker-highlight" ref={highlight} />
        <button
          aria-label="Переместить пикер (двойной клик — на место)"
          className="proto-picker-item proto-picker-grip"
          title="Переместить (двойной клик — на место)"
          type="button"
          {...gripProps}
        >
          <GripVertical className="size-3.5" />
        </button>
        <Link aria-label="Все прототипы" className="proto-picker-item proto-picker-replay" href="/dev/prototypes" title="Все прототипы">
          <House className="size-3.5" />
        </Link>
        <span aria-hidden="true" className="proto-picker-divider" />
        {VARIANTS.map((v, i) => (
          <button
            aria-current={i === current ? "true" : undefined}
            className="proto-picker-item"
            data-active={i === current ? "" : undefined}
            key={v.name}
            onClick={() => setActive(i)}
            ref={(el) => {
              items.current[i] = el;
            }}
            type="button"
          >
            {v.name}
          </button>
        ))}
        <span aria-hidden="true" className="proto-picker-divider" />
        <button aria-label="Replay animation (R)" className="proto-picker-item proto-picker-replay" onClick={replay} type="button">
          ↻
        </button>
        {params && (
          <button
            aria-controls="proto-params"
            aria-expanded={paramsOpen}
            aria-label="Параметры прототипа"
            className="proto-picker-item proto-picker-replay"
            onClick={() => openParams(!paramsOpen)}
            title="Параметры прототипа"
            type="button"
          >
            <SlidersHorizontal className="size-3.5" />
          </button>
        )}
        {params && paramsOpen && (
          <div className="proto-params" data-side={paramsSide} id="proto-params">
            {params}
          </div>
        )}
      </nav>
    </>
  );
};
