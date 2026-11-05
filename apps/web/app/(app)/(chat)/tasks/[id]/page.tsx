import { listChatServers } from "@metobe/core/mcp";
import { scheduleWords } from "@metobe/core/task-schedule";
import { getRunAnswer, getTask, getTaskRuns } from "@metobe/core/tasks";
import { getLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { TaskView } from "@/components/tasks/task-view";
import { getSettingsViewer } from "@/lib/settings-access";

// A task's page (ARCH §16.4, P12 + P15): what it does in a card, the last result whole, what came after it in rows,
// earlier runs under a spoiler. Someone else's task is as missing as one that never was.
const TaskPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    notFound();
  }
  const [{ user }, locale] = await Promise.all([
    getSettingsViewer(),
    getLocale(),
  ]);
  const task = user ? await getTask(user.id, id) : null;
  if (!user || !task) {
    notFound();
  }
  const [runs, servers] = await Promise.all([
    getTaskRuns(task.id),
    listChatServers(user.id),
  ]);
  // The result whole, and the run on its way as far as it got: its steps fill in while the page looks again.
  const [answer, going] = await Promise.all([
    runs.result ? getRunAnswer(user.id, runs.result.id) : null,
    runs.active?.chatId ? getRunAnswer(user.id, runs.active.id) : null,
  ]);
  const sources =
    task.catalogIds?.flatMap(
      (c) => servers.find((s) => s.id === c)?.title ?? []
    ) ?? null;
  return (
    <TaskView
      answer={answer}
      going={going}
      key={task.id}
      runs={runs}
      schedule={scheduleWords(task.cron, locale === "en" ? "en" : "ru")}
      servers={servers}
      sources={sources}
      task={task}
    />
  );
};

export default TaskPage;
