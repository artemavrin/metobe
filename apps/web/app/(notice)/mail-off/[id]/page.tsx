import { getMailOffTask } from "@metobe/core/task-mail";
import { Button } from "@metobe/ui/components/button";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { z } from "zod";

import { MailOffForm } from "./mail-off-form";

// The page a task letter's «Отключить для этой задачи» opens (ARCH §16.5): it asks once — a mail scanner that opens
// links must not turn the letters off — and works without signing in, by the link signed for the task.
const MailOffPage = async ({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) => {
  const [{ id }, { t: token = "" }, t] = await Promise.all([
    params,
    searchParams,
    getTranslations("mailOff"),
  ]);
  const task = z.uuid().safeParse(id).success
    ? await getMailOffTask(id, token)
    : null;
  if (!task) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("badTitle")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("badText")}</p>
      </div>
    );
  }
  if (!task.notifyEmail) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("doneTitle")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("doneText", { task: task.name })}
        </p>
        <Button
          className="mt-2 self-start"
          nativeButton={false}
          render={<Link href={`/tasks/${task.id}`} />}
          size="sm"
          variant="outline"
        >
          {t("open")}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">
          {t("text", { task: task.name })}
        </p>
      </div>
      <MailOffForm taskId={task.id} token={token} />
    </div>
  );
};

export default MailOffPage;
