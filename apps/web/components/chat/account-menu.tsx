"use client";

import { localeNames, locales } from "@metobe/i18n/config";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@metobe/ui/components/popover";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@metobe/ui/components/sheet";
import { SidebarMenuButton, useSidebar } from "@metobe/ui/components/sidebar";
import { cn } from "@metobe/ui/lib/utils";
import {
  ChartColumn,
  Languages,
  LogOut,
  Monitor,
  Moon,
  Plug,
  Settings,
  Sun,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import type { ComponentType, ReactNode } from "react";

import { signOut } from "@/app/(app)/(chat)/actions";
import { UserAvatar } from "@/components/user-avatar";
import { setLocale } from "@/lib/prefs-actions";

export interface Person {
  name: string;
  email: string;
  image: string | null;
  role: string;
}

const unsubscribe = (): void => undefined;
const noSubscribe = () => unsubscribe;

const THEMES = [
  { icon: Sun, id: "light" },
  { icon: Moon, id: "dark" },
  { icon: Monitor, id: "system" },
] as const;

const pill = (on: boolean) =>
  cn(
    "text-muted-foreground grid place-items-center rounded-md transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.95]",
    on ? "bg-background text-foreground shadow-xs" : "hover:text-foreground"
  );

/** The theme in one pill of three: light, dark, as the system. It applies at once; the menu stays open. */
const ThemePills = () => {
  const t = useTranslations("chat.account");
  const { theme, setTheme } = useTheme();
  // The theme is known only in the browser: until then no button looks pressed.
  const mounted = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false
  );
  return (
    <div className="bg-muted flex gap-0.5 rounded-lg p-0.5">
      {THEMES.map(({ id, icon: Icon }) => (
        <button
          aria-label={t(`themes.${id}`)}
          aria-pressed={mounted && theme === id}
          className={cn(pill(mounted && theme === id), "size-7")}
          key={id}
          onClick={() => setTheme(id)}
          title={t(`themes.${id}`)}
          type="button"
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
};

/** The languages in a pill of their own, by short code; the page re-renders in the chosen one. */
const LanguagePills = () => {
  const current = useLocale();
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <div className="bg-muted flex gap-0.5 rounded-lg p-0.5">
      {locales.map((l) => (
        <button
          aria-label={localeNames[l]}
          aria-pressed={current === l}
          className={cn(pill(current === l), "h-7 px-2.5 text-xs font-medium")}
          key={l}
          onClick={() =>
            start(async () => {
              await setLocale(l);
              router.refresh();
            })
          }
          title={localeNames[l]}
          type="button"
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
};

const rowClass =
  "hover:bg-muted focus-visible:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-hidden [&_svg]:size-4 [&_svg]:shrink-0";

const LinkRow = ({
  href,
  icon: Icon,
  onNavigate,
  children,
  shortcut,
}: {
  href: string;
  icon: ComponentType;
  onNavigate: () => void;
  children: ReactNode;
  shortcut?: string;
}) => (
  <Link className={rowClass} href={href} onClick={onNavigate}>
    <Icon />
    {children}
    {shortcut && (
      <span className="text-muted-foreground ml-auto text-xs">{shortcut}</span>
    )}
  </Link>
);

const Separator = () => <div className="bg-border -mx-1 my-1 h-px" />;

const MenuBody = ({
  user,
  onNavigate,
  keyboard,
}: {
  user: Person;
  onNavigate: () => void;
  /** Whether there is a keyboard to show the shortcut for. */
  keyboard: boolean;
}) => {
  const t = useTranslations("chat");
  const sections = useTranslations("settings.sections");
  return (
    <>
      <div className="flex items-center gap-2.5 px-2 py-2">
        <UserAvatar className="size-9" image={user.image} name={user.name} />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-medium">{user.name}</span>
          <span className="text-muted-foreground truncate text-xs">
            {user.email}
          </span>
        </span>
      </div>
      <Separator />
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <ThemePills />
        <div className="flex items-center gap-1.5">
          <Languages className="text-muted-foreground size-4" />
          <LanguagePills />
        </div>
      </div>
      <Separator />
      <LinkRow
        href="/settings"
        icon={Settings}
        onNavigate={onNavigate}
        shortcut={keyboard ? "⌘," : undefined}
      >
        {t("settings")}
      </LinkRow>
      <LinkRow href="/settings/connections" icon={Plug} onNavigate={onNavigate}>
        {sections("connections.label")}
      </LinkRow>
      <LinkRow
        href="/settings/usage"
        icon={ChartColumn}
        onNavigate={onNavigate}
      >
        {sections("usage.label")}
      </LinkRow>
      <Separator />
      <button className={rowClass} onClick={() => signOut()} type="button">
        <LogOut />
        {t("signOut")}
      </button>
    </>
  );
};

const TriggerFace = ({ user }: { user: Person }) => (
  <>
    <UserAvatar image={user.image} name={user.name} />
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="truncate text-sm font-medium">{user.name}</span>
      <span className="text-muted-foreground truncate text-xs">
        {user.role}
      </span>
    </span>
  </>
);

/**
 * The account menu of the sidebar (prototype «В одну строку»): who is signed in, the theme and the language side by
 * side — no submenus, each a click, the menu stays open — then the settings, the user's connections and usage, and
 * the way out. On a phone it is a sheet from the bottom.
 */
export const AccountMenu = ({ user }: { user: Person }) => {
  const { isMobile, setOpenMobile } = useSidebar();
  const [open, setOpen] = useState(false);
  const navigate = () => {
    setOpen(false);
    if (isMobile) {
      setOpenMobile(false);
    }
  };
  const trigger = (
    <SidebarMenuButton className="min-w-0" size="lg">
      <TriggerFace user={user} />
    </SidebarMenuButton>
  );
  if (isMobile) {
    return (
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetTrigger render={trigger} />
        <SheetContent className="gap-0 rounded-t-2xl p-3 pb-6" side="bottom">
          <SheetTitle className="sr-only">{user.name}</SheetTitle>
          <MenuBody keyboard={false} onNavigate={navigate} user={user} />
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger render={trigger} />
      <PopoverContent
        align="start"
        className="w-64 gap-0 p-1"
        side="top"
        sideOffset={8}
      >
        <MenuBody keyboard onNavigate={navigate} user={user} />
      </PopoverContent>
    </Popover>
  );
};
