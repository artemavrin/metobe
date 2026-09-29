"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useEffectEvent, useState } from "react";

import { scrambled, settleFrames, settling } from "@/lib/gibberish";

// A chat's title while the titles model is naming it (after animata's «Gibberish text»): the first line the chat has
// for now runs through random letters — the chat is being named — and when the name comes, its letters settle into
// it one by one. Under reduced motion the title only shimmers, then changes.

const NOISE_MS = 60;
const SETTLE_MS = 24;

/**
 * `loading` — the name is being made: the text is noise. When it turns false the noise settles into `text` and
 * `onSettled` is called, so the sidebar can go back to its ordinary title.
 */
export const GibberishTitle = ({
  text,
  loading,
  onSettled,
}: {
  text: string;
  loading: boolean;
  onSettled: () => void;
}) => {
  const reduce = useReducedMotion() ?? false;
  const [shown, setShown] = useState(() =>
    loading && !reduce ? scrambled(text) : text
  );
  const settled = useEffectEvent(onSettled);
  useEffect(() => {
    if (reduce) {
      if (!loading) {
        settled();
      }
      return;
    }
    if (loading) {
      const timer = setInterval(() => setShown(scrambled(text)), NOISE_MS);
      return () => clearInterval(timer);
    }
    const frames = settleFrames(text);
    const last = Math.max(0, ...frames);
    let frame = 0;
    const timer = setInterval(() => {
      frame += 1;
      setShown(settling(text, frames, frame));
      if (frame >= last) {
        clearInterval(timer);
        settled();
      }
    }, SETTLE_MS);
    return () => clearInterval(timer);
  }, [text, loading, reduce]);
  return (
    <span
      aria-busy={loading}
      className={loading && reduce ? "shimmer" : undefined}
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden>{reduce ? text : shown}</span>
    </span>
  );
};
