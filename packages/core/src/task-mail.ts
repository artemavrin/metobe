import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

import { user } from "@metobe/db/schema/auth";
import { taskRuns, tasks } from "@metobe/db/schema/tasks";
import { defaultLocale, isLocale } from "@metobe/i18n/config";
import type { Locale } from "@metobe/i18n/config";
import { getTranslator } from "@metobe/i18n/translator";
import { eq } from "drizzle-orm";

import { getDb } from "./db";
import { getEnv } from "./env";
import { letterBlocks } from "./letter-blocks";
import { isMailConfigured, sendMail } from "./mail";
import { scheduleWords } from "./task-schedule";
import { getRunAnswer } from "./tasks";
import type { TaskRow, TaskRunRow } from "./tasks";

// A task's letters (ARCH §16.5, P14): a run that waits for the person — a new result, a question, an action — goes to
// the owner's mail when the task has «Уведомления на почту» on. «Нового нет» never goes, nor a test run. Failures in a
// row send one letter, at the first; the stop after five is an action and goes too. At the bottom, «Отключить для этой
// задачи»: a link signed for the task, that works without signing in.

/** What the letter is about, or null — no letter for this run. */
export type LetterKind = "result" | "question" | "action";

export const letterKindOf = (
  run: Pick<TaskRunRow, "status" | "outcome" | "trigger">,
  failuresInRow: number
): LetterKind | null => {
  if (run.trigger === "test") {
    return null;
  }
  if (run.outcome === "news") {
    return "result";
  }
  if (run.outcome === "question") {
    return "question";
  }
  if (run.outcome === "action") {
    return "action";
  }
  // A failure: the first of a row only — the next ones would say the same.
  return run.status === "failed" && failuresInRow === 1 ? "action" : null;
};

