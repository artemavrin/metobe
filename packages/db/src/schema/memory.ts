import type {
  MemoryDraftStatus,
  MemoryEntityKind,
  MemoryPrecision,
  MemoryRecordKind,
  MemoryRole,
  MemoryStatus,
  MemoryWriteStatus,
} from "@metobe/contracts/memory";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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
    /** The message — kept without a foreign key: deleting or editing a message undoes its write by hand. */
    messageId: uuid("message_id").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status")
      .$type<MemoryWriteStatus>()
      .notNull()
      .default("queued"),
  },
  (table) => [
    // One message is looked at once, however many times it is queued.
    uniqueIndex("memory_writes_message").on(table.ownerId, table.messageId),
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
      sql`${table.kind} in ('self', 'person', 'org', 'project')`
    ),
  ]
);

export const memoryRecords = pgTable(
  "memory_records",
  {
    /** The write that closed it (a fact's `valid_to`, a commitment's «done»); undoing the write reopens it. */
    closedByWrite: uuid("closed_by_write").references(() => memoryWrites.id, {
      onDelete: "set null",
    }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    doneAt: timestamp("done_at", { withTimezone: true }),
    /** A commitment: when it was given (`given_at`), and when it is due. Not the same day. */
    dueAt: timestamp("due_at", { withTimezone: true }),
    givenAt: timestamp("given_at", { withTimezone: true }),
    id: uuid("id").primaryKey(),
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
    /** `{ text }`, sealed. */
    sealed: text("sealed").notNull(),
    /** Only a commitment has one. */
    status: text("status").$type<MemoryStatus>(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    supersededBy: uuid("superseded_by"),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validTo: timestamp("valid_to", { withTimezone: true }),
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
        .where(sql`${table.status} = 'open' and ${live}`),
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
          and (${table.status} is null or ${table.status} in ('open', 'done'))`
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
      sql`${table.role} in ('about', 'participant', 'debtor', 'creditor', 'subject')`
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
      sql`${table.status} in ('open', 'answered', 'dismissed')`
    ),
  ]
);
