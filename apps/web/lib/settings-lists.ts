import "server-only";
import { listProviders } from "@metobe/core/providers";
import { listProxies } from "@metobe/core/proxies";
import { listSources } from "@metobe/core/sources-read";
import type { SourceSummary } from "@metobe/core/sources-read";
import { getLocale, getTranslations } from "next-intl/server";

import { flagOf } from "@/lib/proxy-flag";
import type { SettingsSectionId } from "@/lib/settings-nav";
import { sourceLogo } from "@/lib/source-logo";

// What a list section shows in the sidebar once you drill into it (P7 «Погружение»): rows prepared on the server,
// texts already in the user's language, so the shell only lays them out.

export interface ListEntry {
  id: string;
  href: string;
  title: string;
  logo: string | undefined;
  /** Instead of a logo: the exit country's flag (proxies), or a network mark when there is no country yet. */
  mark?: { flag: string | null };
  /** The line under the title: the state in words. */
  sub: string;
  /** Drives the dot; `none` — no dot (lists without a state, such as providers). */
  state: "ok" | "error" | "off" | "unchecked" | "none";
  count?: number;
}

export interface SettingsList {
  title: string;
  meta: string;
  add?: { label: string; href: string };
  entries: ListEntry[];
}

export type SettingsLists = Partial<Record<SettingsSectionId, SettingsList>>;

type T = Awaited<ReturnType<typeof getTranslations<"sources">>>;

const sourceStatus = (
  s: SourceSummary,
  t: T
): Pick<ListEntry, "state" | "sub"> => {
  if (!s.enabled) {
    return { state: "off", sub: t("status.off") };
  }
  const h = s.health;
  if (!h) {
    return { state: "unchecked", sub: t("status.unchecked") };
  }
  if (h.state === "ok") {
    return {
      state: "ok",
      sub:
        h.latencyMs === undefined
          ? t("status.ok")
          : t("status.okLatency", { ms: h.latencyMs }),
    };
  }
  const sub = {
    auth: () => t("status.auth"),
    http: () => t("status.http", { status: h.status ?? "" }),
    invalid: () => t("status.invalid"),
    "not-found": () => t("status.notFound"),
    unreachable: () => t("status.unreachable"),
  }[h.reason ?? "unreachable"]();
  return { state: "error", sub };
};

/** Models a source puts into chat right now: none while it is off or failing. */
export const modelsInChat = (s: SourceSummary) =>
  s.enabled && s.health?.state !== "error" ? s.modelsEnabled : 0;

const sourcesList = async (): Promise<SettingsList> => {
  const [rows, t] = await Promise.all([
    listSources(),
    getTranslations("sources"),
  ]);
  return {
    // Opens over whatever source is open now.
    add: { href: "?connect=1", label: t("add") },
    entries: rows.map((s) => ({
      count: modelsInChat(s),
      href: `/settings/sources/${s.id}`,
      id: s.id,
      logo: sourceLogo(s),
      title: s.title,
      ...sourceStatus(s, t),
    })),
    meta: t("meta", {
      models: rows.reduce((sum, s) => sum + modelsInChat(s), 0),
      sources: rows.length,
    }),
    title: t("title"),
  };
};

/** Makers of the models, most models first; a maker is listed while any source carries its models. */
const providersList = async (): Promise<SettingsList> => {
  const [rows, t] = await Promise.all([
    listProviders(),
    getTranslations("providers"),
  ]);
  return {
    entries: rows.map((p) => ({
      count: p.modelsEnabled,
      href: `/settings/providers/${p.id}`,
      id: p.id,
      logo: p.logo ?? undefined,
      state: "none",
      sub: t("inChat", { on: p.modelsEnabled, total: p.modelsTotal }),
      title: p.title,
    })),
    meta: t("meta"),
    title: t("title"),
  };
};

/** Proxies in the order they were added; each with its exit country, latency, or why it fails. */
const proxiesList = async (): Promise<SettingsList> => {
  const [rows, t, locale] = await Promise.all([
    listProxies(),
    getTranslations("proxies"),
    getLocale(),
  ]);
  const countries = new Intl.DisplayNames([locale], { type: "region" });
  return {
    add: { href: "/settings/proxies/new", label: t("add") },
    entries: rows.map((x) => {
      const h = x.health;
      const kind = x.type.toUpperCase();
      let state: ListEntry["state"] = "unchecked";
      let sub = `${kind} · ${t("status.unchecked")}`;
      if (!x.enabled) {
        state = "off";
        sub = `${kind} · ${t("status.off")}`;
      } else if (h?.state === "ok") {
        state = "ok";
        const where = h.country ? countries.of(h.country) : h.ip;
        sub = `${kind} · ${[where, h.latencyMs === undefined ? null : t("status.ms", { ms: h.latencyMs })].filter(Boolean).join(" · ")}`;
      } else if (h?.state === "error") {
        state = "error";
        sub = `${kind} · ${t("status.error")}`;
      }
      return {
        href: `/settings/proxies/${x.id}`,
        id: x.id,
        logo: undefined,
        mark: { flag: h?.state === "ok" ? flagOf(h.country) : null },
        state,
        sub,
        title: x.title,
      };
    }),
    meta: t("meta"),
    title: t("title"),
  };
};

/** The lists this viewer may open; the service's lists are for admins only. */
export const getSettingsLists = async (
  admin: boolean
): Promise<SettingsLists> => {
  if (!admin) {
    return {};
  }
  const [sources, providers, proxies] = await Promise.all([
    sourcesList(),
    providersList(),
    proxiesList(),
  ]);
  return { providers, proxies, sources };
};
