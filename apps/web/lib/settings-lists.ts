import "server-only";
import { listSources } from "@metobe/core/sources-read";
import type { SourceSummary } from "@metobe/core/sources-read";
import { getTranslations } from "next-intl/server";

import type { SettingsSectionId } from "@/lib/settings-nav";
import { sourceLogo } from "@/lib/source-logo";

// What a list section shows in the sidebar once you drill into it (P7 «Погружение»): rows prepared on the server,
// texts already in the user's language, so the shell only lays them out.

export interface ListEntry {
  id: string;
  href: string;
  title: string;
  logo: string | undefined;
  /** The line under the title: the state in words. */
  sub: string;
  state: "ok" | "error" | "off" | "unchecked";
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

/** The lists this viewer may open; the service's lists are for admins only. */
export const getSettingsLists = async (
  admin: boolean
): Promise<SettingsLists> => (admin ? { sources: await sourcesList() } : {});
