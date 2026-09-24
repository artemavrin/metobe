"use client";

import { House } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type Variant = { name: string; Component: () => React.ReactNode; pickerTop?: boolean };

// Picker chrome, verbatim from the prototype skill spec.
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
`;

const initial = (count: number) => {
  if (typeof window === "undefined") return 0;
  const v = Number.parseInt(new URLSearchParams(window.location.search).get("v") ?? "", 10);
  return v >= 1 && v <= count ? v - 1 : 0;
};

/** Variant switcher from the prototype skill spec: one variant at a time, full size. */
export const Picker = ({ variants: VARIANTS }: { variants: Variant[] }) => {
  const [current, setCurrent] = useState(0);
  const [mountKey, setMountKey] = useState(0);
  const [ready, setReady] = useState(false);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const highlight = useRef<HTMLSpanElement>(null);

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
  }, [current, setActive, replay, VARIANTS.length]);

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
      >
        <span aria-hidden="true" className="proto-picker-highlight" ref={highlight} />
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
      </nav>
    </>
  );
};
