import "server-only";
import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";

import { CHAT_SOURCE, listEntities, listRecords } from "./memory";
import { day, lineOf } from "./memory-lines";
import { settled } from "./memory-page";
import { queueMemoryWrite } from "./memory-queue";

// «Запиши», «запомни», «напомни мне…» (D44): asked in so many words, the person's message is kept now, not after the
// answer — the chat's model calls `remember`, the message goes through the memory's queue as any message (the same
// write: the queuing after the answer finds it there and reads nothing again), and the model is told what was kept, so
// it says what is true. Said in passing, a thing is kept after the answer as always.

export const REMEMBER = "remember";

/** How long the answer waits for the queue: one read is a few seconds. */
const WAIT_MS = 20_000;

/** `remember` for one message of a chat: whose, which, read in which zone. */
export const rememberTool = ({
  chatId,
  messageId,
  ownerId,
  timeZone,
}: {
  chatId: string;
  messageId: string;
  ownerId: string;
  timeZone: string;
}): ToolSet => ({
  [REMEMBER]: tool({
    description:
      "Keep the user's current message in memory now and get back what was kept. Only when they ask in words to remember, note, record or remind.",
    execute: async () => {
      const writeId = await queueMemoryWrite({
        chatId,
        ownerId,
        source: CHAT_SOURCE,
        sourceKey: messageId,
        timeZone,
      });
      if (!writeId) {
        return { kept: [], status: "off" as const };
      }
      const status = await settled(ownerId, writeId, Date.now() + WAIT_MS);
      if (status !== "done") {
        return {
          kept: [],
          status:
            status === "queued" ? ("later" as const) : ("nothing" as const),
        };
      }
      const [records, entities] = await Promise.all([
        listRecords(ownerId, { writeIds: [writeId] }),
        listEntities(ownerId),
      ]);
      const names = new Map(entities.map((e) => [e.id, e]));
      return {
        kept: records.map((r) => {
          const line = lineOf(r, names, timeZone);
          const at = r.remindAt
            ? `${day(r.remindAt, timeZone)} ${new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone }).format(r.remindAt)}`
            : null;
          return at ? `${line} (reminder ${at})` : line;
        }),
        status: "done" as const,
      };
    },
    inputSchema: z.object({}),
  }),
});
