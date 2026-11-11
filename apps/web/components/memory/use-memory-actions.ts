import type {
  ChatMemory,
  MemoryNoteResult,
  MemoryRecordView,
} from "@metobe/contracts/memory";
import { toast } from "@metobe/ui/components/sonner";
import { useTranslations } from "next-intl";

import { debtorOf } from "./card-parts";
import type { MemoryActions } from "./memory-record";

// The calls that change the memory from a screen — the «Память» page and an answer in the chat. Each says so in a
// toast and then reads again what is on screen.

type Question = ChatMemory["questions"][number];
export type T = ReturnType<typeof useTranslations<"memory">>;

export const readJson = async <Data>(url: string) => {
  const response = await fetch(url, { cache: "no-store" });
  return response.ok ? ((await response.json()) as Data) : null;
};

/** Which part of the card a record is shown in, seen from that card: «Ждёте», «Вы обещали», «Известно»… */
export const sectionOf = (r: MemoryRecordView, cardId: string, t: T) => {
  if (r.kind === "commitment") {
    const debtor = debtorOf(r);
    if (debtor?.id === cardId) {
      return t("waiting");
    }
    return debtor?.kind === "self" ? t("youPromised") : t("otherPromises");
  }
  if (r.kind === "event") {
    return t("events");
  }
  return r.kind === "rule" ? t("rules") : t("known");
};

/** The page's calls: each change says so in a toast and reads the page again; a deletion offers «Вернуть». */
export const useActionsOf = (
  timeZone: string,
  reread: () => Promise<void>
): MemoryActions & {
  answer: (q: Question, body: object) => Promise<void>;
  rule: (text: string) => Promise<MemoryRecordView[] | null>;
  /** Two cards into one (§19.8.5): `gone` goes into `keep`, with «Вернуть» in the toast. True when it went through. */
  merge: (gone: string, keep: { id: string; name: string }) => Promise<boolean>;
  /** «Разные» on «Один человек?»: the pair is not offered again. */
  dismissMerge: (a: string, b: string) => Promise<void>;
} => {
  const t = useTranslations("memory");
  /**
   * A note or a rule in words goes to the memory, which picks what it is: the toast says where it lay (with «Отменить»),
   * that nothing was found, or that it will be written later. The records it made — none when nothing went in.
   */
  const send = async (
    url: string,
    text: string,
    section: (r: MemoryRecordView) => string
  ): Promise<MemoryRecordView[] | null> => {
    const response = await fetch(url, {
      body: JSON.stringify({ text }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const result = response.ok
      ? ((await response.json()) as MemoryNoteResult)
      : null;
    if (!result || result.status === "failed" || result.status === "off") {
      toast.error(t("failed"));
      return null;
    }
    if (result.status === "skipped") {
      toast(t("noteNothing"));
      return null;
    }
    if (result.status === "queued") {
      toast(t("noteLater"));
      return [];
    }
    await reread();
    const [first] = result.records;
    if (!first) {
      toast(t("noteAsked"));
      return [];
    }
    const { writeId } = result;
    const words = {
      count: result.records.length - 1,
      section: section(first),
      text: first.text,
    };
    toast(
      result.records.length > 1
        ? t("noteSavedMore", words)
        : t("noteSaved", words),
      writeId
        ? {
            action: {
              label: t("undo"),
              onClick: async () => {
                await fetch(`/api/memory/writes/${writeId}/undo`, {
                  method: "POST",
                });
                await reread();
                toast(t("undone"));
              },
            },
          }
        : undefined
    );
    return result.records;
  };

  return {
    answer: async (question, body) => {
      const response = await fetch(`/api/memory/questions/${question.id}`, {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!(response.ok || response.status === 404)) {
        toast.error(t("failed"));
        return;
      }
      toast("dismiss" in body ? t("notRemembered") : t("answered"));
      await reread();
    },
    dismissMerge: async (a, b) => {
      const response = await fetch("/api/memory/merges/dismiss", {
        body: JSON.stringify({ a, b }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        toast.error(t("failed"));
        return;
      }
      await reread();
    },
    merge: async (gone, keep) => {
      const response = await fetch(`/api/memory/cards/${gone}/merge`, {
        body: JSON.stringify({ into: keep.id }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        toast.error(t("failed"));
        return false;
      }
      const { id } = (await response.json()) as { id: string };
      await reread();
      toast(t("merged", { name: keep.name }), {
        action: {
          label: t("restore"),
          onClick: async () => {
            await fetch(`/api/memory/merges/${id}/undo`, { method: "POST" });
            await reread();
            toast(t("undone"));
          },
        },
      });
      return true;
    },
    note: (card, text) =>
      send(`/api/memory/cards/${card.id}/notes`, text, (r) =>
        sectionOf(r, card.id, t)
      ),
    patch: async (id, patch, saved) => {
      const response = await fetch(`/api/memory/records/${id}`, {
        body: JSON.stringify(patch),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      if (!response.ok) {
        toast.error(t("failed"));
        return;
      }
      toast(t(saved as "saved"));
      await reread();
    },
    patchCard: async (id, patch) => {
      const response = await fetch(`/api/memory/cards/${id}`, {
        body: JSON.stringify(patch),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      if (!response.ok) {
        toast.error(t("failed"));
        return;
      }
      toast(t("saved"));
      await reread();
    },
    remove: async (id) => {
      const response = await fetch(`/api/memory/records/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        toast.error(t("failed"));
        return;
      }
      await reread();
      toast(t("deleted"), {
        action: {
          label: t("restore"),
          onClick: async () => {
            await fetch(`/api/memory/records/${id}/restore`, {
              method: "POST",
            });
            await reread();
          },
        },
      });
    },
    rule: (text) => send("/api/memory/rules", text, () => t("rules")),
    timeZone,
  };
};

/**
 * «Записать в память» from the search (Д7.1): the text goes to the memory, and a toast in the corner says what came of
 * it — kept, with «Отменить»; nothing to keep; or later. The toasts are the search's own (`toasterId`): the page the
 * person is on may have no toaster of its own, or a different one.
 */
export const NOTE_TOASTER = "note";

export const useRememberNote = () => {
  const t = useTranslations("memory");
  const options = { toasterId: NOTE_TOASTER } as const;
  return async (text: string) => {
    const response = await fetch("/api/memory/notes", {
      body: JSON.stringify({ text }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }).catch(() => null);
    const result = response?.ok
      ? ((await response.json()) as MemoryNoteResult)
      : null;
    if (!result || result.status === "failed" || result.status === "off") {
      toast.error(t("failed"), options);
      return;
    }
    if (result.status === "skipped") {
      toast(t("noteNothing"), options);
      return;
    }
    if (result.status === "queued") {
      toast(t("noteLater"), options);
      return;
    }
    const [first] = result.records;
    if (!first) {
      toast(t("noteAsked"), options);
      return;
    }
    const { writeId } = result;
    const words = { count: result.records.length - 1, text: first.text };
    toast(
      result.records.length > 1
        ? t("rememberedMore", words)
        : t("remembered", words),
      {
        ...options,
        action: writeId
          ? {
              label: t("undo"),
              onClick: async () => {
                await fetch(`/api/memory/writes/${writeId}/undo`, {
                  method: "POST",
                });
                toast(t("undone"), options);
              },
            }
          : undefined,
      }
    );
  };
};
