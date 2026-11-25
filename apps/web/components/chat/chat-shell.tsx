"use client";

import type { WhatsNew } from "@metobe/core/whats-new";
import { Button } from "@metobe/ui/components/button";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@metobe/ui/components/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@metobe/ui/components/tooltip";
import { useHotkey } from "@tanstack/react-hotkeys";
import { BookUser, CalendarClock, ChevronRight, SquarePen } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

import {
  deleteChatAction,
  memoryOffChatAction,
  pinChatAction,
  renameChatAction,
} from "@/app/(app)/(chat)/actions";
import { sidebarTasksAction } from "@/app/(app)/(chat)/tasks/actions";
import { AccountMenu } from "@/components/chat/account-menu";
import type { Person } from "@/components/chat/account-menu";
import { ChatHeader } from "@/components/chat/chat-header";
import { ChatRow } from "@/components/chat/chat-item";
import type { ChatItem, ChatOps } from "@/components/chat/chat-item";
import {
  CompactBridgeProvider,
  useCompactBridgeValue,
} from "@/components/chat/compact-bridge";
import { FilePanelHost } from "@/components/chat/file-panel";
import { ShareDialog } from "@/components/chat/share-dialog";
import { SidebarResizer } from "@/components/chat/sidebar-resizer";
import { SidebarSearch } from "@/components/chat/sidebar-search";
import { TopBarSlot } from "@/components/chat/top-bar";
import { MemoryListLevel } from "@/components/memory/memory-list";
import { MemoryStoreProvider } from "@/components/memory/memory-store";
import { TaskDot } from "@/components/tasks/task-dot";
import { TasksListLevel } from "@/components/tasks/task-level";
import type { SidebarTask } from "@/components/tasks/task-level";
import { useTaskEvents } from "@/components/tasks/use-task-events";
import { groupChats } from "@/lib/chat-history";
import { levelMotion } from "@/lib/level-motion";
import type { SettingsAccess } from "@/lib/settings-nav";

const NO_NEWS: WhatsNew = { latest: null, show: null };

// Loaded when it first opens: the demos bring the thread's map, the sky and the question panel along.
const WhatsNewDialog = dynamic(
  async () => {
    const mod = await import("@/components/whats-new/whats-new");
    return mod.WhatsNewDialog;
  },
  { ssr: false }
);

/**
 * Lets the chat screen put a chat on top of the list the moment it gets a message. A title names it (a new chat);
 * without one, the chat keeps the title it has.
 */
const ChatListContext = createContext<
  ((chat: { id: string; title?: string; naming?: boolean }) => void) | null
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

/** The brand leads home, as everywhere: to a new chat. */
const Brand = () => {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <Link
      className="focus-visible:ring-ring/60 flex items-center gap-2 rounded-md text-sm font-semibold outline-none focus-visible:ring-2"
      href="/"
      onClick={() => isMobile && setOpenMobile(false)}
    >
      <span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md text-xs">
        M
      </span>
      Metobe
    </Link>
  );
};

