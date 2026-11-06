import { listChatServers } from "@metobe/core/mcp";
import { scheduleWords } from "@metobe/core/task-schedule";
import { listTasks } from "@metobe/core/tasks";
import { getLocale } from "next-intl/server";

import { NewTask } from "@/components/tasks/new-task";
import { TaskList } from "@/components/tasks/task-list";
import { getSettingsViewer } from "@/lib/settings-access";

// The owner's tasks «по вниманию» (ARCH §16.4, P13); the title and «Новая задача» stand in the bar over the page.
const TasksPage = async () => {
  const [{ user }, locale] = await Promise.all([
    getSettingsViewer(),
    getLocale(),
  ]);
  const [list, servers] = user
    ? await Promise.all([listTasks(user.id), listChatServers(user.id)])
    : [[], []];
  // No task yet: the page is «Что поручить?» itself (P13).
  if (list.length === 0) {
    return <NewTask home="/tasks" />;
  }
  const lang = locale === "en" ? "en" : "ru";
  return (
    <TaskList
      rows={list.map((item) => ({
        ...item,
        schedule: scheduleWords(item.task.cron, lang),
      }))}
      servers={servers}
    />
  );
};

export default TasksPage;
