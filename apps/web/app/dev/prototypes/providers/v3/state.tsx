"use client";

// Shared state for «Источники» and «Провайдеры»: sources (who gives access) and providers (who made the model).
import { useMemo, useState } from "react";

import { providerSlug } from "../../_p7/brand";
import { type Model, type ProviderKind, providerBy, SAMPLE_KEYS } from "../../_p7/mock";
import { type PanelProvider, seedPanel, usePanel } from "../panel/common";

export type ProviderOverride = { title?: string; logo?: string };
export type ProviderInfo = {
  slug: string;
  title: string;
  logo: string;
  /** Every model of this provider across connected sources. */
  models: { model: Model; source: ProviderKind; on: boolean }[];
};

/** The panel seed plus AI Gateway: one source that brings models of many providers — the case D29 is about. */
const seed = (): PanelProvider[] => [
  ...seedPanel(),
  {
    health: { checked: "1 мин назад", state: "ok" },
    keyTail: SAMPLE_KEYS.gateway.slice(-4),
    kind: "gateway",
    models: new Set(["google/gemini-3-pro", "google/gemini-3-flash", "alibaba/qwen3-max", "deepseek/deepseek-v3.2", "anthropic/claude-sonnet-5"]),
    route: { kind: "direct" },
    routeMode: "direct",
  },
];

export const useSettings = () => {
  const panel = usePanel(seed);
  const [overrides, setOverrides] = useState<Record<string, ProviderOverride>>({});

  const providers = useMemo(() => {
    const map = new Map<string, ProviderInfo>();
    for (const s of panel.list) {
      for (const m of providerBy(s.kind).models) {
        const slug = providerSlug(m.vendor);
        const o = overrides[slug];
        const entry = map.get(slug) ?? { logo: o?.logo ?? slug, models: [], slug, title: o?.title ?? m.vendor };
        entry.models.push({ model: m, on: s.models.has(m.id) && s.enabled !== false && s.health.state !== "error", source: s.kind });
        map.set(slug, entry);
      }
    }
    return [...map.values()].sort((a, b) => b.models.filter((x) => x.on).length - a.models.filter((x) => x.on).length || a.title.localeCompare(b.title));
  }, [panel.list, overrides]);

  const providerOf = (m: Model) => {
    const slug = providerSlug(m.vendor);
    return { logo: overrides[slug]?.logo ?? slug, slug, title: overrides[slug]?.title ?? m.vendor };
  };
  const setOverride = (slug: string, o: ProviderOverride) => setOverrides((all) => ({ ...all, [slug]: { ...all[slug], ...o } }));

  return { overrides, panel, providerOf, providers, setOverride };
};

export type Settings = ReturnType<typeof useSettings>;
