"use client";

import { SidebarInput, useSidebar } from "@metobe/ui/components/sidebar";
import { CalendarClock, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useState } from "react";

import {
  KindTile,
  ListHeader,
  ListLabel,
  ListRow,
  useListHighlight,
} from "@/components/sidebar-list";
import { TaskDot } from "@/components/tasks/task-dot";

// The tasks' level of the app's sidebar (as the memory's and the settings' lists are): on a task page the sidebar goes
// one level in — «‹ Чаты», the title, a «+» for a new task, and every task with its colour, when it runs, and a ring
// while it waits for the person. The page «Задания по расписанию» (the overview) is the first row.

/** A task in the sidebar. */
export interface SidebarTask {
  id: string;
  name: string;
  color: string;
  /** A result not seen, a question, an action: the task waits for the person. */
  waiting: boolean;
  /** Switched on; off, it runs no more. */
  enabled: boolean;
  /** A run is on its way. */
  going: boolean;
  /** When it runs, in words. */
  schedule: string;
}

/** Lists longer than this get a search. */
const SEARCH_FROM = 6;

const TaskEntry = ({
  task,
  active,
  onPick,
}: {
  task: SidebarTask;
  active: boolean;
  onPick: () => void;
}) => {
  const t = useTranslations("tasks");
  let sub = task.schedule;
  let state: "ok" | "warning" | "off" | "none" = "none";
  if (!task.enabled) {
    sub = t("off");
    state = "off";
  } else if (task.waiting) {
    sub = t("waiting");
    state = "warning";
  } else if (task.going) {
    sub = t("running");
    state = "ok";
  }
  return (
    <ListRow
      active={active}
      entryKey={task.id}
      href={`/tasks/${task.id}`}
      leading={
        <KindTile>
          <TaskDot color={task.color} ringing={task.waiting} />
        </KindTile>
      }
      onClick={onPick}
      state={state}
      sub={sub}
      title={task.name}
    />
  );
};

export const TasksListLevel = ({ tasks }: { tasks: SidebarTask[] }) => {
  const t = useTranslations("tasks");
  const chats = useTranslations("chat.search");
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const found = q
    ? tasks.filter((task) => task.name.toLowerCase().includes(q))
    : tasks;
  const waiting = found.filter((task) => task.enabled && task.waiting);
  const rest = found.filter((task) => task.enabled && !task.waiting);
  const off = found.filter((task) => !task.enabled);
  const open = /^\/tasks\/(?<id>[^/]+)/u.exec(pathname)?.groups?.id;
  const activeKey = pathname === "/tasks" ? "overview" : open;
  const { highlight, ref } = useListHighlight(activeKey);
  const close = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };
  const group = (title: string | null, of: SidebarTask[]) =>
    of.length > 0 && (
      <>
        {title && <ListLabel title={title} />}
        {of.map((task) => (
          <TaskEntry
            active={task.id === activeKey}
            key={task.id}
            onPick={close}
            task={task}
          />
        ))}
      </>
    );
  return (
    <>
      <ListHeader
        add={{
          href: "/tasks/new",
          label: t("list.new"),
          onClick: close,
        }}
        back={{ href: "/", label: chats("chats"), onClick: close }}
        meta={t("list.meta", {
          count: tasks.length,
          waiting: tasks.filter((task) => task.enabled && task.waiting).length,
        })}
        title={t("title")}
      >
        {tasks.length > SEARCH_FROM && (
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2" />
            <SidebarInput
              aria-label={t("list.search")}
              autoComplete="off"
              className="pl-8"
              data-1p-ignore
              data-lpignore="true"
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("list.search")}
              value={query}
            />
          </div>
        )}
      </ListHeader>
      <div className="min-h-0 flex-1 overflow-y-auto pt-1">
        <nav className="relative flex flex-col gap-0.5 px-2 pb-3" ref={ref}>
          {highlight}
          {!q && (
            <ListRow
              active={activeKey === "overview"}
              entryKey="overview"
              href="/tasks"
              leading={
                <KindTile>
                  <CalendarClock />
                </KindTile>
              }
              onClick={close}
              title={t("list.overview")}
            />
          )}
          {group(t("list.waitingGroup"), waiting)}
          {group(waiting.length > 0 ? t("list.restGroup") : null, rest)}
          {group(t("list.offGroup", { count: off.length }), off)}
        </nav>
      </div>
    </>
  );
};
