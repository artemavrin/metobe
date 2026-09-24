"use client";

// Shared state for «Источники», «Провайдеры» and «Прокси»: sources (who gives access), providers (who made the model)
// and proxies (ways out to the internet, set up once and used where needed — ARCH §18).
import { useMemo, useState } from "react";

import { guessHostLogo, providerSlug, SOURCE_LOGO } from "../../_p7/brand";
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

export type ProxyType = "http" | "https" | "socks5" | "socks5h";
export type ProxyHealth =
  | { state: "ok"; latency: number; ip: string; country: string; checked: string }
  | { state: "error"; message: string }
  | { state: "checking" }
  | { state: "new" };
export type ProxyEntry = {
  id: string;
  title: string;
  type: ProxyType;
  /** host:port; empty for a proxy that is being created. */
  address: string;
  user?: string;
  /** «These addresses go through me»: sources on «Авто» whose API host matches. A domain covers its subdomains. */
  domains: string[];
  health: ProxyHealth;
  /** Requests per hour for the last day. */
  day: number[];
  failed: number;
};

/** API host of each source — what the domain rules match against. */
export const SOURCE_HOST: Record<ProviderKind, string> = {
  anthropic: "api.anthropic.com",
  compatible: "ollama",
  gateway: "ai-gateway.vercel.sh",
  openai: "api.openai.com",
  yandex: "llm.api.cloud.yandex.net",
};

export const COUNTRY: Record<string, { flag: string; name: string }> = {
  DE: { flag: "🇩🇪", name: "Германия" },
  FI: { flag: "🇫🇮", name: "Финляндия" },
  NL: { flag: "🇳🇱", name: "Нидерланды" },
};

const day = (seed: number, scale: number) => Array.from({ length: 24 }, (_, i) => Math.round(scale * (0.35 + 0.65 * Math.abs(Math.sin(seed + i * 0.55)))));

const seedProxies = (): ProxyEntry[] => [
  {
    address: "proxy.corp.local:3128",
    day: day(1, 90),
    domains: ["openai.com"],
    failed: 3,
    health: { checked: "3 мин назад", country: "DE", ip: "185.76.10.4", latency: 48, state: "ok" },
    id: "corp",
    title: "Корп-прокси",
    type: "http",
    user: "svc-purr",
  },
  {
    address: "51.15.0.7:1080",
    day: day(4, 12),
    domains: [],
    failed: 0,
    health: { checked: "1 ч назад", country: "NL", ip: "51.15.0.7", latency: 71, state: "ok" },
    id: "ams",
    title: "SOCKS Амстердам",
    type: "socks5h",
  },
];

/** The panel seed plus AI Gateway: one source that brings models of many providers — the case D29 is about. */
const seed = (): PanelProvider[] => [
  ...seedPanel().map((p) => (p.kind === "openai" ? { ...p, routeMode: "auto" } : p.kind === "anthropic" ? { ...p, routeMode: "ams" } : p)),
  {
    health: { checked: "1 мин назад", state: "ok" },
    keyTail: SAMPLE_KEYS.gateway.slice(-4),
    kind: "gateway",
    models: new Set(["google/gemini-3-pro", "google/gemini-3-flash", "alibaba/qwen3-max", "deepseek/deepseek-v3.2", "anthropic/claude-sonnet-5"]),
    route: { kind: "direct" },
    routeMode: "direct",
  },
];

const covers = (domain: string, host: string) => host === domain || host.endsWith(`.${domain}`);

export type Route = { proxy: ProxyEntry | null; why: "explicit" | "domain" | "direct" | "auto-direct"; domain?: string };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const useSettings = () => {
  const panel = usePanel(seed);
  const [overrides, setOverrides] = useState<Record<string, ProviderOverride>>({});
  const [proxies, setProxies] = useState<ProxyEntry[]>(seedProxies);
  const [sourceOverrides, setSourceOverrides] = useState<Partial<Record<ProviderKind, ProviderOverride>>>({});

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
    // Stable order: toggling a model must not move rows under the cursor.
    return [...map.values()].sort((a, b) => b.models.length - a.models.length || a.title.localeCompare(b.title));
  }, [panel.list, overrides]);

  const providerOf = (m: Model) => {
    const slug = providerSlug(m.vendor);
    return { logo: overrides[slug]?.logo ?? slug, slug, title: overrides[slug]?.title ?? m.vendor };
  };
  const setOverride = (slug: string, o: ProviderOverride) => setOverrides((all) => ({ ...all, [slug]: { ...all[slug], ...o } }));

  /** Name and logo of a source: the admin's choice, else the kind's logo; a compatible server is guessed from its URL. */
  const sourceOf = (kind: ProviderKind) => {
    const o = sourceOverrides[kind];
    const auto = kind === "compatible" ? guessHostLogo(panel.list.find((x) => x.kind === kind)?.extra) : SOURCE_LOGO[kind];
    return { auto, logo: o?.logo ?? auto, title: o?.title ?? providerBy(kind).title };
  };
  const setSourceOverride = (kind: ProviderKind, o: ProviderOverride) => setSourceOverrides((all) => ({ ...all, [kind]: { ...all[kind], ...o } }));

  /** ARCH §18: an explicit choice wins; on «Авто» the most specific matching domain picks the proxy; otherwise direct. */
  const routeOf = (p: PanelProvider): Route => {
    if (p.routeMode === "direct") return { proxy: null, why: "direct" };
    if (p.routeMode !== "auto") return { proxy: proxies.find((x) => x.id === p.routeMode) ?? null, why: "explicit" };
    const host = SOURCE_HOST[p.kind];
    const hits = proxies.flatMap((x) => x.domains.filter((d) => covers(d, host)).map((d) => ({ d, x }))).sort((a, b) => b.d.length - a.d.length);
    return hits[0] ? { domain: hits[0].d, proxy: hits[0].x, why: "domain" } : { proxy: null, why: "auto-direct" };
  };

  const patchProxy = (id: string, f: (x: ProxyEntry) => ProxyEntry) => setProxies((all) => all.map((x) => (x.id === id ? f(x) : x)));
  /** Real check: a request through the proxy to an IP echo service — external IP, country, latency. */
  const checkProxy = async (id: string, address?: string) => {
    const before = proxies.find((x) => x.id === id);
    const target = address ?? before?.address ?? "";
    patchProxy(id, (x) => ({ ...x, address: target, health: { state: "checking" } }));
    await wait(900);
    const prev = before?.health.state === "ok" ? before.health : null;
    patchProxy(id, (x) =>
      target.includes("bad") || !target.includes(":")
        ? { ...x, health: { message: "Прокси не ответил за 5 секунд: connect ETIMEDOUT", state: "error" } }
        : { ...x, health: { checked: "только что", country: prev?.country ?? "FI", ip: prev?.ip ?? "95.216.4.12", latency: prev?.latency ?? 63, state: "ok" } }
    );
  };
  const addProxy = () => {
    const id = `p${Date.now()}`;
    setProxies((all) => [...all, { address: "", day: Array(24).fill(0), domains: [], failed: 0, health: { state: "new" }, id, title: "Новый прокси", type: "http" }]);
    return id;
  };
  const removeProxy = (id: string) => {
    for (const p of panel.list) if (p.routeMode === id) panel.setRoute(p.kind, "direct");
    setProxies((all) => all.filter((x) => x.id !== id));
  };

  return { addProxy, checkProxy, overrides, panel, patchProxy, providerOf, providers, proxies, removeProxy, routeOf, setOverride, setSourceOverride, sourceOf };
};

export type Settings = ReturnType<typeof useSettings>;
