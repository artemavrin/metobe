import type {
  MemoryChangeField,
  MemoryDraftStatus,
  MemoryEntityKind,
  MemoryPrecision,
  MemoryRecordKind,
  MemoryRole,
  MemoryRepeat,
  MemoryRuleKind,
  MemoryScheduleKind,
  ReminderRepeat,
  MemoryDismissalKind,
  MemoryStatus,
  MemoryWriteStatus,
} from "@metobe/contracts/memory";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { chats } from "./chat";
import { mailboxes } from "./mail";

// ARCH §19, D39 — the memory: people, organizations and projects from conversations, and what is known and promised
// about them. Every row is its owner's alone (`owner_id`, gone with the user). Texts and names are sealed with the
// owner's data key (`sealed` columns); the dates, statuses, kinds and links the plan asks by stay in the clear.

/** The owner's data key, sealed with SECRETS_KEY — the same columns as `secrets`. Gone with «Забыть всё». */
export const memoryKeys = pgTable("memory_keys", {
  authTag: text("auth_tag").notNull(),
  ciphertext: text("ciphertext").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  iv: text("iv").notNull(),
  /** Fingerprint of the SECRETS_KEY that sealed it; rotation re-seals these rows, not the memory. */
  keyId: text("key_id").notNull(),
  ownerId: text("owner_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }),
});

/** One row per message looked at: why a record exists, and what «Запомнено» undoes. */
export const memoryWrites = pgTable(
  "memory_writes",
  {
    /** Failed reads of the message so far: after three the write is `failed` and the queue goes on (ARCH §19.8.1). */
    attempts: integer("attempts").notNull().default(0),
    /** Set null when the chat is deleted: the memory stays (D39). */
    chatId: uuid("chat_id").references(() => chats.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    error: text("error"),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    id: uuid("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * The material itself, sealed — for a source with no store of its own: a note typed on a card (`{ text, about }`,
     * P22). Null for a chat's message: it is in `messages`.
     */
    sealed: text("sealed"),
    /** When the message was sent: a person's messages are read in this order, one at a time (ARCH §19.8.1). */
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * Where the material came from (ARCH §19.9.5): «chat» today; a mailbox or a meeting later. Only a label to the
     * memory — its adapter knows how to load the material and where to point «Откуда».
     */
    source: text("source").notNull().default("chat"),
    /**
     * The material inside its source: a chat message's id — kept without a foreign key: deleting or editing a
     * message undoes its write by hand. The same material queued again is the same write.
     */
    sourceKey: text("source_key").notNull(),
    status: text("status")
      .$type<MemoryWriteStatus>()
      .notNull()
      .default("queued"),
    /** The person's zone when they sent it (D31): «вчера» and «в среду» are counted in it. */
    timeZone: text("time_zone"),
  },
  (table) => [
    // One material is looked at once, however many times it is queued.
    uniqueIndex("memory_writes_source").on(
      table.ownerId,
      table.source,
      table.sourceKey
    ),
    // The next message of a person's queue.
    index("memory_writes_queue").on(table.ownerId, table.status, table.sentAt),
    check(
      "memory_writes_status",
      sql`${table.status} in ('queued', 'skipped', 'done', 'failed', 'undone')`
    ),
  ]
);

export const memoryEntities = pgTable(
  "memory_entities",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    id: uuid("id").primaryKey(),
    kind: text("kind").$type<MemoryEntityKind>().notNull(),
    /** Merged into another card (ARCH §19.8.5): not read anywhere, kept for «Вернуть». Its keeper gone — back. */
    mergedInto: uuid("merged_into").references(
      (): AnyPgColumn => memoryEntities.id,
      { onDelete: "set null" }
    ),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** `{ name, aliases, role }`, sealed. */
    sealed: text("sealed").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** The write that made the card; undoing it takes the card away if nothing else holds it. Null — made by hand. */
    writeId: uuid("write_id").references(() => memoryWrites.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("memory_entities_owner").on(table.ownerId, table.kind),
    uniqueIndex("memory_entities_self")
      .on(table.ownerId)
      .where(sql`${table.kind} = 'self'`),
    check(
      "memory_entities_kind",
      sql`${table.kind} in ('self', 'person', 'org', 'project', 'group', 'custom')`
    ),
  ]
);

export const memoryRecords = pgTable(
  "memory_records",
  {
    /** The write that closed it (a fact's `valid_to`, a commitment's new status); undoing the write reopens it. */
    closedByWrite: uuid("closed_by_write").references(() => memoryWrites.id, {
      onDelete: "set null",
    }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    /** When a commitment was done or cancelled. */
    doneAt: timestamp("done_at", { withTimezone: true }),
    /** A commitment: when it was given (`given_at`), and when it is due. Not the same day. */
    dueAt: timestamp("due_at", { withTimezone: true }),
    /** A reminder: when it went off and was not marked since; a plain one is done (`done_at`) as it goes off. */
    firedAt: timestamp("fired_at", { withTimezone: true }),
    /** A reminder about a commitment: told in the commitment's words (it has none of its own), and no more once that
     * one is over. */
    forRecordId: uuid("for_record_id").references(
      (): AnyPgColumn => memoryRecords.id,
      { onDelete: "cascade" }
    ),
    givenAt: timestamp("given_at", { withTimezone: true }),
    id: uuid("id").primaryKey(),
    /** A commitment the person called important in so many words («горит», «главное»), or marked by hand — never guessed. */
    important: boolean("important").notNull().default(false),
    /** A rule's period or threshold in days: «раз в две недели» — 14, «ждём пять рабочих дней» — 5 (`working_days`). */
    intervalDays: integer("interval_days"),
    kind: text("kind").$type<MemoryRecordKind>().notNull(),
    /** A reminder: when it goes off next — the time of day the person named, on its day (D45). */
    nextAt: timestamp("next_at", { withTimezone: true }),
    /** When it happened, as exactly as the person said; empty — not known. «Давно не было» counts from here. */
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    occurredPrecision: text("occurred_precision").$type<MemoryPrecision>(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** When it entered Metobe — the upper bound of when it happened. */
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** A `date` schedule: how often its day (`occurred_at`) comes again (ARCH §19.8.7); a reminder: how often it comes
     * again; null — neither, or once. */
    repeat: text("repeat").$type<MemoryRepeat | ReminderRepeat>(),
    /** A reminder that comes every week on chosen weekdays («пн, ср, пт»): 0 is Sunday; null — the day it came on. */
    repeatDays: smallint("repeat_days").array(),
    /** A rule «Не упустить» counts days by (ARCH §19.6); null — a rule it does not, or not a rule. */
    ruleKind: text("rule_kind").$type<MemoryRuleKind>(),
    /** What a schedule is (D45); null — not a schedule. */
    scheduleKind: text("schedule_kind").$type<MemoryScheduleKind>(),
    /** `{ text }`, sealed. */
    sealed: text("sealed").notNull(),
    /** Only a commitment has one. */
    status: text("status").$type<MemoryStatus>(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    supersededBy: uuid("superseded_by"),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validTo: timestamp("valid_to", { withTimezone: true }),
    /** The days of `interval_days` are working days. */
    workingDays: boolean("working_days").notNull().default(false),
    /** Null — put in by hand on the «Память» page. */
    writeId: uuid("write_id").references(() => memoryWrites.id, {
      onDelete: "set null",
    }),
  },
  (table) => {
    const live = sql`${table.supersededAt} is null and ${table.deletedAt} is null`;
    return [
      index("memory_records_owner_kind")
        .on(table.ownerId, table.kind)
        .where(live),
      index("memory_records_due")
        .on(table.ownerId, table.dueAt)
        .where(sql`${table.status} in ('open', 'unconfirmed') and ${live}`),
      index("memory_records_occurred").on(table.ownerId, table.occurredAt),
      index("memory_records_write").on(table.writeId),
      check(
        "memory_records_kind",
        sql`${table.kind} in ('fact', 'assessment', 'event', 'commitment', 'rule', 'schedule')`
      ),
      check(
        "memory_records_precision",
        sql`(${table.occurredAt} is null) = (${table.occurredPrecision} is null)
          and (${table.occurredPrecision} is null or ${table.occurredPrecision} in ('day', 'week', 'month', 'year'))`
      ),
      check(
        "memory_records_status",
        sql`(${table.kind} = 'commitment') = (${table.status} is not null)
          and (${table.status} is null or ${table.status} in ('open', 'unconfirmed', 'done', 'cancelled'))`
      ),
      index("memory_records_next")
        .on(table.nextAt)
        .where(
          sql`${table.nextAt} is not null and ${table.doneAt} is null and ${live}`
        ),
      check(
        "memory_records_important",
        sql`not ${table.important} or ${table.kind} = 'commitment'`
      ),
      check(
        "memory_records_rule",
        sql`(${table.ruleKind} is null or (${table.kind} = 'rule' and ${table.ruleKind} = 'wait' and ${table.intervalDays} > 0))
          and (${table.intervalDays} is null or ${table.ruleKind} = 'wait' or ${table.scheduleKind} = 'rhythm')`
      ),
      check(
        "memory_records_schedule",
        sql`(${table.kind} = 'schedule') = (${table.scheduleKind} is not null)
          and (${table.scheduleKind} is null
            or (${table.scheduleKind} = 'reminder' and ${table.nextAt} is not null
              and (${table.repeat} is null or ${table.repeat} in ('day', 'weekdays', 'week', 'month', 'year')))
            or (${table.scheduleKind} = 'date' and ${table.occurredAt} is not null and ${table.repeat} in ('year', 'month', 'week'))
            or (${table.scheduleKind} = 'rhythm' and ${table.intervalDays} > 0 and ${table.repeat} is null))
          and (${table.repeat} is null or ${table.kind} = 'schedule')
          and (${table.repeatDays} is null or (${table.scheduleKind} = 'reminder' and ${table.repeat} = 'week'))
          and ((${table.nextAt} is null and ${table.firedAt} is null and ${table.forRecordId} is null)
            or ${table.scheduleKind} = 'reminder')`
      ),
    ];
  }
);

export const memoryRecordEntities = pgTable(
  "memory_record_entities",
  {
    entityId: uuid("entity_id")
      .notNull()
      .references(() => memoryEntities.id, { onDelete: "cascade" }),
    recordId: uuid("record_id")
      .notNull()
      .references(() => memoryRecords.id, { onDelete: "cascade" }),
    role: text("role").$type<MemoryRole>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.recordId, table.entityId, table.role] }),
    index("memory_record_entities_entity").on(table.entityId),
    check(
      "memory_record_entities_role",
      sql`${table.role} in ('about', 'participant', 'debtor', 'creditor', 'subject', 'group')`
    ),
  ]
);

/**
 * «Какой Андрей?» (P18): records of a write that wait for the person to say which card. `sealed` holds the question,
 * the candidate cards and the records; answering puts them in under the write, so undoing the write takes them too.
 */
export const memoryDrafts = pgTable(
  "memory_drafts",
  {
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    id: uuid("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** `{ question, name, candidates, records }`, sealed. */
    sealed: text("sealed").notNull(),
    status: text("status").$type<MemoryDraftStatus>().notNull().default("open"),
    writeId: uuid("write_id")
      .notNull()
      .references(() => memoryWrites.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("memory_drafts_open")
      .on(table.ownerId, table.createdAt)
      .where(sql`${table.status} = 'open'`),
    index("memory_drafts_write").on(table.writeId),
    check(
      "memory_drafts_status",
      sql`${table.status} in ('open', 'answered', 'dismissed', 'expired')`
    ),
  ]
);

/**
 * A commitment's history (D39, P16): «Срок перенесён: 13 ноя → 17 ноя», «Статус: открыто → выполнено». A text
 * correction is a new version of the record instead (`superseded_by`). `write_id` — the message that changed it:
 * undoing the write puts `before` back and drops the line; null — changed by hand.
 */
export const memoryChanges = pgTable(
  "memory_changes",
  {
    after: text("after"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    /** A status, an ISO instant or `true`/`false` — the record keeps these in the clear too. */
    before: text("before"),
    field: text("field").$type<MemoryChangeField>().notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    recordId: uuid("record_id")
      .notNull()
      .references(() => memoryRecords.id, { onDelete: "cascade" }),
    writeId: uuid("write_id").references(() => memoryWrites.id, {
      onDelete: "cascade",
    }),
  },
  (table) => [
    index("memory_changes_record").on(table.recordId, table.at),
    index("memory_changes_write").on(table.writeId),
    check(
      "memory_changes_field",
      sql`${table.field} in ('status', 'due', 'important')`
    ),
  ]
);

/**
 * What the person took away, by kind (`MemoryDismissalKind`), and from what: «Убрать» in «Не упустить» (P17) — a
 * promise while its deadline and status stay what they were then (`as_of`, `status`), a rhythm row with a card while
 * the last contact is the one it was (`as_of`), a date for its `day`, a letter while the person's last one in the
 * thread is the one it was (`as_of`); «Оставить» in «Сверка» (`keep`, from `at`); a reminder letter sent (`reminded`,
 * `at` and the deadline and status it was about); «Сверка» put away for the week starting `day`; «Не надо» on the offer
 * to read mail; «Разные» on a pair of cards (`entity_id` < `other_entity_id`). «Вернуть» deletes the row.
 */
export const memoryDismissals = pgTable(
  "memory_dismissals",
  {
    /** The moment the row stood on then: a promise's deadline, a rhythm's last contact, a letter's sending. */
    asOf: timestamp("as_of", { withTimezone: true }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    /** A date's day (`date`), the Monday of the week (`review`). */
    day: date("day", { mode: "string" }),
    /** The rhythm row's card, or the first card of a pair. */
    entityId: uuid("entity_id").references(() => memoryEntities.id, {
      onDelete: "cascade",
    }),
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").$type<MemoryDismissalKind>().notNull(),
    /** A letter's key in its box (`memory_mail_waits.key`). */
    letter: text("letter"),
    mailboxId: uuid("mailbox_id").references(() => mailboxes.id, {
      onDelete: "cascade",
    }),
    /** The second card of a pair. */
    otherEntityId: uuid("other_entity_id").references(() => memoryEntities.id, {
      onDelete: "cascade",
    }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    recordId: uuid("record_id").references(() => memoryRecords.id, {
      onDelete: "cascade",
    }),
    status: text("status").$type<MemoryStatus>(),
  },
  (table) => [
    unique("memory_dismissals_target")
      .on(
        table.ownerId,
        table.kind,
        table.recordId,
        table.entityId,
        table.otherEntityId,
        table.mailboxId,
        table.letter,
        table.day
      )
      .nullsNotDistinct(),
    check(
      "memory_dismissals_kind",
      sql`${table.kind} in ('commitment', 'rhythm', 'date', 'keep', 'reminded', 'review', 'mail', 'mail_offer', 'merge_pair')`
    ),
  ]
);

/**
 * Two cards made one (ARCH §19.8.5): `gone` went into `keep`. `sealed` holds what «Вернуть» needs — the links moved
 * and those dropped as repeats, the other names added, the role before, the «Убрать» rows moved — sealed: names.
 */
export const memoryMerges = pgTable(
  "memory_merges",
  {
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    goneId: uuid("gone_id")
      .notNull()
      .references(() => memoryEntities.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey(),
    keepId: uuid("keep_id")
      .notNull()
      .references(() => memoryEntities.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sealed: text("sealed").notNull(),
    undoneAt: timestamp("undone_at", { withTimezone: true }),
  },
  (table) => [index("memory_merges_owner").on(table.ownerId)]
);

/**
 * A card's short account, written by the «Память» model from the card's records (Г2.1 «Кратко», ARCH §19.9): who they
 * are, how to talk to them, what matters now — each sentence with the records it stands on. `sealed` is
 * `{ who, how, now, count }`; `covers_at` — the newest record that went into it, so a newer one makes it stale.
 */
export const memorySummaries = pgTable(
  "memory_summaries",
  {
    builtAt: timestamp("built_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    coversAt: timestamp("covers_at", { withTimezone: true }).notNull(),
    entityId: uuid("entity_id")
      .primaryKey()
      .references(() => memoryEntities.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sealed: text("sealed").notNull(),
  },
  (table) => [index("memory_summaries_owner").on(table.ownerId)]
);

/**
 * A letter the person sent someone from the memory, with no answer yet (Г3.1, S16): found by envelopes and headers
 * alone — no letter's text is read or kept. `key` — the letter's `Message-ID` under the installation's HMAC, for the
 * row and for «Убрать» (`memory_dismissals` of kind `mail`); `sent_at` — the person's last letter in the thread, the wait counts from
 * it; `answered_at` — an answer came (or the letter is no longer one to wait on), the row is gone from «Не упустить».
 * `sealed` is `{ subject, to, messageId, references }`.
 */
export const memoryMailWaits = pgTable(
  "memory_mail_waits",
  {
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => memoryEntities.id, { onDelete: "cascade" }),
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    mailboxId: uuid("mailbox_id")
      .notNull()
      .references(() => mailboxes.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sealed: text("sealed").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("memory_mail_waits_owner").on(table.ownerId),
    uniqueIndex("memory_mail_waits_letter").on(table.mailboxId, table.key),
  ]
);
