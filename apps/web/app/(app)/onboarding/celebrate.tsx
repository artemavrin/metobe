"use client";

import { Button } from "@metobe/ui/components/button";
import { Confetti } from "@metobe/ui/components/confetti";
import type { ConfettiRef } from "@metobe/ui/components/confetti";
import {
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@metobe/ui/components/reui/frame";
import { ArrowRight, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

// The finish (P7, «Праздник · Конфетти · Залп»): two shots of confetti from behind the headline, in the theme's
// colours, on one full-viewport canvas. Up to three models by name, otherwise two and «ещё N».

const TITLE_CSS = `@keyframes title-in { from { transform: translateY(8px) scale(0.96); opacity: 0 } to { transform: none; opacity: 1 } }
@media (prefers-reduced-motion: reduce) { .celebrate, .celebrate * { animation: none !important } }`;
const EASE = "cubic-bezier(0.23,1,0.32,1)";

/** canvas-confetti wants hex; the theme speaks oklch. The browser converts through a 1px canvas. */
const themeColors = (vars: string[]) => {
  const ctx = document
    .createElement("canvas")
    .getContext("2d", { willReadFrequently: true });
  const styles = getComputedStyle(document.documentElement);
  return vars.map((v) => {
    if (!ctx) {
      return "#3b82f6";
    }
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = styles.getPropertyValue(v).trim() || "#3b82f6";
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((x) => (x ?? 0).toString(16).padStart(2, "0")).join("")}`;
  });
};

/** Where the headline is, in viewport fractions — canvas-confetti's `origin`. */
const originOf = (el: HTMLElement | null) => {
  const r = el?.getBoundingClientRect();
  if (!r) {
    return { x: 0.5, y: 0.3 };
  }
  return {
    x: (r.left + r.width / 2) / window.innerWidth,
    y: (r.top + r.height / 2) / window.innerHeight,
  };
};

const useBurst = (
  target: React.RefObject<HTMLElement | null>,
  confetti: React.RefObject<ConfettiRef | null>,
  ready: boolean
) => {
  useEffect(() => {
    if (!ready) {
      return;
    }
    const fire = (o: Parameters<ConfettiRef["fire"]>[0]) =>
      confetti.current?.fire({ disableForReducedMotion: true, ...o });
    const colors = themeColors([
      "--primary",
      "--chart-1",
      "--success",
      "--warning",
      "--info",
      "--chart-3",
    ]);
    let second: ReturnType<typeof setTimeout> | undefined;
    const first = setTimeout(() => {
      const origin = originOf(target.current);
      fire({
        colors,
        decay: 0.92,
        gravity: 0.7,
        origin,
        particleCount: 110,
        scalar: 0.9,
        spread: 75,
        startVelocity: 38,
        ticks: 320,
      });
      second = setTimeout(
        () =>
          fire({
            colors,
            decay: 0.93,
            gravity: 0.6,
            origin,
            particleCount: 40,
            scalar: 0.8,
            spread: 120,
            startVelocity: 25,
            ticks: 300,
          }),
        180
      );
    }, 260);
    return () => {
      clearTimeout(first);
      clearTimeout(second);
    };
  }, [target, confetti, ready]);
};

// oxlint-disable-next-line no-empty-function -- nothing to watch: this only tells the browser from the server
const noSubscribe = () => () => {};

/** «A, B и C», or «A, B и ещё N моделей». */
const useNames = (names: string[]) => {
  const t = useTranslations("onboarding.done");
  const list = new Intl.ListFormat(useLocale(), { type: "conjunction" });
  if (names.length <= 3) {
    return list.format(names);
  }
  return list.format([
    ...names.slice(0, 2),
    t("more", { count: names.length - 2 }),
  ]);
};

export const Celebrate = ({ names }: { names: string[] }) => {
  const t = useTranslations("onboarding.done");
  const title = useRef<HTMLHeadingElement>(null);
  const confetti = useRef<ConfettiRef>(null);
  // Only in the browser: the canvas goes into <body>.
  const mounted = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false
  );
  useBurst(title, confetti, mounted);
  const who = useNames(names);
  return (
    <>
      <style>{TITLE_CSS}</style>
      {/* Portaled to <body>: the card's entrance transform would make `fixed` relative to the card and clip the
          confetti. No worker, so React's dev double-mount can re-create it. */}
      {mounted &&
        createPortal(
          <Confetti
            className="pointer-events-none fixed inset-0 z-50 size-full"
            globalOptions={{ resize: true, useWorker: false }}
            manualstart
            ref={confetti}
          />,
          document.body
        )}
      <FrameHeader className="celebrate items-center gap-2 pt-10! pb-6! text-center">
        <FrameTitle
          className="text-3xl tracking-tight"
          ref={title}
          style={{ animation: `title-in 450ms ${EASE} 80ms both` }}
        >
          {t("title")}
        </FrameTitle>
        <FrameDescription
          className="max-w-sm"
          style={{ animation: `title-in 450ms ${EASE} 180ms both` }}
        >
          {t("text", { count: names.length, names: who })}
        </FrameDescription>
      </FrameHeader>
      <FramePanel className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both flex flex-col gap-2 delay-300 duration-300 ease-out">
        <Button
          className="h-10"
          nativeButton={false}
          render={<Link href="/" />}
        >
          {t("chat")} <ArrowRight />
        </Button>
        <Button
          className="text-muted-foreground w-fit self-center"
          nativeButton={false}
          render={<Link href="/onboarding" />}
          size="sm"
          variant="ghost"
        >
          <Plus /> {t("another")}
        </Button>
      </FramePanel>
    </>
  );
};