/** The task's colour for mail, which knows no CSS variables: the chart palette's light values. */
const HEX: Record<string, string> = {
  "var(--chart-1)": "#2a78d6",
  "var(--chart-2)": "#eb6834",
  "var(--chart-3)": "#1baf7a",
  "var(--chart-4)": "#eda100",
  "var(--chart-5)": "#e87ba4",
  "var(--chart-6)": "#008300",
  "var(--chart-7)": "#4a3aa7",
  "var(--chart-8)": "#e34948",
};
const hexOf = (color: string) =>
  HEX[color] ?? (/^#[\da-f]{6}$/iu.test(color) ? color : "#737373");

// ── «Отключить для этой задачи» ──────────────────────────────────────────────────────────────────────────────────

const sign = (taskId: string) =>
  createHmac("sha256", getEnv().BETTER_AUTH_SECRET)
    .update(`task-mail-off:${taskId}`)
    .digest("base64url");

/** Whether the token is the one the task's letters carry. */
export const checkMailOffToken = (taskId: string, token: string) => {
  const want = Buffer.from(sign(taskId));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
};

/**
 * Where a letter's «Отключить для этой задачи» leads: the page, which asks once (a mail scanner opening links must not
 * turn letters off), or — for the `List-Unsubscribe` header — the address a mail client posts to in one click.
 */
export const mailOffUrl = (taskId: string, via: "page" | "post" = "page") => {
  const url = new URL(
    via === "page" ? `/mail-off/${taskId}` : `/api/mail-off/${taskId}`,
    getEnv().BETTER_AUTH_URL
  );
  url.searchParams.set("t", sign(taskId));
  return url.toString();
};

/** The task a signed link points at, for its page to name it; null when the token does not fit. */
export const getMailOffTask = async (taskId: string, token: string) => {
  if (!checkMailOffToken(taskId, token)) {
    return null;
  }
  const [task] = await getDb()
    .db.select({
      id: tasks.id,
      name: tasks.name,
      notifyEmail: tasks.notifyEmail,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  return task ?? null;
};

/** Turns the task's letters off by its signed link; false when the token does not fit. */
export const turnOffTaskMail = async (taskId: string, token: string) => {
  if (!checkMailOffToken(taskId, token)) {
    return false;
  }
  await getDb()
    .db.update(tasks)
    .set({ notifyEmail: false })
    .where(eq(tasks.id, taskId));
  return true;
};

// ── The letter ───────────────────────────────────────────────────────────────────────────────────────────────────

/** «пн, 9 нояб., 9:00» in the task's zone. */
const runTime = (at: Date, timeZone: string, locale: Locale) =>
  new Intl.DateTimeFormat(locale, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone,
    weekday: "short",
  }).format(at);

const BUTTON: Record<LetterKind, "open" | "answer"> = {
  action: "open",
  question: "answer",
  result: "open",
};

/** The first words of the result, for the line a mail client shows after the subject. */
const previewOf = (
  blocks: ReturnType<typeof letterBlocks>,
  heading: string
) => {
  for (const b of blocks) {
    const text =
      b.type === "p"
        ? (b.text ?? b.runs?.map((r) => r.text).join("") ?? "")
        : "";
    if (text.trim()) {
      return text.trim().slice(0, 160);
    }
  }
  return heading;
};

const build = async (
  task: TaskRow,
  run: TaskRunRow,
  kind: LetterKind,
  locale: Locale
) => {
  const [t, { taskLetter }] = await Promise.all([
    getTranslator(locale),
    import("@metobe/emails/task-letter"),
  ]);
  const answer =
    run.status === "done" && run.chatId
      ? await getRunAnswer(task.ownerId, run.id)
      : null;
  const blocks = answer ? letterBlocks(answer.parts, { locale }) : [];
  const heading =
    run.summary ??
    (run.status === "failed"
      ? t("email.task.failed", { error: run.error ?? "—" })
      : task.name);
  const off = mailOffUrl(task.id);
  const letter = await taskLetter({
    blocks,
    button: {
      href: new URL(`/tasks/${task.id}`, getEnv().BETTER_AUTH_URL).toString(),
      label: t(`email.task.button.${BUTTON[kind]}`),
    },
    heading,
    kind,
    label: t(`email.task.label.${kind}`),
    locale,
    off: { href: off, label: t("email.task.off") },
    preview: previewOf(blocks, heading),
    task: {
      color: hexOf(task.color),
      meta: t("email.task.meta", {
        schedule: scheduleWords(task.cron, locale === "en" ? "en" : "ru"),
        when: runTime(run.scheduledFor, task.timezone, locale),
      }),
      name: task.name,
    },
    why: t("email.task.why", { task: task.name }),
  });
  return {
    ...letter,
    headers: {
      "List-Unsubscribe": `<${mailOffUrl(task.id, "post")}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    subject: t("email.task.subject", { heading, task: task.name }),
  };
};

/**
 * After a run ends: the letter, when the task has its letters on and the run waits for the person. Never throws — a
 * letter that did not go is logged; the run is done either way.
 */
export const sendRunLetter = async (runId: string) => {
  try {
    const { db } = getDb();
    const [row] = await db
      .select({
        email: user.email,
        locale: user.locale,
        run: taskRuns,
        task: tasks,
      })
      .from(taskRuns)
      .innerJoin(tasks, eq(tasks.id, taskRuns.taskId))
      .innerJoin(user, eq(user.id, tasks.ownerId))
      .where(eq(taskRuns.id, runId))
      .limit(1);
    if (!row?.task.notifyEmail) {
      return false;
    }
    const kind = letterKindOf(row.run, row.task.consecutiveFailures);
    if (!kind || !(await isMailConfigured())) {
      return false;
    }
    const locale =
      row.locale && isLocale(row.locale) ? row.locale : defaultLocale;
    const letter = await build(row.task, row.run, kind, locale);
    await sendMail({ ...letter, to: row.email });
    return true;
  } catch (error) {
    console.error("tasks: the run's letter was not sent", runId, error);
    return false;
  }
};
