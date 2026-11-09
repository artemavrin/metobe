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

/** What of a commitment its history tracks; a text correction is a new version of the record instead. */
export const memoryChangeFields = ["status", "due", "important"] as const;
export type MemoryChangeField = (typeof memoryChangeFields)[number];

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

// --- the «Память» page (P16) ----------------------------------------------------------------------------------------

/** A card in the list: who it is, and how many of its commitments are open and past their day. */
export interface MemoryCardItem {
  id: string;
  kind: Exclude<MemoryEntityKind, "self">;
  name: string;
  aliases: string[];
  role: string | null;
  open: number;
  overdue: number;
}

/** A record as the page shows it; dates are ISO instants (a day's midnight in the person's zone). */
export interface MemoryRecordView {
  id: string;
  kind: MemoryRecordKind;
  text: string;
  /** The cards it points at and how; `self` is the person. */
  entities: {
    id: string;
    kind: MemoryEntityKind;
    name: string;
    role: MemoryRole;
  }[];
  occurredAt: string | null;
  occurredPrecision: MemoryPrecision | null;
  validFrom: string | null;
  /** Set — the fact was true until then: «Раньше». */
  validTo: string | null;
  givenAt: string | null;
  dueAt: string | null;
  status: MemoryStatus | null;
  important: boolean;
  doneAt: string | null;
  recordedAt: string;
  /** Deleted with «Вернуть» still on offer. */
  deletedAt: string | null;
  /** The chat it was said in; null — put in by hand, or the chat is deleted (`fromChat` tells which). */
  chatId: string | null;
  fromChat: boolean;
}

/** `GET /api/memory`: the list on the left. Off — no «Память» model: the page says the memory is off. */
export interface MemoryOverview {
  on: boolean;
  /** Who turned it off: no «Память» model in the service, or the person in their account settings. */
  off?: "service" | "person";
  cards: MemoryCardItem[];
  /** «Не записано»: the open questions (P18), answered with `POST /api/memory/questions/[id]`. */
  questions: ChatMemory["questions"];
  rules: MemoryRecordView[];
}

/** `GET /api/memory/cards/[id]`. */
export interface MemoryCard {
  card: MemoryCardItem;
  records: MemoryRecordView[];
}

/** `GET /api/memory/search?q=`: cards by name and records by text; done and cancelled ones too. */
export interface MemorySearch {
  cards: MemoryCardItem[];
  records: MemoryRecordView[];
}

/** `GET /api/memory/records/[id]/source`: «Откуда» and the record's history. */
export interface MemoryRecordSource {
  /** The chat and what the person said there; null chat — deleted, null `said` — put in by hand. */
  chat: { id: string; title: string } | null;
  said: string | null;
  saidAt: string | null;
  recordedAt: string;
  /** Earlier texts, newest first. */
  versions: { text: string; recordedAt: string }[];
  /** Status, deadline and «важно» as they changed, oldest first; `before`/`after` — a status, an ISO instant or `true`/`false`. */
  changes: {
    field: MemoryChangeField;
    before: string | null;
    after: string | null;
    at: string;
    /** The chat whose message changed it; null — by hand. */
    chatId: string | null;
    byHand: boolean;
  }[];
}

/** `PATCH /api/memory/records/[id]`: a new text is a correction (a new version, a new id); the rest — a commitment's. */
export const memoryRecordPatchSchema = z
  .object({
    dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
    important: z.boolean().optional(),
    status: z.enum(memoryStatuses).optional(),
    text: z.string().trim().min(1).max(2000).optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), {
    message: "nothing to change",
  });
export type MemoryRecordPatch = z.infer<typeof memoryRecordPatchSchema>;

/** `PATCH /api/memory/cards/[id]`. */
export const memoryCardPatchSchema = z
  .object({
    aliases: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
    name: z.string().trim().min(1).max(200).optional(),
    role: z.string().trim().max(500).nullable().optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), {
    message: "nothing to change",
  });
