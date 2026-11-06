import type { TaskSnapshot } from "@metobe/contracts/tasks";
import { filesOf } from "@metobe/core/files";
import { listMailboxes } from "@metobe/core/mailboxes";
import type { ChatServer } from "@metobe/core/mcp";
import { listChatServers } from "@metobe/core/mcp";
import { skillsForChat } from "@metobe/core/skills";
import { getTaskVersions } from "@metobe/core/task-change";
import { nextRun, scheduleWords } from "@metobe/core/task-schedule";
import { getRunAnswer, getTask, getTaskRuns } from "@metobe/core/tasks";
import { getLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { TaskView } from "@/components/tasks/task-view";
import type { TaskFields } from "@/components/tasks/task-view";
import { getPickerData } from "@/lib/chat-data";
import { getSettingsViewer } from "@/lib/settings-access";
import { fixMailboxOf } from "@/lib/task-runs";

interface Names {
  servers: ChatServer[];
  files: Map<string, string>;
  skills: Map<string, string>;
}

/** A version as the card «О задаче» shows it: the schedule in words, sources, files and skills by name. */
const viewOf = (
  s: TaskSnapshot,
  names: Names,
  locale: "ru" | "en"
): TaskFields => ({
  files: (s.fileIds ?? []).flatMap((f) => names.files.get(f) ?? []),
  instructions: s.instructions,
  reportWhen: s.reportWhen,
  schedule: scheduleWords(s.cron, locale),
  skills: (s.skillIds ?? []).flatMap((k) => {
    const name = names.skills.get(k);
    return name ? [`/${name}`] : [];
  }),
  sources:
    s.catalogIds?.flatMap(
      (c) => names.servers.find((v) => v.id === c)?.title ?? []
    ) ?? null,
});

// A task's page (ARCH §16.4, P12 + P15): what it does in a card, the last result whole, what came after it in rows,
// earlier runs under a spoiler, and the composer to change it in words. Someone else's task is as missing as one that
// never was.
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
  const [runs, servers, versions, skills, picker, boxes] = await Promise.all([
    getTaskRuns(task.id),
    listChatServers(user.id),
    getTaskVersions(task.id),
    skillsForChat(user.id),
    getPickerData(user.id),
    listMailboxes(user.id),
  ]);
  const lang = locale === "en" ? "en" : "ru";
  const own = versions.find((v) => v.version === task.version)?.snapshot;
  // A change not applied yet is the version after the task's (ARCH §16.1a).
  const pending = versions.find((v) => v.version === task.version + 1);
  const fileRows = await filesOf(user.id, [
    ...new Set([...(own?.fileIds ?? []), ...(pending?.snapshot.fileIds ?? [])]),
  ]);
  const names: Names = {
    files: new Map(fileRows.map((f) => [f.id, f.name])),
    servers,
    skills: new Map(skills.map((k) => [k.id, k.name])),
  };
  const current = viewOf(
    own ?? {
      catalogIds: task.catalogIds,
      cron: task.cron,
      instructions: task.instructions,
      modelId: task.modelId,
      reportWhen: task.reportWhen,
      timezone: task.timezone,
    },
    names,
    lang
  );
  const change = pending
    ? {
        after: viewOf(pending.snapshot, names, lang),
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
  // A run stopped at a tool that waits for the person's yes: its answer, with the calls to approve.
  const [answer, going, waiting] = await Promise.all([
    runs.result ? getRunAnswer(user.id, runs.result.id) : null,
    runs.active?.chatId ? getRunAnswer(user.id, runs.active.id) : null,
    runs.waiting ? getRunAnswer(user.id, runs.waiting.id) : null,
  ]);
  return (
    <TaskView
      answer={answer}
      change={change}
      current={current}
      going={going}
      key={task.id}
      mailboxes={boxes.map(fixMailboxOf)}
      picker={picker}
      runs={runs}
      servers={servers}
      skills={skills.map((s) => ({
        description: s.description,
        id: s.id,
        name: s.name,
        shared: s.ownerId === null,
      }))}
      task={task}
      waiting={waiting}
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
