"use client";

import type { MemoryCardItem, MemoryOverview } from "@metobe/contracts/memory";
import { useEffect, useRef, useState } from "react";

const NONE: MemoryCardItem[] = [];

/**
 * The memory's cards for the `@` menu (Д4, P26): read once, when the first `@` is typed — not with every chat page.
 * Memory off, or a read that fails, gives none: the menu is then only the servers.
 */
export const useMemoryCards = (wanted: boolean) => {
  const [cards, setCards] = useState(NONE);
  const asked = useRef(false);
  useEffect(() => {
    if (!wanted || asked.current) {
      return;
    }
    asked.current = true;
    const read = async () => {
      try {
        const response = await fetch("/api/memory", { cache: "no-store" });
        if (response.ok) {
          const overview = (await response.json()) as MemoryOverview;
          setCards(overview.on ? overview.cards : NONE);
        }
      } catch {
        // Only the servers, then.
      }
    };
    read();
  }, [wanted]);
  return cards;
};
