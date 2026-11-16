"use client";

import type { ChatMemory, memoryAnswerSchema } from "@metobe/contracts/memory";
import { toast } from "@metobe/ui/components/sonner";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { z } from "zod";

import { subscribeOwnerStream } from "@/lib/owner-stream";

// What the memory took from this chat (ARCH §19, P18): «Запомнено» under the answers and the questions the writer
// could not settle. Read when the chat opens, when the server says this chat's memory moved (the write ends a second
// or ten after the answer), on a reconnect and when the tab comes back.

export type MemoryAnswer = z.infer<typeof memoryAnswerSchema>;
type Question = ChatMemory["questions"][number];

/** How long «Удалено из памяти · Вернуть» waits before the undo is sent: taking it back needs nothing from the server. */
const UNDO_GRACE_MS = 5000;

export const useChatMemory = (chatId: string) => {
  const t = useTranslations("chat.memory");
  const [memory, setMemory] = useState<ChatMemory | null>(null);
  // Questions there at the first read are old news: only those that come while the chat is open may ask aloud.
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  // Writes being undone and questions being answered: gone from the page at once.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const hide = (id: string) => setHidden((h) => new Set(h).add(id));
  const show = (id: string) =>
    setHidden((h) => {
      const next = new Set(h);
      next.delete(id);
      return next;
    });

  const read = useCallback(async () => {
    const response = await fetch(`/api/memory/chats/${chatId}`, {
      cache: "no-store",
    });
    // A chat not saved yet (a new one before its first answer) has nothing to show.
    if (!response.ok) {
      return;
    }
    const next = (await response.json()) as ChatMemory;
    if (seen.current === null) {
      seen.current = new Set(next.questions.map((q) => q.id));
    } else {
      const known = seen.current;
      const arrived = next.questions.filter((q) => !known.has(q.id));
      for (const q of arrived) {
        known.add(q.id);
      }
      if (arrived.length > 0) {
        setFresh((f) => new Set([...f, ...arrived.map((q) => q.id)]));
      }
    }
    setMemory(next);
  }, [chatId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      timer = undefined;
      if (document.visibilityState === "visible") {
        void read();
      }
    };
    void read();
    const stop = subscribeOwnerStream("memory", (data) => {
      const said = (data as { chatId?: unknown } | null)?.chatId;
      // A word about another chat is not ours; one without a chat (a reconnect) may be.
      if ((said === undefined || said === chatId) && timer === undefined) {
        timer = setTimeout(run, 300);
      }
    });
    document.addEventListener("visibilitychange", run);
    return () => {
      clearTimeout(timer);
      stop();
      document.removeEventListener("visibilitychange", run);
    };
  }, [chatId, read]);

  const answer = async (question: Question, given: MemoryAnswer) => {
    hide(question.id);
    toast.dismiss(question.id);
    const response = await fetch(`/api/memory/questions/${question.id}`, {
      body: JSON.stringify(given),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    // 404 — answered in another tab: nothing to say.
    if (!(response.ok || response.status === 404)) {
      toast.error(t("failed"));
      show(question.id);
      return;
    }
    await read();
    show(question.id);
  };

  /** Hidden at once; sent once «Вернуть» has had its few seconds. */
  const undo = (writeId: string) => {
    hide(writeId);
    let settled = false;
    const send = async () => {
      if (settled) {
        return;
      }
      settled = true;
      await fetch(`/api/memory/writes/${writeId}/undo`, { method: "POST" });
      await read();
      show(writeId);
    };
    toast(t("undone"), {
      action: {
        label: t("restore"),
        onClick: () => {
          settled = true;
          show(writeId);
        },
      },
      duration: UNDO_GRACE_MS,
      onAutoClose: () => {
        void send();
      },
      onDismiss: () => {
        void send();
      },
    });
  };

  return { answer, fresh, hidden, memory, undo };
};

export interface ChatMemoryApi extends ReturnType<typeof useChatMemory> {
  /** The composer's box: a question that comes while the person is in it asks with a toast too. */
  composer: RefObject<HTMLDivElement | null>;
}

/** The chat's memory for the rows under it: a row drawn from memo still hears it change. */
export const ChatMemoryContext = createContext<ChatMemoryApi | null>(null);
