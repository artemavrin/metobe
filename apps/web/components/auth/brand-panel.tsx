"use client";

import { cn } from "@metobe/ui/lib/utils";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

// The right half of the sign-in pages (prototype «Раскол · срез», /dev/prototypes/login): a looping clip of someone
// at work, facing left toward the form, under a diagonal edge, with a heading and a line about what Metobe gives.
// Always dark, like a photo, in both themes. Wide screens only — phones get just the form, and no video download.

/** VP9 WebM, 4:5, 8 s loops without audio (apps/web/public/login); the poster is each clip's first frame. */
const CLIPS = [1, 2, 3, 4].map((n) => ({
  poster: `/login/brand-${n}.webp`,
  src: `/login/brand-${n}.webm`,
}));

const TAGLINES = [
  "routine",
  "stronger",
  "secondMind",
  "moreInDay",
  "team",
] as const;

// The top-left corner cut on a diagonal; stretched to the panel, so the angle holds at any size.
const EDGE = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><path d='M22 0H100V100H0Z'/></svg>"
)}")`;
const EDGE_MASK = {
  WebkitMaskImage: EDGE,
  WebkitMaskRepeat: "no-repeat",
  WebkitMaskSize: "100% 100%",
  maskImage: EDGE,
  maskRepeat: "no-repeat",
  maskSize: "100% 100%",
} satisfies React.CSSProperties;

/**
 * One item per page view, at random but never the one shown last time. Picked after hydration, so the server and
 * the first client frame agree (both render the empty dark panel); nothing changes while the person types.
 */
const useRotation = (count: number, storageKey: string) => {
  const [index, setIndex] = useState<number | null>(null);
  // StrictMode runs effects twice; a second pick could land on last visit's item.
  const picked = useRef<number | null>(null);
  useEffect(() => {
    if (picked.current === null) {
      let last = -1;
      try {
        last = Number(localStorage.getItem(storageKey) ?? -1);
      } catch {
        // Storage blocked: a repeat is possible, nothing else changes.
      }
      const pool = Array.from({ length: count }, (_, i) => i).filter(
        (i) => i !== last
      );
      picked.current = pool[Math.floor(Math.random() * pool.length)] ?? 0;
      try {
        localStorage.setItem(storageKey, String(picked.current));
      } catch {
        // Storage blocked.
      }
    }
    setIndex(picked.current);
  }, [count, storageKey]);
  return index;
};

/**
 * Media only on wide screens, where the panel is shown — a hidden <img> still downloads, so phones get nothing.
 * The video also needs motion allowed; otherwise the poster stands still.
 */
const useMediaMode = () => {
  const [mode, setMode] = useState<"none" | "still" | "video">("none");
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      if (wide.matches) {
        setMode(calm.matches ? "still" : "video");
      } else {
        setMode("none");
      }
    };
    update();
    wide.addEventListener("change", update);
    calm.addEventListener("change", update);
    return () => {
      wide.removeEventListener("change", update);
      calm.removeEventListener("change", update);
    };
  }, []);
  return mode;
};

// Reveal, once the first frame is there (not on mount — a slow network would play it over nothing): the frame
// settles from 1.05 like a camera finding focus, then the text rises in. CSS animations, so they stay smooth while
// the page is still loading; reduced motion keeps only the fades.
const SETTLE =
  "animate-in fade-in zoom-in-105 fill-mode-both duration-[900ms] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:zoom-in-100";
const RISE =
  "animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:slide-in-from-bottom-0";

export const BrandPanel = () => {
  const t = useTranslations("authBrand");
  const media = useMediaMode();
  const clipIndex = useRotation(CLIPS.length, "login-brand-clip");
  const taglineIndex = useRotation(TAGLINES.length, "login-brand-tagline");
  const clip = clipIndex === null ? null : CLIPS[clipIndex];
  const tagline = taglineIndex === null ? null : TAGLINES[taglineIndex];
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);

  return (
    <aside
      className="relative isolate hidden w-[46%] max-w-[720px] shrink-0 flex-col items-end justify-end overflow-hidden bg-[#0e0f14] p-10 text-white lg:flex"
      style={EDGE_MASK}
    >
      {clip && media !== "none" && (
        // The poster is the base layer and drives the reveal; the video sits on top and shows up without a fade the
        // moment it plays — its first frame is the poster, so the swap is invisible.
        <div
          aria-hidden
          className={cn("absolute inset-0 -z-20", ready ? SETTLE : "opacity-0")}
        >
          {/* oxlint-disable-next-line nextjs/no-img-element -- a decorative still behind the text; no layout to optimise */}
          <img
            alt=""
            className="absolute inset-0 size-full object-cover"
            onError={() => setReady(true)}
            onLoad={() => setReady(true)}
            src={clip.poster}
          />
          {media === "video" && (
            <video
              autoPlay
              className={cn(
                "absolute inset-0 size-full object-cover",
                !playing && "opacity-0"
              )}
              loop
              muted
              onPlaying={() => setPlaying(true)}
              playsInline
              src={clip.src}
            />
          )}
        </div>
      )}
      {/* Keeps the text readable over any frame: eased stops, so the fade has no visible band on light clips */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-[linear-gradient(to_top,rgb(0_0_0/0.92)_0%,rgb(0_0_0/0.78)_22%,rgb(0_0_0/0.5)_46%,rgb(0_0_0/0.2)_70%,transparent_100%)]"
      />
      {/* A fine dot grid rising out of the shade under the text, gone before it reaches faces */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 [background-image:radial-gradient(rgb(255_255_255/0.2)_0.8px,transparent_1px)] [mask-image:linear-gradient(to_top,black_0%,black_12%,transparent_45%)] [background-size:18px_18px]"
      />
      {tagline && ready && (
        <div className="max-w-md text-right">
          <p
            className={cn(
              RISE,
              "text-3xl leading-[1.15] font-semibold tracking-tight text-balance delay-200"
            )}
          >
            {t(`taglines.${tagline}.title`)}
          </p>
          <p
            className={cn(
              RISE,
              "mt-3 text-base leading-relaxed text-pretty text-white/75 delay-[260ms]"
            )}
          >
            {t(`taglines.${tagline}.text`)}
          </p>
        </div>
      )}
    </aside>
  );
};
