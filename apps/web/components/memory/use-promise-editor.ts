"use client";

import type { MemoryDue } from "@metobe/contracts/memory";
import { toast } from "@metobe/ui/components/sonner";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { localMidnightOf } from "@/lib/memory-dates";

import { draftOf, remindOf } from "./promise-dialog";
import type { PromiseDraft } from "./promise-dialog";

// What the calendar's dialog does with a promise: add it, change it, mark it done, delete it. Each goes to the server,
// the page reads itself again, and the toast has «Вернуть» for what can be taken back (a new promise, done, delete).

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
  const body: { text?: string; dueAt?: string; remindAt?: string | null } = {};
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

  const create = async (next: PromiseDraft) => {
    const remindAt = remindOf(next, timeZone);
    if (pastRemind(remindAt)) {
      toast.error(t("calRemindPast"));
      return;
    }
    const response = await send("/api/memory/records", "POST", {
      card: next.card,
      dueAt: localMidnightOf(next.day, timeZone).toISOString(),
      remindAt,
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
    toast(t("promiseAdded"), {
      action: {
        label: t("restore"),
        onClick: async () => {
          await send(`/api/memory/records/${id}`, "DELETE");
          await reread();
        },
      },
    });
  };

  const change = async (next: PromiseDraft, original: PromiseDraft) => {
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

  return {
    busy,
    draft,
    edit,
    handleChange: (patch: Partial<PromiseDraft>) =>
      setDraft((d) => (d ? { ...d, ...patch } : d)),
    handleClose: close,
    handleDone: (id: string) =>
      run(async () => {
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
      }),
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
    handleSave: () =>
      run(async () => {
        if (!draft) {
          return;
        }
        await (was ? change(draft, was) : create(draft));
      }),
    open: (next: PromiseDraft) => begin(next, null),
  };
};
