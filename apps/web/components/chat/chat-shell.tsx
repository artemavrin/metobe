"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@metobe/ui/components/sidebar";
import { useHotkey } from "@tanstack/react-hotkeys";
import { SquarePen } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { AccountMenu } from "@/components/chat/account-menu";
import type { Person } from "@/components/chat/account-menu";
import { groupChats } from "@/lib/chat-history";
import type { ChatGroup } from "@/lib/chat-history";

interface ChatItem {
  id: string;
  title: string;
  group: ChatGroup;
}

/**
 * Lets the chat screen put a chat on top of the list the moment it gets a message. A title names it (a new chat);
 * without one, the chat keeps the title it has.
 */
const ChatListContext = createContext<
  ((chat: { id: string; title?: string }) => void) | null
>(null);

/** The user's own choices for the chat that its screens read: which key sends a message. */
const ChatPrefsContext = createContext<{ sendKey: "enter" | "mod-enter" }>({
  sendKey: "enter",
});

export const useChatPrefs = () => useContext(ChatPrefsContext);

export const useTouchChat = () => {
  const touch = useContext(ChatListContext);
  if (!touch) {
    throw new Error("useTouchChat outside ChatShell");
  }
  return touch;
};

const Brand = () => (
  <span className="flex items-center gap-2 text-sm font-semibold">
    <span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md text-xs">
      M
    </span>
    Metobe
  </span>
);

const History = ({ chats }: { chats: ChatItem[] }) => {
  const t = useTranslations("chat");
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const groups = useMemo(() => groupChats(chats), [chats]);
  if (groups.length === 0) {
    return (
      <p className="text-muted-foreground px-4 py-2 text-sm">{t("noChats")}</p>
    );
  }
  return groups.map((g) => (
    <SidebarGroup className="py-1" key={g.group}>
      <SidebarGroupLabel>{t(`groups.${g.group}`)}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {g.chats.map((chat) => (
            <SidebarMenuItem key={chat.id}>
              <SidebarMenuButton
                isActive={pathname === `/chat/${chat.id}`}
                onClick={() => isMobile && setOpenMobile(false)}
                render={<Link href={`/chat/${chat.id}`} />}
              >
                <span className="truncate">{chat.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ));
};

const NewChat = () => {
  const t = useTranslations("chat");
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={() => isMobile && setOpenMobile(false)}
          render={<Link href="/" />}
        >
          <SquarePen /> <span>{t("newChat")}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};

/**
 * The chat's shell (P1 «Режимы»): a light floating sidebar with the user's chats by day, the chat beside it.
 * Settings are a place you visit: ⌘, opens them, and their own shell leads back here.
 */
export const ChatShell = ({
  chats: initialChats,
  user,
  sendKey,
  children,
}: {
  /** The user's chats, latest first, each in its day group by the user's calendar. */
  chats: ChatItem[];
  user: Person;
  /** The key that sends a message, as the user chose it. */
  sendKey: "enter" | "mod-enter";
  children: ReactNode;
}) => {
  const t = useTranslations("chat");
  const router = useRouter();
  const prefs = useMemo(() => ({ sendKey }), [sendKey]);
  const [chats, setChats] = useState(initialChats);
  // A fresh list from the server (a reload of the layout) replaces the local one.
  const [seen, setSeen] = useState(initialChats);
  if (seen !== initialChats) {
    setSeen(initialChats);
    setChats(initialChats);
  }
  const touch = useMemo(
    () => (chat: { id: string; title?: string }) =>
      setChats((list) => {
        const title = chat.title ?? list.find((c) => c.id === chat.id)?.title;
        return title === undefined
          ? list
          : [
              { group: "today" as const, id: chat.id, title },
              ...list.filter((c) => c.id !== chat.id),
            ];
      }),
    []
  );
  // ⌘, (Ctrl+, elsewhere) from anywhere, text fields included; the physical key, so ЙЦУКЕН works too.
  useHotkey("Mod+,", () => router.push("/settings"), { ignoreInputs: false });

  return (
    <ChatListContext.Provider value={touch}>
      <ChatPrefsContext.Provider value={prefs}>
        <SidebarProvider>
          <Sidebar variant="floating">
            <SidebarHeader>
              <div className="flex h-8 items-center px-1">
                <Brand />
              </div>
              <NewChat />
            </SidebarHeader>
            <SidebarContent>
              <History chats={chats} />
            </SidebarContent>
            <SidebarFooter>
              <AccountMenu user={user} />
            </SidebarFooter>
          </Sidebar>
          {/* One screen tall: the thread scrolls inside, the composer stays at the bottom */}
          <SidebarInset className="h-dvh min-h-0 overflow-hidden">
            <header className="flex h-12 shrink-0 items-center gap-2 px-3">
              <SidebarTrigger aria-label={t("openSidebar")} />
            </header>
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          </SidebarInset>
        </SidebarProvider>
      </ChatPrefsContext.Provider>
    </ChatListContext.Provider>
  );
};
