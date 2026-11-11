"use client";

import type { MemoryCardItem, MemoryOverview } from "@metobe/contracts/memory";
import { useCallback, useEffect, useRef, useState } from "react";

const NONE: MemoryCardItem[] = [];

const readCards = async () => {
  try {
    const response = await fetch("/api/memory", { cache: "no-store" });
    if (response.ok) {
      const overview = (await response.json()) as MemoryOverview;
      return overview.on ? overview.cards : NONE;
    }
  } catch {
    // Only the servers, then.
  }
  return NONE;
};

/**
 * The memory's cards for the `@` menu (Д4, P26) and for a paste that names one: read once, when the first `@` is typed
 * or a text with one is pasted — not with every chat page. Memory off, or a read that fails, gives none: the menu is
 * then only the servers.
 */
export const useMemoryCards = (wanted: boolean) => {
  const [cards, setCards] = useState(NONE);
  const asked = useRef<Promise<MemoryCardItem[]> | null>(null);
  const load = useCallback(async () => {
    if (!asked.current) {
      asked.current = readCards();
    }
    const read = await asked.current;
    setCards(read);
    return read;
  }, []);
  useEffect(() => {
    if (wanted) {
      load();
    }
  }, [wanted, load]);
  return { cards, load };
};
