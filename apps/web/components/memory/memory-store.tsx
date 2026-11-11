"use client";

import type {
  MemoryCard,
  MemoryCardItem,
  MemoryDue,
  MemoryOverview,
  MemorySearch,
} from "@metobe/contracts/memory";
import { toast } from "@metobe/ui/components/sonner";
import { useIsMobile } from "@metobe/ui/hooks/use-mobile";
import { useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Dispatch, SetStateAction } from "react";

import { lateByCard } from "@/lib/memory-late";

import { pickFromParams, pickToSearch } from "./memory-pick";
import type { Pick } from "./memory-pick";
import { readJson, useActionsOf } from "./use-memory-actions";

// One state for the «Память» page and the list beside it. The list stands in the app's sidebar (as the lists of the
// settings do), the card and the calendar in the page; both read this store, so a deadline moved on the calendar, a
// promise marked done on a card, a card made by hand — each shows in the list at once. Nothing is read until the
// person is on a memory page; what was read stays, and is read again on each way in.

/** What a hand-made card is: its kind, and for a thing of the person's own kind — the word for what it is. */
export interface NewCardInput {
  kind: MemoryCardItem["kind"];
  name: string;
  type?: string;
}

/** Where a new card goes: its kind, the word for what it is (a thing in a section of its type), the dialog's title. */
export interface NewCardTarget {
  kind: MemoryCardItem["kind"];
  type?: string;
  title: string;
}

type Actions = ReturnType<typeof useActionsOf>;

export interface MemoryStore {
  /** Null until read. The cards' `overdue` is counted from the deadlines, as the calendar shows them. */
  overview: MemoryOverview | null;
  due: MemoryDue | null;
  setDue: Dispatch<SetStateAction<MemoryDue | null>>;
  /** Commitments open a long time (a way in to «Сверка»). */
  stale: number;
  /** The open card, and what the search found. */
  card: MemoryCard | null;
  found: MemorySearch | null;
  q: string;
  setQ: (q: string) => void;
  /** What is picked in the address, and what is shown: the first card stands in for no pick on a wide screen. */
  pick: Pick | null;
  shown: Pick | null;
  setPick: (p: Pick | null) => void;
  phone: boolean;
  /** The dialogs of a new card and a new rule, opened from the list and shown by the page. */
  making: NewCardTarget | null;
  setMaking: (target: NewCardTarget | null) => void;
  ruleOpen: boolean;
  setRuleOpen: (open: boolean) => void;
  /** A card by hand: it comes back made (or found, if the name was there), the list is read again, the card opens. */
  create: (input: NewCardInput) => Promise<boolean>;
  /** Reads everything open again, after a change. */
  reread: () => Promise<void>;
  actions: Actions;
  timeZone: string;
}

const Store = createContext<MemoryStore | null>(null);

export const useMemoryStore = () => {
  const store = use(Store);
  if (!store) {
    throw new Error("memory: outside the memory store");
  }
  return store;
};

/** For parts that may stand outside it (the sidebar on any page): null there. */
export const useMaybeMemoryStore = () => use(Store);

const SEARCH_DELAY_MS = 250;

/** A pick goes to the address without a new page: the list and the page both follow it. */
const setPick = (p: Pick | null) =>
  window.history.pushState(null, "", pickToSearch(p));

const searchUrl = (query: string) =>
  `/api/memory/search?q=${encodeURIComponent(query)}`;

/** The list, the deadlines and the number of long-open promises, read together. A part that failed is null. */
const readEverything = async () => {
  const [list, rows, old] = await Promise.all([
    readJson<MemoryOverview>("/api/memory"),
    readJson<MemoryDue>("/api/memory/due"),
    readJson<{ rows: unknown[] }>("/api/memory/stale"),
  ]);
  return { list, old: old ? old.rows.length : null, rows };
};
type Everything = Awaited<ReturnType<typeof readEverything>>;

/** What was read goes in; what could not be read leaves what was there. */
const applyEverything = (
  read: Everything,
  set: {
    overview: (o: MemoryOverview) => void;
    due: (d: MemoryDue) => void;
    stale: (n: number) => void;
  }
) => {
  if (read.list) {
    set.overview(read.list);
  }
  if (read.rows) {
    set.due(read.rows);
  }
  if (read.old !== null) {
    set.stale(read.old);
  }
};

