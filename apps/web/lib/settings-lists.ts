import "server-only";
import { listCatalog } from "@metobe/core/catalog";
import { listMailboxes } from "@metobe/core/mailboxes";
import { listMyConnections } from "@metobe/core/mcp";
import type { MyServer } from "@metobe/core/mcp";
import { listProviders } from "@metobe/core/providers";
import { listProxies } from "@metobe/core/proxies";
import { listSources } from "@metobe/core/sources-read";
import type { SourceSummary } from "@metobe/core/sources-read";
import { listMembers } from "@metobe/core/users";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { standingDot, standingOf } from "@/lib/my-connections";
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
  state: "ok" | "warning" | "error" | "off" | "unchecked" | "none";
  count?: number;
  /** A heading the entry sits under; entries of a group come together. */
  group?: string;
  /** Instead of a logo: a kind's own picture (a mailbox's envelope). */
  icon?: "mail";
}

/** A group of the user's own connections of one kind, after the list's entries: its own «+», and a row when empty. */
export interface ListSection {
  title: string;
  add: { label: string; href: string };
  /** The row an empty section shows, leading to `add`. */
  empty: string;
  entries: ListEntry[];
}

export interface SettingsList {
  title: string;
  meta: string;
  add?: { label: string; href: string };
  entries: ListEntry[];
  sections?: ListSection[];
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

/** A person's dot: off when turned off, a warning while their mailbox is not checked, none otherwise. */
const memberState = (m: {
  disabledAt: Date | null;
  emailVerified: boolean;
}) => {
  if (m.disabledAt) {
    return "off" as const;
  }
  return m.emailVerified ? ("none" as const) : ("warning" as const);
};

/** What is off about a person, in words; nothing when nothing is. */
const memberNote = (
  m: { disabledAt: Date | null; emailVerified: boolean },
  t: Awaited<ReturnType<typeof getTranslations<"users">>>
) => {
  if (m.disabledAt) {
    return t("states.disabled");
  }
  return m.emailVerified ? null : t("states.unverified");
};

/** The people of the install by name, each with their role and address; «+» invites someone. */
const usersList = async (): Promise<SettingsList> => {
  const [rows, t] = await Promise.all([
    listMembers(),
    getTranslations("users"),
  ]);
  return {
    add: { href: "/settings/users/new", label: t("add") },
    entries: rows.map((m) => ({
      href: `/settings/users/${m.id}`,
      id: m.id,
      logo: undefined,
      state: memberState(m),
      sub: [memberNote(m, t), t(`roles.${m.role}`), m.email]
        .filter(Boolean)
        .join(" · "),
      title: m.name,
    })),
    meta: t("meta"),
    title: t("title"),
  };
};

/** The admin's catalog of MCP servers by name; each with its tools count, or that it wants a sign-in, or fails. */
const mcpList = async (): Promise<SettingsList> => {
  const [rows, t] = await Promise.all([
    listCatalog(),
    getTranslations("connections"),
  ]);
  return {
    add: { href: "/settings/mcp/new", label: t("add") },
    entries: rows.map((x) => {
      const auth = t(`auth.${x.config.auth}`);
      const h = x.health;
      let state: ListEntry["state"] = "unchecked";
      let sub = `${auth} · ${t("status.unchecked")}`;
      if (!x.enabled) {
        state = "off";
        sub = `${auth} · ${t("status.off")}`;
      } else if (h?.state === "ok") {
        state = "ok";
        sub = `${auth} · ${t("status.ok", { count: x.tools.length })}`;
      } else if (h) {
        state = "error";
        sub = `${auth} · ${t(h.state === "auth" ? "status.auth" : "status.error")}`;
      }
      return {
        href: `/settings/mcp/${x.id}`,
        id: x.id,
        logo: x.logo ?? undefined,
        state,
        sub,
        title: x.title,
      };
    }),
    meta: t("meta"),
    title: t("title"),
  };
};

/**
 * «Мои подключения»: the servers this user may use — their own per-user ones first, then the organization's — each
 * with where it stands: when it was last used, or what it needs.
 */
const connectionsList = async (userId: string): Promise<SettingsList> => {
  const [rows, boxes, t, tm, format] = await Promise.all([
    listMyConnections(userId),
    listMailboxes(userId),
    getTranslations("myConnections"),
    getTranslations("mail"),
    getFormatter(),
  ]);
  const now = new Date();
  const own = rows.filter((r) => r.mode === "per_user");
  const connected = own.filter((r) => r.connection?.status === "active").length;
  const entry = (r: MyServer): ListEntry => {
    const standing = standingOf(r);
    let sub = t(`standing.${standing}`);
    if (standing === "active") {
      sub = r.connection?.lastUsedAt
        ? t("used", { when: format.relativeTime(r.connection.lastUsedAt, now) })
        : t("notUsed");
    }
    return {
      group: r.mode === "shared" ? t("fromOrg") : undefined,
      href: `/settings/connections/${r.id}`,
      id: r.id,
      logo: r.logo ?? undefined,
      state: standingDot(standing),
      sub,
      title: r.title,
    };
  };
  // The user's own mailboxes, after the servers: each with when it was used, or what it needs.
  const mailSub = (b: (typeof boxes)[number]) => {
    if (b.status !== "active") {
      return tm(`status.${b.status}`);
    }
    return b.lastUsedAt
      ? t("used", { when: format.relativeTime(b.lastUsedAt, now) })
      : t("notUsed");
  };
  const mail = boxes.map((b): ListEntry => ({
    href: `/settings/connections/mail/${b.id}`,
    icon: "mail",
    id: b.id,
    logo: undefined,
    state: standingDot(b.status),
    sub: mailSub(b),
    title: b.address,
  }));
  const working = connected + boxes.filter((b) => b.status === "active").length;
  const total = own.length + boxes.length;
  return {
    entries: [...own, ...rows.filter((r) => r.mode === "shared")].map(entry),
    meta: total ? t("meta", { connected: working, total }) : t("metaEmpty"),
    sections: [
      {
        add: { href: "/settings/connections/mail/new", label: tm("list.add") },
        empty: tm("list.empty"),
        entries: mail,
        title: tm("list.group"),
      },
    ],
    title: t("title"),
  };
};

/** The lists this viewer may open: their own connections always, the service's lists for admins only. */
export const getSettingsLists = async (
  admin: boolean,
  userId: string | undefined
): Promise<SettingsLists> => {
  const connections = userId ? await connectionsList(userId) : undefined;
  if (!admin) {
    return connections ? { connections } : {};
  }
  const [sources, providers, proxies, mcp, users] = await Promise.all([
    sourcesList(),
    providersList(),
    proxiesList(),
    mcpList(),
    usersList(),
  ]);
  return { connections, mcp, providers, proxies, sources, users };
};
