import {
  Factory,
  HardDrive,
  Info,
  Languages,
  Mail,
  Network,
  Palette,
  Plug,
  Search,
  Server,
  Shield,
  Sparkles,
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
  /** `user` — every user's own settings; `admin` — the service, shown to admins only. */
  scope: "user" | "admin";
  items: readonly NavItem[];
}

export const SETTINGS_NAV = [
  {
    items: [
      { icon: Palette, id: "appearance", kind: "screen" },
      { icon: Languages, id: "region", kind: "screen" },
    ],
    key: "account",
    scope: "user",
  },
  {
    items: [
      { icon: Server, id: "sources", kind: "list" },
      { icon: Factory, id: "providers", kind: "list" },
    ],
    key: "models",
    scope: "admin",
  },
  {
    items: [
      { icon: Plug, id: "connections", kind: "list" },
      { icon: Sparkles, id: "skills", kind: "list" },
      { icon: Search, id: "search", kind: "screen" },
    ],
    key: "tools",
    scope: "admin",
  },
  {
    items: [
      { icon: Users, id: "users", kind: "list" },
      { icon: Shield, id: "access", kind: "screen" },
    ],
    key: "team",
    scope: "admin",
  },
  {
    items: [
      { icon: Network, id: "proxies", kind: "list" },
      { icon: Mail, id: "mail", kind: "screen" },
      { icon: HardDrive, id: "storage", kind: "screen" },
      { icon: Info, id: "about", kind: "screen" },
    ],
    key: "system",
    scope: "admin",
  },
] as const satisfies readonly NavGroup[];

export type SettingsGroupKey = (typeof SETTINGS_NAV)[number]["key"];
export type SettingsSectionId =
  (typeof SETTINGS_NAV)[number]["items"][number]["id"];

const ALL = SETTINGS_NAV.flatMap((g) =>
  g.items.map((item) => ({ ...item, scope: g.scope }))
);

export const findSection = (id: string) => ALL.find((s) => s.id === id);

/** Admins see the service's settings; everyone sees their own. */
export const isAdminRole = (role: string | null | undefined) =>
  role === "superuser" || role === "admin";

export const canOpen = (id: string, admin: boolean) => {
  const section = findSection(id);
  return Boolean(section && (section.scope === "user" || admin));
};