export const MemoryStoreProvider = ({
  timeZone,
  children,
}: {
  timeZone: string;
  children: React.ReactNode;
}) => {
  const t = useTranslations("memory");
  const phone = useIsMobile();
  const active = usePathname().startsWith("/memory");
  const params = useSearchParams();
  const cardParam = params.get("card");
  const viewParam = params.get("view");
  const pick = useMemo(
    () =>
      pickFromParams({
        get: (k: string) => (k === "card" ? cardParam : viewParam),
      }),
    [cardParam, viewParam]
  );
  const [base, setBase] = useState<MemoryOverview | null>(null);
  const [due, setDue] = useState<MemoryDue | null>(null);
  const [stale, setStale] = useState(0);
  const [card, setCard] = useState<MemoryCard | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ q: string; data: MemorySearch } | null>(
    null
  );
  const [making, setMaking] = useState<NewCardTarget | null>(null);
  const [ruleOpen, setRuleOpen] = useState(false);

  // On a wide screen the first card is open from the start; on a phone the list comes first.
  const [first] = base?.cards ?? [];
  const firstId = first?.id;
  const shown = useMemo<Pick | null>(
    () => pick ?? (phone || !firstId ? null : { id: firstId, type: "card" }),
    [pick, phone, firstId]
  );
  const cardId = shown?.type === "card" ? shown.id : null;
  const query = q.trim();

  // Read on each way in to a memory page, and kept while the person is elsewhere.
  useEffect(() => {
    if (!active) {
      return;
    }
    let live = true;
    const run = async () => {
      const read = await readEverything();
      if (live) {
        applyEverything(read, {
          due: setDue,
          overview: setBase,
          stale: setStale,
        });
      }
    };
    run();
    return () => {
      live = false;
    };
  }, [active]);

  useEffect(() => {
    if (!(active && cardId)) {
      return;
    }
    let live = true;
    const read = async () => {
      const data = await readJson<MemoryCard>(`/api/memory/cards/${cardId}`);
      if (live) {
        setCard(data);
      }
    };
    read();
    return () => {
      live = false;
    };
  }, [active, cardId]);

  useEffect(() => {
    if (!(active && query)) {
      return;
    }
    let live = true;
    const timer = setTimeout(async () => {
      const data = await readJson<MemorySearch>(searchUrl(query));
      if (live && data) {
        setFound({ data, q: query });
      }
    }, SEARCH_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [active, query]);

  const reread = useCallback(async () => {
    const [open, search, read] = await Promise.all([
      cardId ? readJson<MemoryCard>(`/api/memory/cards/${cardId}`) : null,
      query ? readJson<MemorySearch>(searchUrl(query)) : null,
      readEverything(),
    ]);
    applyEverything(read, {
      due: setDue,
      overview: setBase,
      stale: setStale,
    });
    if (cardId) {
      setCard(open);
    }
    if (search) {
      setFound({ data: search, q: query });
    }
  }, [cardId, query]);

  const actions = useActionsOf(timeZone, reread);

  // The list's «просрочено» comes from the same deadlines as the calendar: a bar moved over today changes both.
  const overview = useMemo(() => {
    if (!(base && due)) {
      return base;
    }
    const late = lateByCard(due, timeZone);
    return {
      ...base,
      cards: base.cards.map((c) => ({ ...c, overdue: late.get(c.id) ?? 0 })),
    };
  }, [base, due, timeZone]);

  const create = useCallback(
    async (input: NewCardInput) => {
      const response = await fetch("/api/memory/cards", {
        body: JSON.stringify(input),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        toast.error(t("failed"));
        return false;
      }
      const made = (await response.json()) as {
        card: MemoryCardItem;
        existed: boolean;
      };
      if (made.existed) {
        toast(t("cardExisted", { name: made.card.name }));
      }
      await reread();
      setPick({ id: made.card.id, type: "card" });
      return true;
    },
    [reread, t]
  );

  const value = useMemo<MemoryStore>(
    () => ({
      actions,
      card: card && card.card.id === cardId ? card : null,
      create,
      due,
      found: query && found?.q === query ? found.data : null,
      making,
      overview,
      phone,
      pick,
      q,
      reread,
      ruleOpen,
      setDue,
      setMaking,
      setPick,
      setQ,
      setRuleOpen,
      shown,
      stale,
      timeZone,
    }),
    // Rebuilt with the page's state; what changes seldom (the setters) is stable, the calls are made again each time.
    [
      actions,
      card,
      cardId,
      create,
      due,
      found,
      making,
      overview,
      phone,
      pick,
      q,
      query,
      reread,
      ruleOpen,
      shown,
      stale,
      timeZone,
    ]
  );
  return <Store value={value}>{children}</Store>;
};
