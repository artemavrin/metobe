"use client";

import type { MemoryDue, ReminderRepeat } from "@metobe/contracts/memory";
import { nextReminder } from "@metobe/core/memory-repeat";
import { toast } from "@metobe/ui/components/sonner";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { dayKey, localMidnightOf } from "@/lib/memory-dates";

import { draftOf, remindOf } from "./promise-dialog";
import type { PromiseDraft } from "./promise-dialog";

// What the calendar's dialog does with a promise: add it, change it, mark it done, delete it. Each goes to the server,
// the page reads itself again, and the toast has «Вернуть» for what can be taken back (a new promise, done, delete).
// «Напоминания» (P29) add «Через час», «Завтра» and «Не сделано»; «Готово» on one that comes again moves it on.

const send = (url: string, method: string, body?: unknown) =>
  fetch(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method,
  });

/** A moment in the past would go off at once: it is not taken. */
const pastRemind = (remindAt: string | null | undefined) =>
  Boolean(remindAt) && new Date(remindAt as string).getTime() <= Date.now();

/** What changed from the promise as it was: only that goes to the server. */
const changes = (draft: PromiseDraft, was: PromiseDraft, timeZone: string) => {
  const body: {
    text?: string;
    dueAt?: string;
    remindAt?: string | null;
    repeat?: ReminderRepeat | null;
  } = {};
  if (draft.text.trim() !== was.text) {
    body.text = draft.text.trim();
  }
  if (draft.day !== was.day) {
    body.dueAt = localMidnightOf(draft.day, timeZone).toISOString();
  }
  if (
    draft.remind !== was.remind ||
    (draft.remind &&
      (draft.remindDay !== was.remindDay || draft.time !== was.time))
  ) {
    body.remindAt = remindOf(draft, timeZone);
  }
  if (draft.remind && draft.repeat !== was.repeat) {
    body.repeat = draft.repeat;
  }
  return body;
};

