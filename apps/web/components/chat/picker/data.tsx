"use client";

import { createContext, useContext, useMemo } from "react";

export { contextLabel as fmtContext } from "@/lib/model-format";

// The picker's data (P3): models that are in chat, as the server built them from what sources and our own runs
// report — nothing «recommended». Shared by the favorites picker, the palette and the peek.

export interface PickerCaps {
  tools: boolean | null;
  vision: boolean | null;
  reasoning: boolean | null;
}

export interface PickerModel {
  id: string;
  title: string;
  /** The maker's slug — the palette groups by it. */
  maker: string;
  makerTitle: string;
  /** The maker's logo for BrandLogo (a built-in key or an image); none — its letter. */
  logo: string | undefined;
  /** The source the model comes through. */
  source: string;
  context: number | null;
  caps: PickerCaps;
  /** Per 1M tokens. */
  price: {
    input: number;
    output: number;
    cacheRead?: number;
    currency: "USD" | "RUB";
  } | null;
  released: string | null;
  /** The median time to the first token in Metobe over 30 days, ms. */
  firstTokenMs: number | null;
}

/** The user's favorites in their order, with the changes that persist them. */
export interface Favorites {
  ids: string[];
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  /** A new order; the numbers ⌘1–9 follow it. */
  reorder: (next: string[]) => void;
  /** Takes several out at once (a picker's soft un-stars, applied on close). */
  removeMany: (drop: string[]) => void;
}

interface PickerData {
  models: PickerModel[];
  /** The models the user ran last, most recent first. */
  recent: string[];
}

const PickerDataContext = createContext<PickerData | null>(null);

export const PickerDataProvider = ({
  models,
  recent,
  children,
}: PickerData & { children: React.ReactNode }) => {
  const value = useMemo(() => ({ models, recent }), [models, recent]);
  return (
    <PickerDataContext.Provider value={value}>
      {children}
    </PickerDataContext.Provider>
  );
};

export const usePickerData = () => {
  const data = useContext(PickerDataContext);
  if (!data) {
    throw new Error("usePickerData outside PickerDataProvider");
  }
  return useMemo(() => {
    const byId = new Map(data.models.map((m) => [m.id, m]));
    const count = new Map<string, number>();
    for (const m of data.models) {
      const t = m.title.toLowerCase();
      count.set(t, (count.get(t) ?? 0) + 1);
    }
    return {
      ...data,
      byId: (id: string) => byId.get(id),
      exists: (id: string) => byId.has(id),
      /** Titles that come from more than one source: only those rows name their source. */
      sameTitle: (title: string) => (count.get(title.toLowerCase()) ?? 0) > 1,
    };
  }, [data]);
};
