import { z } from "zod";

// What the memory keeps (ARCH §19, D39). Words only here: the columns the plan queries stay in the clear, the texts
// are sealed (core/memory-crypto).

/** `self` is the person themselves — one per owner; without it «who owes whom» has no one to point at. */
/**
 * `group` — people the person names as one («моя команда», «отдел продаж», «подрядчики»): who is in it is a fact
 * linking a person to it (role `group`), so a rule «с каждым из команды» keeps up with who joins and who leaves.
 * `custom` — a thing of a kind the person named themselves (D42): a bus, a contract, a pet. The kind is a word on the
 * card (`type`, «автобус», «кот»); the app has no word of its own for «a thing».
 */
export const memoryEntityKinds = [
  "self",
  "person",
  "org",
  "project",
  "group",
  "custom",
] as const;
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

/**
 * What a rule asks of «Не упустить» (ARCH §19.6): `rhythm` — how often the person wants to be in touch with someone
 * («один на один с Андреем раз в две недели»); `wait` — how long a reply or result from others may take before it is
 * worth asking («ответа ждём пять рабочих дней»). Other rules have neither, and nothing counts days by them.
 */
export const memoryRuleKinds = ["rhythm", "wait"] as const;
export type MemoryRuleKind = (typeof memoryRuleKinds)[number];

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
  "group",
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
    /**
     * What the message added; with a status — an open commitment it settled («Выполнено: …»); with `due` — one whose
     * deadline it moved (ISO instants, null — none); with `replaced` — the text of the fact or event it took the place of.
     */
    records: {
      id: string;
      text: string;
      status?: Exclude<MemoryStatus, "open">;
      due?: { from: string | null; to: string | null };
      replaced?: string;
    }[];
  }[];
  /** Open questions, under the answer to the message they came from. */
  questions: {
    id: string;
    writeId: string;
    /** The chat's message it came from; null — from another source. */
    messageId: string | null;
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
  /** A card of kind `custom`: its kind as the person says it («автобус»); null — not known. */
  type: string | null;
  /** How to reach them; null — not known. */
  email: string | null;
  phone: string | null;
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
  /** A later message replaced it (an event): «Раньше». A hand correction's old version is not shown at all. */
  supersededAt: string | null;
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
  /** What the person told about themselves — goals, work, what they have, how they like it done: «Обо мне». */
  me: MemoryRecordView[];
}

/** `GET /api/memory/cards/[id]`. */
export interface MemoryCard {
  card: MemoryCardItem;
  records: MemoryRecordView[];
  /** A group's people now (who joined and has not left), for «Участники». */
  members?: { id: string; name: string; kind: MemoryEntityKind }[];
  /**
   * A person's or an organization's «что сейчас» (P22): the last event with them (ISO, null — none yet) and how often
   * a rhythm rule wants one, in days (null — no rule).
   */
  contact?: { last: string | null; every: number | null };
  /** The groups a person is in now and the projects their records name, for the line under the role. */
  links?: { id: string; name: string; kind: "group" | "project" }[];
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
  /** `said` is a note typed on a card (P22 «Записать…»), not a chat's message. */
  note: boolean;
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
    email: z.email().max(200).nullable().optional(),
    name: z.string().trim().min(1).max(200).optional(),
    phone: z
      .string()
      .trim()
      .regex(/^[+\d][\d\s().-]{3,29}$/u)
      .nullable()
      .optional(),
    role: z.string().trim().max(500).nullable().optional(),
    type: z.string().trim().max(60).nullable().optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), {
    message: "nothing to change",
  });

/** `POST /api/memory/cards` («+» next to a section of the list): a card by hand. */
export const memoryCardCreateSchema = z.object({
  kind: z.enum(["person", "org", "project", "group", "custom"]),
  name: z.string().trim().min(1).max(200),
  /** A thing of the person's own kind: what it is, as they say it («автобус»). */
  type: z.string().trim().max(60).optional(),
});

/** `POST /api/memory/rules` («Правила»): a rule in words — the memory reads it like a note and makes a rule of it. */
export const memoryRuleSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

/** `POST /api/memory/cards/[id]/notes` (P22 «Записать…»): a note typed on the card; the memory picks its section. */
export const memoryNoteSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

/**
 * What became of a note: `done` — `records` went in (with «Отменить» by `writeId`), or `asked` — a question waits in
 * «Не записано»; `skipped` — nothing to keep; `queued` — not read yet, it will be; `off` — the memory is off.
 */
export interface MemoryNoteResult {
  writeId: string | null;
  status: "done" | "skipped" | "queued" | "failed" | "off";
  records: MemoryRecordView[];
  asked: boolean;
}

// --- «На сегодня» (P17) ---------------------------------------------------------------------------------------------

/** Why a commitment is in «На сегодня»: the order of these is the order of the rows after «важно». */
export const memorySuggestionReasons = [
  "overdue",
  "unconfirmed",
  "waiting",
  "today",
  "tomorrow",
  "rhythm",
  "important",
] as const;
export type MemorySuggestionReason = (typeof memorySuggestionReasons)[number];

/**
 * A row of «Не упустить»: an open commitment and why it is there now, or — `rhythm` — a person the person wants to be
 * in touch with more often than they have been (a rule, ARCH §19.6).
 */
export interface MemorySuggestion {
  /** The row: the commitment's id, or the rule's and the card's for a rhythm row (`rule:card`). */
  key: string;
  /** The commitment's id, or the rule's. */
  id: string;
  kind: "commitment" | "rhythm";
  reason: MemorySuggestionReason;
  /** Days past the deadline (`overdue`), of waiting (`waiting`), since the last contact (`rhythm`). */
  days: number;
  text: string;
  /** `theirs` — someone owes the person; `mine` — the person owes, or keeps the rhythm; `between` — two others. */
  side: "theirs" | "mine" | "between";
  /** The other side: who owes, whom the person owes, whom to be in touch with. */
  who: { id: string; name: string; kind: MemoryEntityKind } | null;
  dueAt: string | null;
  /** A commitment's; none for a rhythm row. */
  status: MemoryStatus | null;
  important: boolean;
  /** A rhythm row: the last contact (null — none yet, counted from the rule) and the rule's period in days. */
  rhythm: { since: string | null; every: number } | null;
}

// --- merging cards (ARCH §19.8.5) -----------------------------------------------------------------------------------

/** One side of «Один человек?». */
export interface MemoryMergeCard {
  id: string;
  kind: Exclude<MemoryEntityKind, "self">;
  name: string;
  role: string | null;
}

/** «Один человек?» in «Не записано»: two cards that may be one; `keep` is the one left after «Объединить». */
export interface MemoryMergeSuggestion {
  keep: MemoryMergeCard;
  gone: MemoryMergeCard;
}

/** POST /api/memory/cards/[id]/merge: this card goes into `into`. */
export const memoryMergeSchema = z.object({ into: z.uuid() });

/** POST /api/memory/merges/dismiss: «Разные» — the pair is not offered again. */
export const memoryMergePairSchema = z.object({ a: z.uuid(), b: z.uuid() });
