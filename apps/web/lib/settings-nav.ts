import {
  Blocks,
  ChartColumn,
  ChartColumnStacked,
  Cog,
  Factory,
  Gauge,
  HardDrive,
  Info,
  Mail,
  Network,
  Paperclip,
  Plug,
  Search,
  Server,
  Shield,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  UserRound,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// The settings menu as data: the sidebar walks it, routes are /settings/{id}, labels come from the messages by id,
// and the server checks access against it. Adding a section = an item here, its messages, a page folder.

interface NavItem {
  id: string;
  icon: LucideIcon;
  /** `list` opens a list of entries (drill-in sidebar, chevron); `screen` is a single page. */
  kind: "screen" | "list";
}
interface NavGroup {
  key: string;
  /**
   * `user` — every user's own settings; `org` — the organization's, for its owner and admins; `platform` — the
   * install's, for the superuser and the install's admins (ORGS-PLAN §9).
   */
  scope: "user" | "org" | "platform";
  items: readonly NavItem[];
}

export const SETTINGS_NAV = [
  {
    items: [
      { icon: UserRound, id: "account", kind: "screen" },
      { icon: Plug, id: "connections", kind: "list" },
      { icon: ChartColumn, id: "usage", kind: "screen" },
      { icon: Paperclip, id: "files", kind: "screen" },
      { icon: Sparkles, id: "my-skills", kind: "screen" },
    ],
    key: "account",
    scope: "user",
  },
  {
    items: [
      { icon: Users, id: "users", kind: "list" },
      { icon: Shield, id: "access", kind: "screen" },
      { icon: ShieldCheck, id: "privacy", kind: "screen" },
    ],
    key: "team",
    scope: "org",
  },
  {
    items: [
      { icon: Blocks, id: "mcp", kind: "list" },
      { icon: Sparkles, id: "skills", kind: "screen" },
    ],
    key: "orgTools",
    scope: "org",
  },
  {
    items: [
      { icon: Server, id: "sources", kind: "list" },
      { icon: Factory, id: "providers", kind: "list" },
      { icon: Cog, id: "service", kind: "screen" },
    ],
    key: "models",
    scope: "platform",
  },
  {
    items: [
      { icon: Search, id: "search", kind: "screen" },
      { icon: SquareTerminal, id: "sandbox", kind: "screen" },
    ],
    key: "tools",
    scope: "platform",
  },
  {
    items: [
      { icon: Gauge, id: "limits", kind: "screen" },
      { icon: ChartColumnStacked, id: "team-usage", kind: "screen" },
    ],
    key: "spend",
    scope: "platform",
  },
  {
    items: [
      { icon: Network, id: "proxies", kind: "list" },
      { icon: Mail, id: "mail", kind: "screen" },
      { icon: HardDrive, id: "storage", kind: "screen" },
      { icon: Info, id: "about", kind: "screen" },
    ],
    key: "system",
    scope: "platform",
  },
] as const satisfies readonly NavGroup[];

export type SettingsGroupKey = (typeof SETTINGS_NAV)[number]["key"];
export type SettingsSectionId =
  (typeof SETTINGS_NAV)[number]["items"][number]["id"];

const ALL = SETTINGS_NAV.flatMap((g) =>
  g.items.map((item) => ({ ...item, scope: g.scope }))
);

export const findSection = (id: string) => ALL.find((s) => s.id === id);

export type SettingsScope = (typeof SETTINGS_NAV)[number]["scope"];

/** Which groups of the menu a viewer has: their own always, the organization's and the platform's by role. */
export interface SettingsAccess {
  /** Owner or admin of the organization. */
  orgManager: boolean;
  /** Superuser or admin of the install. */
  platform: boolean;
}

/** The superuser and the install's admins run the platform. */
export const isAdminRole = (role: string | null | undefined) =>
  role === "superuser" || role === "admin";

export const canSee = (scope: SettingsScope, access: SettingsAccess) =>
  scope === "user" || (scope === "org" ? access.orgManager : access.platform);

export const canOpen = (id: string, access: SettingsAccess) => {
  const section = findSection(id);
  return Boolean(section && canSee(section.scope, access));
};