export const usePromiseEditor = ({
  due,
  timeZone,
  reread,
}: {
  due: MemoryDue | null;
  timeZone: string;
  reread: () => Promise<void>;
}) => {
  const t = useTranslations("memory");
  const locale = useLocale();
  const [draft, setDraft] = useState<PromiseDraft | null>(null);
  const [was, setWas] = useState<PromiseDraft | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setDraft(null);
    setWas(null);
  };
  const begin = (next: PromiseDraft, original: PromiseDraft | null) => {
    setDraft(next);
    setWas(original);
  };
  const edit = (id: string) => {
    const row = due?.rows.find((r) => r.id === id);
    if (row) {
      const current = draftOf(row, timeZone);
      begin(current, current);
    }
  };

  const failed = async () => {
    toast.error(t("failed"));
    await reread();
  };

  const create = async (made: PromiseDraft) => {
    // A reminder is a promise of the person to themselves, due on the day it goes off.
    const next: PromiseDraft =
      made.kind === "reminder"
        ? {
            ...made,
            card: null,
            day: made.remindDay,
            remind: true,
            side: "mine",
          }
        : made;
    const remindAt = remindOf(next, timeZone);
    if (next.kind === "reminder" && !remindAt) {
      return;
    }
    if (pastRemind(remindAt)) {
      toast.error(t("calRemindPast"));
      return;
    }
    const response = await send("/api/memory/records", "POST", {
      card: next.card,
      dueAt: localMidnightOf(next.day, timeZone).toISOString(),
      remindAt,
      repeat: remindAt ? next.repeat : null,
      side: next.side,
      text: next.text.trim(),
    });
    if (!response.ok) {
      await failed();
      return;
    }
    const { id } = (await response.json()) as { id: string };
    close();
    await reread();
    toast(t(next.kind === "reminder" ? "reminderAdded" : "promiseAdded"), {
      action: {
        label: t("restore"),
        onClick: async () => {
          await send(`/api/memory/records/${id}`, "DELETE");
          await reread();
        },
      },
    });
  };

  const change = async (made: PromiseDraft, original: PromiseDraft) => {
    // A reminder is due on the day it goes off: a new day for it is a new deadline too. Its old deadline stays when
    // the day does not change — one that comes again and came keeps the day it came.
    const next =
      made.kind === "reminder" && made.remindDay !== original.remindDay
        ? { ...made, day: made.remindDay }
        : made;
    const body = changes(next, original, timeZone);
    if (Object.keys(body).length === 0) {
      close();
      return;
    }
    if (body.remindAt && pastRemind(body.remindAt)) {
      toast.error(t("calRemindPast"));
      return;
    }
    const response = await send(
      `/api/memory/records/${next.id}`,
      "PATCH",
      body
    );
    if (!response.ok) {
      await failed();
      return;
    }
    close();
    await reread();
    toast(t("saved"));
  };

  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    await job().catch(() => toast.error(t("failed")));
    setBusy(false);
  };

  /** A change with «Вернуть» that sends `back`. */
  const patchWith = (
    id: string,
    body: Record<string, unknown>,
    said: string,
    back?: Record<string, unknown>
  ) =>
    run(async () => {
      const response = await send(`/api/memory/records/${id}`, "PATCH", body);
      if (!response.ok) {
        await failed();
        return;
      }
      close();
      await reread();
      toast(
        said,
        back
          ? {
              action: {
                label: t("restore"),
                onClick: async () => {
                  await send(`/api/memory/records/${id}`, "PATCH", back);
                  await reread();
                },
              },
            }
          : undefined
      );
    });

  /** «Готово» on one that comes again: the time after, as the server will count it. */
  /** The time after «Готово»: one that went off has moved on already; one ahead of its time skips it. */
  const nextOf = (row: MemoryDue["rows"][number]) => {
    if (!(row.repeat && row.remindAt)) {
      return null;
    }
    if (row.reminded) {
      return { remindAt: new Date(row.remindAt) };
    }
    return nextReminder({
      after: dayKey(new Date(row.remindAt), timeZone),
      days: row.repeatDays,
      now: new Date(),
      remindAt: new Date(row.remindAt),
      repeat: row.repeat,
      timeZone,
    });
  };
  const when = (at: Date) =>
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      timeZone,
      weekday: "short",
    }).format(at);

  return {
    busy,
    draft,
    edit,
    handleChange: (patch: Partial<PromiseDraft>) =>
      setDraft((d) => (d ? { ...d, ...patch } : d)),
    handleClose: close,
    handleDone: (id: string) => {
      const row = due?.rows.find((r) => r.id === id);
      const next = row ? nextOf(row) : null;
      if (row && next) {
        return patchWith(
          id,
          { status: "done" },
          t("reminderNext", { when: when(next.remindAt) }),
          { dueAt: row.dueAt, remindAt: row.remindAt }
        );
      }
      return run(async () => {
        const response = await send(`/api/memory/records/${id}`, "PATCH", {
          status: "done",
        });
        if (!response.ok) {
          await failed();
          return;
        }
        close();
        await reread();
        toast(t("savedDone"), {
          action: {
            label: t("restore"),
            onClick: async () => {
              await send(`/api/memory/records/${id}`, "PATCH", {
                status: "open",
              });
              await reread();
            },
          },
        });
      });
    },
    /** «Через час»: the same reminder, once more in an hour. */
    handleHour: (id: string) =>
      patchWith(
        id,
        { remindAt: new Date(Date.now() + 3_600_000).toISOString() },
        t("reminderInHour")
      ),
    handleRemove: (id: string) =>
      run(async () => {
        const response = await send(`/api/memory/records/${id}`, "DELETE");
        if (!response.ok) {
          await failed();
          return;
        }
        close();
        await reread();
        toast(t("deleted"), {
          action: {
            label: t("restore"),
            onClick: async () => {
              await send(`/api/memory/records/${id}/restore`, "POST");
              await reread();
            },
          },
        });
      }),
    /** «Не сделано»: a reminder that closed itself when it came is open again. */
    handleReopen: (id: string) =>
      patchWith(id, { status: "open" }, t("savedReopened"), { status: "done" }),
    handleSave: () =>
      run(async () => {
        if (!draft) {
          return;
        }
        await (was ? change(draft, was) : create(draft));
      }),
    /** «Завтра»: tomorrow, at the time it had (or now's, if that was past). */
    handleTomorrow: (id: string) => {
      const row = due?.rows.find((r) => r.id === id);
      const base = Math.max(
        row?.remindAt ? new Date(row.remindAt).getTime() : 0,
        Date.now()
      );
      const remindAt = new Date(base + 86_400_000);
      return patchWith(
        id,
        {
          dueAt: localMidnightOf(
            dayKey(remindAt, timeZone),
            timeZone
          ).toISOString(),
          remindAt: remindAt.toISOString(),
        },
        t("reminderTomorrow", { when: when(remindAt) }),
        row ? { dueAt: row.dueAt, remindAt: row.remindAt } : undefined
      );
    },
    open: (next: PromiseDraft) => begin(next, null),
  };
};
