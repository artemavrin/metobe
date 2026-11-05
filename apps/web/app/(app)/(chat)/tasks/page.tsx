import { scheduleWords } from "@metobe/core/task-schedule";
import { listTasks, waitsFor } from "@metobe/core/tasks";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { getSettingsViewer } from "@/lib/settings-access";

// The owner's tasks (ARCH §16.4): a line each — its colour, name, schedule and the last run's line; the ones that
// wait for the person carry the dot. The list «по вниманию» (P13) comes with stage 4; this is the plain one.
const TasksPage = async () => {
  const [{ user }, locale, t] = await Promise.all([
    getSettingsViewer(),
    getLocale(),
    getTranslations("tasks"),
  ]);
  const list = user ? await listTasks(user.id) : [];
  const lang = locale === "en" ? "en" : "ru";
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-8 pb-24">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        {list.length === 0 && (
          <p className="text-muted-foreground text-sm">{t("list.empty")}</p>
        )}
        {list.length > 0 && (
          <ul className="bg-card overflow-hidden rounded-xl border">
            {list.map(({ task, last }) => {
              const waiting = task.enabled && waitsFor(last);
              const off = !task.enabled || task.pausedReason !== null;
              const line =
                last?.summary ??
                (last?.status === "failed"
                  ? t("failed", { error: last.error ?? "—" })
                  : null);
              return (
                <li className="border-b last:border-b-0" key={task.id}>
                  <Link
                    className="hover:bg-muted/50 flex items-center gap-3 px-4 py-3 text-sm transition-colors duration-150"
                    href={`/tasks/${task.id}`}
                  >
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: task.color }}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-medium">{task.name}</span>
                      <span className="text-muted-foreground truncate text-xs">
                        {scheduleWords(task.cron, lang)}
                        {off && ` · ${t("off")}`}
                        {line && ` · ${line}`}
                      </span>
                    </span>
                    {waiting && (
                      <>
                        <span
                          aria-hidden
                          className="bg-foreground size-1.5 shrink-0 rounded-full"
                        />
                        <span className="sr-only">, {t("waiting")}</span>
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default TasksPage;
