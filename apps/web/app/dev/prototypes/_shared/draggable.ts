"use client";

// Drag-by-grip for prototype chrome (picker, knob panel). The element keeps its CSS home position until dragged;
// after that it sits at a clamped viewport point, remembered per browser under `storageKey`. Double-click the grip
// to send it home. Transform is written straight to the element — no re-render per pointer move, no animation.
import { useEffect, useRef } from "react";

const EDGE = 8;

type Pos = { x: number; y: number };

const read = (key: string): Pos | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Pos) : null;
  } catch {
    return null;
  }
};

const write = (key: string, pos: Pos | null) => {
  try {
    if (pos) localStorage.setItem(key, JSON.stringify(pos));
    else localStorage.removeItem(key);
  } catch {
    // Private mode or blocked storage: the element just forgets its place.
  }
};

export const useDraggable = <T extends HTMLElement>(storageKey: string) => {
  const ref = useRef<T>(null);
  const pos = useRef<Pos | null>(null);
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null);

  const place = (next: Pos | null) => {
    const el = ref.current;
    if (!el) return;
    if (!next) {
      pos.current = null;
      el.style.removeProperty("left");
      el.style.removeProperty("top");
      el.style.removeProperty("right");
      el.style.removeProperty("bottom");
      el.style.removeProperty("transform");
      return;
    }
    pos.current = {
      x: Math.min(Math.max(EDGE, next.x), window.innerWidth - el.offsetWidth - EDGE),
      y: Math.min(Math.max(EDGE, next.y), window.innerHeight - el.offsetHeight - EDGE),
    };
    el.style.left = "0px";
    el.style.top = "0px";
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`;
  };

  // oxlint-disable-next-line react-hooks/exhaustive-deps -- place only touches refs
  useEffect(() => {
    place(read(storageKey));
    const onResize = () => pos.current && place(pos.current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [storageKey]);

  const end = (e: React.PointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    write(storageKey, pos.current);
  };

  const gripProps = {
    onDoubleClick: () => {
      place(null);
      write(storageKey, null);
    },
    onLostPointerCapture: end,
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      // One pointer at a time: a second finger mid-drag must not make the element jump.
      if (drag.current || e.button !== 0 || !ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, id: e.pointerId };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current;
      if (d?.id !== e.pointerId) return;
      place({ x: e.clientX - d.dx, y: e.clientY - d.dy });
    },
    onPointerUp: end,
  };

  return { gripProps, ref };
};
