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
