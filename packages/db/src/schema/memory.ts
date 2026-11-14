import type {
  MemoryChangeField,
  MemoryDraftStatus,
  MemoryEntityKind,
  MemoryPrecision,
  MemoryRecordKind,
  MemoryRole,
  MemoryRepeat,
  MemoryRuleKind,
  ReminderRepeat,
  MemoryStatus,
  MemoryWriteStatus,
} from "@metobe/contracts/memory";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { chats } from "./chat";

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
    givenAt: timestamp("given_at", { withTimezone: true }),
    id: uuid("id").primaryKey(),
    /** A commitment the person called important in so many words («горит», «главное»), or marked by hand — never guessed. */
    important: boolean("important").notNull().default(false),
    /** A rule's period or threshold in days: «раз в две недели» — 14, «ждём пять рабочих дней» — 5 (`working_days`). */
    intervalDays: integer("interval_days"),
    kind: text("kind").$type<MemoryRecordKind>().notNull(),
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
    /** A commitment the person asked to be reminded of: the moment (the time of day they named, on its day); null — no
     * reminder. `reminded_at` — when it was sent; changing `remind_at` makes it null again. */
    remindAt: timestamp("remind_at", { withTimezone: true }),
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    /** A `date` rule: how often its day (`occurred_at`) comes again (ARCH §19.8.7); a commitment with a reminder: how
     * often the reminder comes again (шаг 6); null — neither. */
    repeat: text("repeat").$type<MemoryRepeat | ReminderRepeat>(),
    /** A rule «Не упустить» counts days by (ARCH §19.6); null — a rule it does not, or not a rule. */
    ruleKind: text("rule_kind").$type<MemoryRuleKind>(),
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
        sql`${table.kind} in ('fact', 'assessment', 'event', 'commitment', 'rule')`
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
      check(
        "memory_records_remind",
        sql`${table.remindAt} is null or ${table.kind} = 'commitment'`
      ),
      index("memory_records_remind")
        .on(table.remindAt)
        .where(
          sql`${table.remindAt} is not null and ${table.remindedAt} is null`
        ),
      check(
        "memory_records_important",
        sql`not ${table.important} or ${table.kind} = 'commitment'`
      ),
      check(
        "memory_records_rule",
        sql`(${table.ruleKind} is null or (${table.kind} = 'rule' and (
            (${table.ruleKind} in ('rhythm', 'wait') and ${table.intervalDays} > 0)
            or (${table.ruleKind} = 'date' and ${table.intervalDays} is null and ${table.repeat} in ('year', 'month', 'week') and ${table.occurredAt} is not null))))
          and (${table.intervalDays} is null or ${table.kind} = 'rule')
          and (${table.repeat} is null or ${table.ruleKind} = 'date'
            or (${table.kind} = 'commitment' and ${table.remindAt} is not null
              and ${table.repeat} in ('day', 'weekdays', 'week', 'month', 'year')))`
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
 * «Убрать» in «На сегодня» (P17): a commitment the person does not want suggested — while its deadline and status
 * stay what they were then. A new deadline or status brings it back; so does «Вернуть» (the row goes).
 */
export const memoryDismissals = pgTable(
  "memory_dismissals",
  {
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    /** A commitment's deadline then; for a rhythm row — the day of the last contact then. */
    dueAt: timestamp("due_at", { withTimezone: true }),
    /** The rhythm row's card: one rule may keep the rhythm with several people («с каждым из команды»). */
    entityId: uuid("entity_id").references(() => memoryEntities.id, {
      onDelete: "cascade",
    }),
    /** The row: a commitment's id, or a rule's id and the card's (`rule:card`) — portable, unlike a nullable key. */
    key: text("key").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Null for a pair of cards said to be different (`merge:<a>:<b>`, ARCH §19.8.5). */
    recordId: uuid("record_id").references(() => memoryRecords.id, {
      onDelete: "cascade",
    }),
    status: text("status").$type<MemoryStatus>(),
  },
  (table) => [index("memory_dismissals_owner").on(table.ownerId)]
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
