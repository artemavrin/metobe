"use client";

import { useMemo, useRef, useState } from "react";

import { saveFavorites } from "@/app/(app)/(chat)/actions";

import type { Favorites } from "./data";

/** One save after the one before it, so the server ends up with the last order; a failed save waits for the next. */
const save = async (before: Promise<void>, ids: string[]) => {
  try {
    await before;
    await saveFavorites(ids);
  } catch {
    // The screen keeps the change; the next change sends the whole list again.
  }
};

/** The user's favorites: changed at once on screen, saved in the background in the order they were made. */
export const useFavorites = (initial: string[]): Favorites => {
  const [ids, setIds] = useState(initial);
  const queue = useRef(Promise.resolve());
  return useMemo(() => {
    const commit = (next: string[]) => {
      setIds(next);
      queue.current = save(queue.current, next);
    };
    return {
      has: (id: string) => ids.includes(id),
      ids,
      removeMany: (drop: string[]) =>
        commit(ids.filter((id) => !drop.includes(id))),
      reorder: (next: string[]) => commit(next),
      toggle: (id: string) =>
        commit(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]),
    };
  }, [ids]);
};
