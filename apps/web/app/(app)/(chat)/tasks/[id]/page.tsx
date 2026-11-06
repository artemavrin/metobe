import type { TaskSnapshot } from "@metobe/contracts/tasks";
import type { ChatServer } from "@metobe/core/mcp";
import { listChatServers } from "@metobe/core/mcp";
import { getTaskVersions } from "@metobe/core/task-change";
import { nextRun, scheduleWords } from "@metobe/core/task-schedule";
import { getRunAnswer, getTask, getTaskRuns } from "@metobe/core/tasks";
import { getLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { TaskView } from "@/components/tasks/task-view";
import type { TaskFields } from "@/components/tasks/task-view";
import { getSettingsViewer } from "@/lib/settings-access";

/** A version as the card «О задаче» shows it: the schedule in words, the sources by title. */
const viewOf = (
  s: TaskSnapshot,
  servers: ChatServer[],
  locale: "ru" | "en"
): TaskFields => ({
  instructions: s.instructions,
  reportWhen: s.reportWhen,
  schedule: scheduleWords(s.cron, locale),
  sources:
    s.catalogIds?.flatMap(
      (c) => servers.find((v) => v.id === c)?.title ?? []
    ) ?? null,
});

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
  const [runs, servers, versions] = await Promise.all([
    getTaskRuns(task.id),
    listChatServers(user.id),
    getTaskVersions(task.id),
  ]);
  const lang = locale === "en" ? "en" : "ru";
  // A change not applied yet is the version after the task's (ARCH §16.1a).
  const pending = versions.find((v) => v.version === task.version + 1);
  const current = viewOf(
    {
      catalogIds: task.catalogIds,
      cron: task.cron,
      instructions: task.instructions,
      modelId: task.modelId,
      reportWhen: task.reportWhen,
      timezone: task.timezone,
    },
    servers,
    lang
  );
  const change = pending
    ? {
        after: viewOf(pending.snapshot, servers, lang),
        nextAt:
          pending.snapshot.cron === task.cron
            ? null
            : nextRun(
                pending.snapshot.cron,
                pending.snapshot.timezone,
                new Date()
              ),
        request: pending.request ?? "",
      }
    : null;
  // The result whole, and the run on its way as far as it got: its steps fill in while the page looks again.
  const [answer, going] = await Promise.all([
    runs.result ? getRunAnswer(user.id, runs.result.id) : null,
    runs.active?.chatId ? getRunAnswer(user.id, runs.active.id) : null,
  ]);
  return (
    <TaskView
      answer={answer}
      change={change}
      current={current}
      going={going}
      key={task.id}
      runs={runs}
      servers={servers}
      task={task}
      versions={versions
        .filter((v) => v.version <= task.version)
        .map((v) => ({
          changeSummary: v.changeSummary,
          createdAt: v.createdAt,
          version: v.version,
        }))}
    />
  );
};

export default TaskPage;
