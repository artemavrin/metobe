import { z } from "zod";

// What the memory keeps (ARCH §19, D39). Words only here: the columns the plan queries stay in the clear, the texts
// are sealed (core/memory-crypto).

/** `self` is the person themselves — one per owner; without it «who owes whom» has no one to point at. */
export const memoryEntityKinds = ["self", "person", "org", "project"] as const;
export type MemoryEntityKind = (typeof memoryEntityKinds)[number];

/** A fact, an assessment («often misses deadlines»), an event, a commitment and a rule are different things (D39). */
export const memoryRecordKinds = [
  "fact",
  "assessment",
  "event",
  "commitment",
  "rule",
] as const;
export type MemoryRecordKind = (typeof memoryRecordKinds)[number];

/** How exactly the time of an event is known; no precision — not known at all (`recorded_at` is its upper bound). */
export const memoryPrecisions = ["day", "week", "month", "year"] as const;
export type MemoryPrecision = (typeof memoryPrecisions)[number];

/**
 * A commitment's state. `unconfirmed` — someone else says it is done («Андрей говорит, API готов»), the person has not
 * seen it yet: it stays in the plan until confirmed. `cancelled` — it no longer has to be done («Андрей передумал»).
 */
export const memoryStatuses = [
  "open",
  "unconfirmed",
  "done",
  "cancelled",
] as const;
export type MemoryStatus = (typeof memoryStatuses)[number];

/** How an entity takes part in a record. */
export const memoryRoles = [
  "about",
  "participant",
  "debtor",
  "creditor",
  "subject",
] as const;
export type MemoryRole = (typeof memoryRoles)[number];

export const memoryWriteStatuses = [
  "queued",
  "skipped",
  "done",
  "failed",
  "undone",
] as const;
export type MemoryWriteStatus = (typeof memoryWriteStatuses)[number];

/** A question the writer could not settle by itself (P18): open until the person answers or turns it away. */
export const memoryDraftStatuses = ["open", "answered", "dismissed"] as const;
export type MemoryDraftStatus = (typeof memoryDraftStatuses)[number];

/** The person's answer to a question (P18): a card of the question's, a new card, or «Не запоминать». */
export const memoryAnswerSchema = z.union([
  z.object({ entityId: z.uuid() }),
  z.object({ newCard: z.literal(true) }),
  z.object({ dismiss: z.literal(true) }),
]);

/** What the memory took from one chat, for under its answers (`GET /api/memory/chats/[id]`). */
export interface ChatMemory {
  /** Off — no model holds the «Память» job: the chat shows nothing of it. */
  on: boolean;
  /** «Запомнено: …» — per message the person sent. */
  notes: {
    messageId: string;
    writeId: string;
    /** What the message added; with a status — an open commitment it settled («Выполнено: …»). */
    records: {
      id: string;
      text: string;
      status?: Exclude<MemoryStatus, "open">;
    }[];
  }[];
  /** Open questions, under the answer to the message they came from. */
  questions: {
    id: string;
    writeId: string;
    messageId: string;
    question: string;
    candidates: {
      id: string;
      name: string;
      role: string | null;
      kind: MemoryEntityKind;
    }[];
  }[];
}