const History = ({ chats, ops }: { chats: ChatItem[]; ops: ChatOps }) => {
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
    // The pinned stand apart from the days: more air under them than between the days.
    <SidebarGroup
      className={g.group === "pinned" ? "pt-1 pb-4" : "py-1"}
      key={g.group}
    >
      <SidebarGroupLabel>{t(`groups.${g.group}`)}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {g.chats.map((chat) => (
            <ChatRow
              active={pathname === `/chat/${chat.id}`}
              chat={chat}
              key={chat.id}
              onNavigate={() => isMobile && setOpenMobile(false)}
              ops={ops}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ));
};

/** A task in the sidebar: the ones that wait for the person (a result not seen, a question, an action), and the open one. */
const NO_TASKS: SidebarTask[] = [];

/**
 * «Задачи» and under it only the tasks that wait for the person, each with a dot, plus the one open now (D24). Seen
 * to, a task leaves the list; all of them are on the «Задачи» page.
 */
const Tasks = ({ tasks }: { tasks: SidebarTask[] }) => {
  const t = useTranslations("tasks");
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const close = () => isMobile && setOpenMobile(false);
  const shown = tasks.filter(
    (task) => task.waiting || pathname === `/tasks/${task.id}`
  );
  return (
    <SidebarGroup className="py-1">
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname === "/tasks"}
              onClick={close}
              render={<Link href="/tasks" />}
            >
              <CalendarClock />
              <span>{t("nav")}</span>
              <ChevronRight className="text-muted-foreground ml-auto size-3.5" />
            </SidebarMenuButton>
            {shown.length > 0 && (
              <SidebarMenuSub>
                {shown.map((task) => (
                  <SidebarMenuSubItem key={task.id}>
                    <SidebarMenuSubButton
                      isActive={pathname === `/tasks/${task.id}`}
                      onClick={close}
                      render={<Link href={`/tasks/${task.id}`} />}
                    >
                      <TaskDot color={task.color} ringing={task.waiting} />
                      <span className="min-w-0 flex-1 truncate">
                        {task.name}
                      </span>
                      {task.waiting && (
                        <span className="sr-only">, {t("waiting")}</span>
                      )}
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};

/** «Память» under «Задачи» — only while the memory is on (ARCH §19.1). */
const Memory = () => {
  const t = useTranslations("memory");
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarGroup className="py-0">
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname === "/memory"}
              onClick={() => isMobile && setOpenMobile(false)}
              render={<Link href="/memory" />}
            >
              <BookUser />
              <span>{t("nav")}</span>
              <ChevronRight className="text-muted-foreground ml-auto size-3.5" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};

/** «Новый чат» as an icon beside the brand: the header stays one line, the search right under it. */
const NewChat = () => {
  const t = useTranslations("chat");
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <Tooltip>
      <TooltipTrigger
        delay={500}
        render={
          <Button
            aria-label={t("newChat")}
            className="text-muted-foreground hover:text-foreground"
            nativeButton={false}
            onClick={() => isMobile && setOpenMobile(false)}
            render={<Link href="/" />}
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <SquarePen />
      </TooltipTrigger>
      <TooltipContent
        arrow={false}
        className="bg-sidebar text-foreground ring-foreground/10 shadow-md ring-1"
        sideOffset={6}
      >
        {t("newChat")}
      </TooltipContent>
    </Tooltip>
  );
};

type Level = "chats" | "memory" | "tasks";

/**
 * On a memory or a task page the sidebar goes one level in, to that section's list (as the settings go into a list); the
 * slide follows the way: in from the right, back to the left.
 */
const useSidebarLevel = (memory: boolean, pathname: string) => {
  const reduce = Boolean(useReducedMotion());
  let level: Level = "chats";
  if (memory && pathname.startsWith("/memory")) {
    level = "memory";
  } else if (pathname.startsWith("/tasks")) {
    level = "tasks";
  }
  const [was, setWas] = useState(level);
  const [dir, setDir] = useState(1);
  if (was !== level) {
    setWas(level);
    setDir(level === "chats" ? -1 : 1);
  }
  return { dir, level, reduce };
};

/**
 * The chat's shell (P1 «Режимы»): a light floating sidebar with the user's chats by day, the chat beside it.
 * Settings are a place you visit: ⌘, opens them, and their own shell leads back here.
 */
export const ChatShell = ({
  chats: initialChats,
  tasks = NO_TASKS,
  memory = false,
  admin,
  settings,
  user,
  sendKey,
  sidebarWidth = null,
  timeZone = "UTC",
  whatsNew = NO_NEWS,
  children,
}: {
  /** The user's chats, latest first, each in its day group by the user's calendar. */
  chats: ChatItem[];
  /** The user's periodic tasks; the sidebar shows the ones that wait for them. */
  tasks?: SidebarTask[];
  /** The memory is on: «Память» stands under «Задачи». */
  memory?: boolean;
  admin: boolean;
  /** The search offers the settings sections of the groups the person has. */
  settings: SettingsAccess;
  user: Person;
  /** The key that sends a message, as the user chose it. */
  sendKey: "enter" | "mod-enter";
  /** The sidebar's width as the person dragged it, in px; null — the default. */
  sidebarWidth?: number | null;
  /** The person's zone, for the days of the memory's deadlines. */
  timeZone?: string;
  /** «Что нового»: the window to open now, after an update, and the notes the account menu reads again. */
  whatsNew?: WhatsNew;
  children: ReactNode;
}) => {
  const t = useTranslations("chat");
  const router = useRouter();
  const prefs = useMemo(() => ({ sendKey }), [sendKey]);
  const [chats, setChats] = useState(initialChats);
  // As dragged: the handle moves the CSS variable itself while it is held and tells here when it is let go.
  const [barWidth, setBarWidth] = useState(sidebarWidth);
  const [whatsNewOpen, setWhatsNewOpen] = useState(Boolean(whatsNew.show));
  const notes = whatsNew.show ?? whatsNew.latest;
  // A fresh list from the server (a reload of the layout) replaces the local one.
  const [seen, setSeen] = useState(initialChats);
  if (seen !== initialChats) {
    setSeen(initialChats);
    setChats(initialChats);
  }
  const touch = useMemo(
    () => (chat: { id: string; title?: string; naming?: boolean }) =>
      setChats((list) => {
        const known = list.find((c) => c.id === chat.id);
        const title = chat.title ?? known?.title;
        // Whether the chat is being named: what is said now, else what it was.
        const naming = chat.naming ?? known?.naming;
        if (known?.group === "pinned") {
          // A pinned chat keeps its place; only its title may change.
          return title === undefined
            ? list
            : list.map((c) => (c.id === chat.id ? { ...c, naming, title } : c));
        }
        return title === undefined
          ? list
          : [
              { group: "today" as const, id: chat.id, naming, title },
              ...list.filter((c) => c.id !== chat.id),
            ];
      }),
    []
  );
  const pathname = usePathname();
  const { dir, level, reduce } = useSidebarLevel(memory, pathname);
  // The tasks the same way as the chats; on a page that does not look at tasks the shell asks for them itself.
  const [taskRows, setTaskRows] = useState(tasks);
  const [seenTasks, setSeenTasks] = useState(tasks);
  if (seenTasks !== tasks) {
    setSeenTasks(tasks);
    setTaskRows(tasks);
  }
  const looksAtTasks = pathname.startsWith("/tasks");
  const readTasks = useCallback(async () => {
    const next = await sidebarTasksAction();
    if (next) {
      setTaskRows(next);
    }
  }, []);
  // The server says when tasks move (task-events); the pages of tasks read the layout again by themselves. Besides, once
  // a minute, in case a word was lost.
  useTaskEvents(() => {
    if (!looksAtTasks) {
      readTasks();
    }
  });
  useEffect(() => {
    if (looksAtTasks) {
      return;
    }
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        readTasks();
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, [looksAtTasks, readTasks]);
  // «Поделиться чатом» — from the chat's menu in the sidebar or from the header of the chat on screen.
  const [sharingId, setSharingId] = useState<string | null>(null);
  const sharing = chats.find((c) => c.id === sharingId) ?? null;
  const current = chats.find((c) => pathname === `/chat/${c.id}`);
  // Where a page that is not a chat puts its title and main button (TopBar).
  const [topBar, setTopBar] = useState<HTMLElement | null>(null);
  // Rename and delete show at once and tell the server; pinning waits for the server's list, which knows the
  // day a chat goes back to. A refused change is put right by reading the list again.
  const compactBridge = useCompactBridgeValue();
  const ops = useMemo<ChatOps>(() => {
    const settle = async (task: Promise<{ ok: boolean }>) => {
      const result = await task;
      if (!result.ok) {
        router.refresh();
      }
    };
    return {
      // Runs in the open chat's thread, which holds its messages (components/chat/compact-bridge).
      compact: () => compactBridge.request(),
      memoryOff: memory
        ? (id, off) => {
            setChats((list) =>
              list.map((c) => (c.id === id ? { ...c, memoryOff: off } : c))
            );
            settle(memoryOffChatAction(id, off));
          }
        : undefined,
      pin: (id, pinned) => {
        settle(pinChatAction(id, pinned));
      },
      remove: (id) => {
        setChats((list) => list.filter((c) => c.id !== id));
        if (pathname === `/chat/${id}`) {
          router.push("/");
        }
        settle(deleteChatAction(id));
      },
      rename: (id, title) => {
        setChats((list) =>
          list.map((c) => (c.id === id ? { ...c, title } : c))
        );
        settle(renameChatAction(id, title));
      },
      share: (id) => setSharingId(id),
    };
  }, [compactBridge, memory, pathname, router]);
  // ⌘, (Ctrl+, elsewhere) from anywhere, text fields included; the physical key, so ЙЦУКЕН works too.
  useHotkey("Mod+,", () => router.push("/settings"), { ignoreInputs: false });

  return (
    <MemoryStoreProvider timeZone={timeZone}>
      <ChatListContext.Provider value={touch}>
        <ChatPrefsContext.Provider value={prefs}>
          <CompactBridgeProvider value={compactBridge}>
            <SidebarProvider
              style={
                barWidth
                  ? ({
                      "--sidebar-width": `${barWidth}px`,
                    } as React.CSSProperties)
                  : undefined
              }
            >
              <Sidebar variant="floating">
                <div className="relative min-h-0 flex-1 overflow-hidden">
                  <AnimatePresence custom={dir} initial={false}>
                    <motion.div
                      className="absolute inset-0 flex flex-col"
                      custom={dir}
                      key={level}
                      {...levelMotion(reduce)}
                    >
                      {level === "memory" && <MemoryListLevel />}
                      {level === "tasks" && <TasksListLevel tasks={taskRows} />}
                      {level === "chats" && (
                        <>
                          <SidebarHeader>
                            <div className="flex h-8 items-center justify-between ps-2">
                              <Brand />
                              <NewChat />
                            </div>
                          </SidebarHeader>
                          <SidebarContent>
                            {/* The search on top, as everywhere; while it is searching its results take the place of tasks and chats. */}
                            <SidebarSearch
                              chats={chats}
                              memory={memory}
                              settings={settings}
                            >
                              <Tasks tasks={taskRows} />
                              {memory && <Memory />}
                              <History chats={chats} ops={ops} />
                            </SidebarSearch>
                          </SidebarContent>
                        </>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
                <SidebarFooter>
                  <AccountMenu
                    whatsNew={
                      notes
                        ? {
                            open: () => setWhatsNewOpen(true),
                            version: notes.version,
                          }
                        : undefined
                    }
                    user={user}
                  />
                </SidebarFooter>
                <SidebarResizer onCommit={setBarWidth} width={barWidth} />
              </Sidebar>
              {/* One screen tall: the thread scrolls inside, the composer stays at the bottom */}
              {/* The file panel (P33/P34) stands beside the inset, the full height, as the sidebar does on the left. */}
              <FilePanelHost>
                <SidebarInset className="h-dvh min-h-0 min-w-0 overflow-hidden">
                  <header className="flex h-12 shrink-0 items-center gap-2 px-3">
                    <SidebarTrigger aria-label={t("openSidebar")} />
                    {/* Only on the user's own chat: a chat shared with them is theirs to read, not to rename or share.
                    Any other page fills the bar itself, through <TopBar>. */}
                    {current ? (
                      <ChatHeader chat={current} key={current.id} ops={ops} />
                    ) : (
                      <div
                        className="flex min-w-0 flex-1 items-center gap-2"
                        ref={setTopBar}
                      />
                    )}
                  </header>
                  <TopBarSlot value={current ? null : topBar}>
                    <div className="flex min-h-0 flex-1 flex-col">
                      {children}
                    </div>
                  </TopBarSlot>
                </SidebarInset>
              </FilePanelHost>
              {notes && whatsNewOpen && (
                <WhatsNewDialog
                  admin={admin}
                  note={notes}
                  onOpenChange={setWhatsNewOpen}
                  open={whatsNewOpen}
                />
              )}
              <ShareDialog
                chat={sharing}
                onOpenChange={(open) => {
                  if (!open) {
                    setSharingId(null);
                  }
                }}
                onShared={(id, shared) =>
                  setChats((list) =>
                    list.map((c) => (c.id === id ? { ...c, shared } : c))
                  )
                }
              />
            </SidebarProvider>
          </CompactBridgeProvider>
        </ChatPrefsContext.Provider>
      </ChatListContext.Provider>
    </MemoryStoreProvider>
  );
};
