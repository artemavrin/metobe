"use client";

import { useEffect, useRef } from "react";

import { inbox } from "@/components/hairline/inbox";
import { mk } from "@/components/hairline/stage";
import { inject } from "@/components/hairline/styles";

/** How far apart neighbouring cards start to move when one is pulled, ms: the figure's own default. */
const STAGGER = 40;

// The figure's palette, after the page's: the cards are filled with the screen's background, the bright stroke is its
// ink, and the greys keep Hairline's steps between the two — its own dark greys are drawn for a near-black ground.
const PALETTE_CSS = `
[data-hairline="inbox"] {
  --hairline-plate: var(--background);
  --hairline-hi: var(--foreground);
  --hairline-edge: color-mix(in oklab, var(--foreground) 38%, var(--background));
  --hairline-mid: color-mix(in oklab, var(--foreground) 24%, var(--background));
  --hairline-lo: color-mix(in oklab, var(--foreground) 12%, var(--background));
}
.dark [data-hairline="inbox"] {
  --hairline-edge: color-mix(in oklab, var(--foreground) 46%, var(--background));
  --hairline-mid: color-mix(in oklab, var(--foreground) 31%, var(--background));
  --hairline-lo: color-mix(in oklab, var(--foreground) 20%, var(--background));
}
`;

/**
 * A new chat's picture over the greeting: a tray of cards, and the sources flying into it one by one — 1C, mail,
 * Bitrix24, PDF and Word, audio, video, people, notes. The card under the pointer stands up. It is drawn in the browser
 * once the box is there, and only decorates: the greeting under it is the screen's heading.
 */
export const GreetingFigure = ({ className }: { className?: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const stage = ref.current;
    if (!stage) {
      return;
    }
    inject(document);
    const svg = mk(
      "svg",
      { "aria-hidden": "true", viewBox: "0 0 400 320" },
      stage
    );
    const figure = inbox({ read: { textContent: null }, stage, svg }, STAGGER);
    return () => {
      figure.destroy();
      svg.remove();
    };
  }, []);
  return (
    <>
      <style>{PALETTE_CSS}</style>
      <div aria-hidden className={className} data-hairline="inbox" ref={ref} />
    </>
  );
};
