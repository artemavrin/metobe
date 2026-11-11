import "server-only";
import type {
  ChatMemory,
  MemoryChangeField,
  MemoryEntityKind,
  MemoryPrecision,
  MemoryRecordKind,
  MemoryRepeat,
  MemoryRole,
  MemoryRuleKind,
  MemoryStatus,
  MemoryWriteStatus,
} from "@metobe/contracts/memory";
import type { Db } from "@metobe/db/client";
import {
  memoryChanges,
  memoryDismissals,
  memoryDrafts,
  memoryEntities,
  memoryKeys,
  memoryMerges,
  memoryRecordEntities,
  memoryRecords,
  memorySummaries,
  memoryWrites,
} from "@metobe/db/schema/memory";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  notExists,
  sql,
} from "drizzle-orm";
import { z } from "zod";

import { getDb } from "./db";
import { likelySame } from "./memory-candidates";
import { memoryAad, newDataKey, openField, sealField } from "./memory-crypto";
import { memoryKeyAad, openWithMasterKey, sealWithMasterKey } from "./secrets";
import { parseKey } from "./secrets-crypto";
import type { SecretsKey } from "./secrets-crypto";

// The one place the memory is written and read (ARCH §19, D39). Every function takes the owner first and touches
// only their rows: nothing else in the app reaches these tables. Texts and names are sealed with the owner's data
// key on the way in and opened on the way out; the plan's own columns (dates, statuses, kinds, links) stay in the clear.

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// --- data keys ---------------------------------------------------------------------------------------------------

// On globalThis, like the pool: the dev server holds several copies of this module, and `forgetAll` in one must
// reach the cache of the others — a stale key would go on sealing texts nothing can open.
const CACHE = Symbol.for("metobe.memory.keys");
/** The key, and the `iv` of the row it came from: which key it is, when another process may have made a new one. */
interface Cached {
  key: SecretsKey;
  iv: string;
}
const global = globalThis as { [CACHE]?: Map<string, Cached> };
const cache = () => (global[CACHE] ??= new Map<string, Cached>());

/** The owner's data key; made on the first write (`create`), otherwise null — a person with nothing kept has no key. */
const dataKey = async (
  ownerId: string,
  create: boolean
): Promise<SecretsKey | null> => {
  const { db } = getDb();
  const cached = cache().get(ownerId);
  if (cached && !create) {
    return cached.key;
  }
  if (cached) {
    // Before a write: «Забыть всё» in another process (the web, while this is the worker) took the key away or put a
    // new one in its place, and a text sealed with the old one could never be opened.
    const [still] = await db
      .select({ iv: memoryKeys.iv })
      .from(memoryKeys)
      .where(eq(memoryKeys.ownerId, ownerId))
      .limit(1);
    if (still?.iv === cached.iv) {
      return cached.key;
    }
    cache().delete(ownerId);
  }
  const read = async () => {
    const [found] = await db
      .select()
      .from(memoryKeys)
      .where(eq(memoryKeys.ownerId, ownerId))
      .limit(1);
    return found;
  };
  let row = await read();
  if (!(row || create)) {
    return null;
  }
  if (!row) {
    const fresh = sealWithMasterKey(
      newDataKey().key.toString("base64"),
      memoryKeyAad(ownerId)
    );
    // Two writes at once: the first key stands, and both read it back.
    await db
      .insert(memoryKeys)
      .values({ ...fresh, ownerId })
      .onConflictDoNothing();
    row = await read();
  }
  if (!row) {
    throw new Error("memory: the data key was not saved");
  }
  const key = parseKey(openWithMasterKey(row, memoryKeyAad(ownerId)));
  cache().set(ownerId, { iv: row.iv, key });
  return key;
};

const ENTITIES = "memory_entities";
const RECORDS = "memory_records";
const DRAFTS = "memory_drafts";
const MERGES = "memory_merges";
const SUMMARIES = "memory_summaries";
const WRITES = "memory_writes";
const BODY = "body";

// --- entities ----------------------------------------------------------------------------------------------------

const entityBody = z.object({
  aliases: z.array(z.string()),
  /** Where to write and call them; cards sealed before they existed have none. */
  email: z.string().nullable().default(null),
  name: z.string(),
  phone: z.string().nullable().default(null),
  role: z.string().nullable(),
  /** Kind `custom`: what kind of thing it is, as the person says it (D42). */
  type: z.string().nullable().default(null),
});

export interface MemoryEntity {
  id: string;
  kind: MemoryEntityKind;
  /** The name it is known by; `aliases` are the other ways it is called. */
  name: string;
  aliases: string[];
  /** «закупщик поставщика», «наш перевозчик»: who it is to the person. */
  role: string | null;
  /** How to reach them: put in by hand (later — read from letters). */
  email: string | null;
  phone: string | null;
  /** Kind `custom`: «автобус», «кот»; null for the others and for a thing of no known kind. */
  type: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const sealEntity = (
  ownerId: string,
  id: string,
  body: z.input<typeof entityBody>,
  key: SecretsKey
) =>
  sealField(JSON.stringify(body), memoryAad(ownerId, ENTITIES, id, BODY), key);

const toEntity = (
  row: typeof memoryEntities.$inferSelect,
  key: SecretsKey
): MemoryEntity => {
  const body = entityBody.parse(
    JSON.parse(
      openField(row.sealed, memoryAad(row.ownerId, ENTITIES, row.id, BODY), key)
    )
  );
  return {
    aliases: body.aliases,
    createdAt: row.createdAt,
    email: body.email,
    id: row.id,
    kind: row.kind,
    name: body.name,
    phone: body.phone,
    role: body.role,
    type: body.type,
    updatedAt: row.updatedAt,
  };
};

/**
 * Where merged cards went (ARCH §19.8.5): a card's id to the card it is part of now — itself when it was never merged.
 * A question asked before a merge, or a write read after it, still lands on the card that is left.
 */
const mergedTo = async (db: Db | Tx, ownerId: string) => {
  const rows = await db
    .select({ id: memoryEntities.id, into: memoryEntities.mergedInto })
    .from(memoryEntities)
    .where(
      and(
        eq(memoryEntities.ownerId, ownerId),
        isNotNull(memoryEntities.mergedInto)
      )
    );
  const next = new Map(rows.map((r) => [r.id, r.into as string]));
  return (id: string) => {
    let at = id;
    // A chain is short: a card merged into one merged later. The bound only guards a cycle.
    for (let hop = 0; hop < next.size && next.has(at); hop += 1) {
      at = next.get(at) as string;
    }
    return at;
  };
};

export interface EntityInput {
  kind: Exclude<MemoryEntityKind, "self">;
  name: string;
  aliases?: string[];
  role?: string | null;
  /** Kind `custom`: what kind of thing it is, as the person says it. */
  type?: string | null;
  /** The write that found it: undoing the write takes the card away with it. */
  writeId?: string;
}

const insertEntity = async (
  tx: Db | Tx,
  ownerId: string,
  key: SecretsKey,
  input: EntityInput
) => {
  const name = input.name.trim();
  if (!name) {
    throw new Error("memory: an entity needs a name");
  }
  const id = crypto.randomUUID();
  const body = {
    aliases: input.aliases ?? [],
    name,
    role: input.role ?? null,
    type: input.kind === "custom" ? input.type?.trim() || null : null,
  };
  const [row] = await tx
    .insert(memoryEntities)
    .values({
      id,
      kind: input.kind,
      ownerId,
      sealed: sealEntity(ownerId, id, body, key),
      writeId: input.writeId,
    })
    .returning();
  if (!row) {
    throw new Error("memory: the entity was not saved");
  }
  return toEntity(row, key);
};

export const createEntity = async (ownerId: string, input: EntityInput) => {
  const key = await dataKey(ownerId, true);
  if (!key) {
    throw new Error("memory: no data key");
  }
  return insertEntity(getDb().db, ownerId, key, input);
};

/** The person themselves: one card per owner, made when first needed. */
export const ensureSelf = async (ownerId: string, name: string) => {
  const key = await dataKey(ownerId, true);
  if (!key) {
    throw new Error("memory: no data key");
  }
  const { db } = getDb();
  const read = async () => {
    const [row] = await db
      .select()
      .from(memoryEntities)
      .where(
        and(
          eq(memoryEntities.ownerId, ownerId),
          eq(memoryEntities.kind, "self")
        )
      )
      .limit(1);
    return row;
  };
  let row = await read();
  if (!row) {
    const id = crypto.randomUUID();
    await db
      .insert(memoryEntities)
      .values({
        id,
        kind: "self",
        ownerId,
        sealed: sealEntity(ownerId, id, { aliases: [], name, role: null }, key),
      })
      .onConflictDoNothing();
    row = await read();
  }
  if (!row) {
    throw new Error("memory: the owner's card was not saved");
  }
  return toEntity(row, key);
};

/** Changes a card in place; null when the owner has no such card. */
export const updateEntity = async (
  ownerId: string,
  id: string,
  patch: {
    name?: string;
    aliases?: string[];
    role?: string | null;
    email?: string | null;
    phone?: string | null;
    type?: string | null;
  }
) => {
  const key = await dataKey(ownerId, false);
  if (!key) {
    return null;
  }
  const { db } = getDb();
  const where = and(
    eq(memoryEntities.id, id),
    eq(memoryEntities.ownerId, ownerId),
    isNull(memoryEntities.mergedInto)
  );
  const [row] = await db.select().from(memoryEntities).where(where).limit(1);
  if (!row) {
    return null;
  }
  const was = toEntity(row, key);
  const name = patch.name?.trim() ?? was.name;
  if (!name) {
    throw new Error("memory: an entity needs a name");
  }
  const [saved] = await db
    .update(memoryEntities)
    .set({
      sealed: sealEntity(
        ownerId,
        id,
        {
          aliases: patch.aliases ?? was.aliases,
          email: patch.email === undefined ? was.email : patch.email,
          name,
          phone: patch.phone === undefined ? was.phone : patch.phone,
          role: patch.role === undefined ? was.role : patch.role,
          type: patch.type === undefined ? was.type : patch.type,
        },
        key
      ),
      updatedAt: new Date(),
    })
    .where(where)
    .returning();
  return saved ? toEntity(saved, key) : null;
};

// --- records -----------------------------------------------------------------------------------------------------

/** `role` — a fact that says who the card is now («тимлид бэкенда»): the newest one is the card's line. */
const recordBody = z.object({ role: z.string().optional(), text: z.string() });

export interface MemoryRecordInput {
  kind: MemoryRecordKind;
  text: string;
  entities: { entityId: string; role: MemoryRole }[];
  /** When it happened, as exactly as is known; leave out when it is not. */
  occurred?: { at: Date; precision: MemoryPrecision };
  validFrom?: Date;
  validTo?: Date;
  /** A commitment: when it was given, and when it is due. */
  givenAt?: Date;
  dueAt?: Date;
  /** Commitments only; open unless said otherwise. */
  status?: MemoryStatus;
  /** Commitments only: the person said it is important, or marked it so. */
  important?: boolean;
  /** The write it comes from; leave out for what the person put in by hand. */
  writeId?: string;
  /** A fact about who its card is now, in a few words: the card's line follows the newest one. */
  role?: string;
  /** Rules only: what «Не упустить» counts by it, every how many days, working ones or any (ARCH §19.6). */
  rule?: {
    kind: MemoryRuleKind;
    days: number;
    workingDays: boolean;
    /** A `date` rule: how often its day (`occurred`) comes again. */
    repeat?: MemoryRepeat;
  };
}

export interface MemoryRecord {
  id: string;
  kind: MemoryRecordKind;
  text: string;
  entities: { entityId: string; role: MemoryRole }[];
  occurredAt: Date | null;
  occurredPrecision: MemoryPrecision | null;
  validFrom: Date | null;
  validTo: Date | null;
  givenAt: Date | null;
  dueAt: Date | null;
  status: MemoryStatus | null;
  important: boolean;
  /** Set on a fact about who its card is now. */
  role: string | null;
  /** Set on a rule «Не упустить» counts days by. */
  rule: {
    kind: MemoryRuleKind;
    days: number;
    workingDays: boolean;
    repeat?: MemoryRepeat;
  } | null;
  doneAt: Date | null;
  /** The write that closed it (a fact's end, a commitment's status). */
  closedByWrite: string | null;
  recordedAt: Date;
  supersededAt: Date | null;
  /** The record that took its place: a correction by hand, or a later message (ARCH §19.9.3). */
  supersededBy: string | null;
  deletedAt: Date | null;
  writeId: string | null;
}

/** A rule as the row keeps it: a period in days, or a `date` rule's repeat (days: 0). */
const ruleOfRow = (
  row: typeof memoryRecords.$inferSelect
): MemoryRecord["rule"] => {
  if (row.ruleKind === "date" && row.repeat) {
    return {
      days: 0,
      kind: "date",
      repeat: row.repeat,
      workingDays: false,
    };
  }
  return row.ruleKind && row.intervalDays
    ? {
        days: row.intervalDays,
        kind: row.ruleKind,
        workingDays: row.workingDays,
      }
    : null;
};

const toRecord = (
  row: typeof memoryRecords.$inferSelect,
  entities: MemoryRecord["entities"],
  key: SecretsKey
): MemoryRecord => {
  const body = recordBody.parse(
    JSON.parse(
      openField(row.sealed, memoryAad(row.ownerId, RECORDS, row.id, BODY), key)
    )
  );
  return {
    closedByWrite: row.closedByWrite,
    deletedAt: row.deletedAt,
    doneAt: row.doneAt,
    dueAt: row.dueAt,
    entities,
    givenAt: row.givenAt,
    id: row.id,
    important: row.important,
    kind: row.kind,
    occurredAt: row.occurredAt,
    occurredPrecision: row.occurredPrecision,
    recordedAt: row.recordedAt,
    role: body.role ?? null,
    rule: ruleOfRow(row),
    status: row.status,
    supersededAt: row.supersededAt,
    supersededBy: row.supersededBy,
    text: body.text,
    validFrom: row.validFrom,
    validTo: row.validTo,
    writeId: row.writeId,
  };
};

/** Each card's newest live fact about who it is now («тимлид бэкенда»), and when it was put in. */
const currentRoles = async (db: Db, ownerId: string, key: SecretsKey) => {
  const rows = await db
    .select({ entityId: memoryRecordEntities.entityId, record: memoryRecords })
    .from(memoryRecords)
    .innerJoin(
      memoryRecordEntities,
      eq(memoryRecordEntities.recordId, memoryRecords.id)
    )
    .where(
      and(
        eq(memoryRecords.ownerId, ownerId),
        eq(memoryRecords.kind, "fact"),
        isNull(memoryRecords.validTo),
        isNull(memoryRecords.supersededAt),
        isNull(memoryRecords.deletedAt)
      )
    )
    .orderBy(memoryRecords.recordedAt);
  const roles = new Map<string, { role: string; at: Date }>();
  for (const { entityId, record } of rows) {
    const { role } = toRecord(record, [], key);
    if (role) {
      roles.set(entityId, { at: record.recordedAt, role });
    }
  }
  return roles;
};

export const listEntities = async (ownerId: string) => {
  const key = await dataKey(ownerId, false);
  if (!key) {
    return [];
  }
  const { db } = getDb();
  const rows = await db
    .select()
    .from(memoryEntities)
    .where(
      and(
        eq(memoryEntities.ownerId, ownerId),
        isNull(memoryEntities.mergedInto)
      )
    )
    .orderBy(memoryEntities.createdAt);
  const roles = await currentRoles(db, ownerId, key);
  return rows.map((row) => {
    const entity = toEntity(row, key);
    const said = roles.get(entity.id);
    // The newest wins: a role fact from a chat after the card was last edited by hand, or that edit.
    return said && said.at > entity.updatedAt
      ? { ...entity, role: said.role }
      : entity;
  });
};

/** A commitment that is over — done or no longer needed; `unconfirmed` is not over, it waits for the person. */
const ENDED = new Set<MemoryStatus>(["done", "cancelled"]);

/** The record's text, once what it says fits its kind: a status and «важно» are a commitment's, days a rule's. */
const checkedText = (input: MemoryRecordInput) => {
  const text = input.text.trim();
  if (!text) {
    throw new Error("memory: a record needs a text");
  }
  if (input.kind !== "commitment" && (input.status || input.important)) {
    throw new Error("memory: only a commitment has a status");
  }
  if (input.rule && input.kind !== "rule") {
    throw new Error("memory: only a rule counts days");
  }
  if (input.rule?.kind === "date") {
    if (!(input.rule.repeat && input.occurred)) {
      throw new Error("memory: a date rule needs its day and how it repeats");
    }
  } else if (input.rule && !(input.rule.days > 0)) {
    throw new Error("memory: a rule counts more than no days");
  }
  return text;
};

/** A rule's plain columns: what «Не упустить» counts by it, and every how many days. */
const ruleColumns = (rule: MemoryRecordInput["rule"]) => ({
  intervalDays: rule && rule.kind !== "date" ? Math.round(rule.days) : null,
  repeat: rule?.kind === "date" ? (rule.repeat ?? null) : null,
  ruleKind: rule?.kind ?? null,
  workingDays: rule?.workingDays ?? false,
});

const insertRecord = async (
  tx: Tx,
  ownerId: string,
  key: SecretsKey,
  input: MemoryRecordInput
) => {
  const text = checkedText(input);
  const to = await mergedTo(tx, ownerId);
  const links = [
    ...new Map(
      input.entities.map(
        (e) =>
          [
            `${to(e.entityId)}:${e.role}`,
            { entityId: to(e.entityId), role: e.role },
          ] as const
      )
    ).values(),
  ];
  // A record points only at its owner's cards.
  const ids = [...new Set(links.map((l) => l.entityId))];
  if (ids.length > 0) {
    const own = await tx
      .select({ id: memoryEntities.id })
      .from(memoryEntities)
      .where(
        and(
          eq(memoryEntities.ownerId, ownerId),
          inArray(memoryEntities.id, ids)
        )
      );
    if (own.length !== ids.length) {
      throw new Error(
        "memory: a record points at a card that is not the owner's"
      );
    }
  }
  const id = crypto.randomUUID();
  const status = input.kind === "commitment" ? (input.status ?? "open") : null;
  const [row] = await tx
    .insert(memoryRecords)
    .values({
      doneAt: status && ENDED.has(status) ? new Date() : null,
      dueAt: input.dueAt,
      givenAt: input.givenAt,
      id,
      important: input.important ?? false,
      ...ruleColumns(input.rule),
      kind: input.kind,
      occurredAt: input.occurred?.at,
      occurredPrecision: input.occurred?.precision,
      ownerId,
      ruleKind: input.rule?.kind ?? null,
      sealed: sealField(
        JSON.stringify(
          input.kind === "fact" && input.role?.trim()
            ? { role: input.role.trim(), text }
            : { text }
        ),
        memoryAad(ownerId, RECORDS, id, BODY),
        key
      ),
      status,
      validFrom: input.validFrom,
      validTo: input.validTo,
      writeId: input.writeId,
    })
    .returning();
  if (!row) {
    throw new Error("memory: the record was not saved");
  }
  if (links.length > 0) {
    await tx
      .insert(memoryRecordEntities)
      .values(links.map((l) => ({ ...l, recordId: id })));
  }
  return toRecord(row, links, key);
};

export const addRecord = async (ownerId: string, input: MemoryRecordInput) => {
  const key = await dataKey(ownerId, true);
  if (!key) {
    throw new Error("memory: no data key");
  }
  return getDb().db.transaction((tx) => insertRecord(tx, ownerId, key, input));
};

/**
 * A correction («не в среду, а в четверг»): the new record goes in and the old one is marked replaced, in one step.
 * Both stay — the history shows what was known on a date. Null when the owner has no such live record.
 */
export const supersedeRecord = async (
  ownerId: string,
  id: string,
  replacement: MemoryRecordInput
) => {
  const key = await dataKey(ownerId, false);
  if (!key) {
    return null;
  }
  return getDb().db.transaction(async (tx) => {
    const [old] = await tx
      .select({ id: memoryRecords.id })
      .from(memoryRecords)
      .where(
        and(
          eq(memoryRecords.id, id),
          eq(memoryRecords.ownerId, ownerId),
          isNull(memoryRecords.supersededAt),
          isNull(memoryRecords.deletedAt)
        )
      )
      .for("update");
    if (!old) {
      return null;
    }
    const next = await insertRecord(tx, ownerId, key, replacement);
    await tx
      .update(memoryRecords)
      .set({ supersededAt: new Date(), supersededBy: next.id })
      .where(eq(memoryRecords.id, id));
    return next;
  });
};

export interface CommitmentPatch {
  status?: MemoryStatus;
  /** Null — no deadline any more. */
  dueAt?: Date | null;
  important?: boolean;
}

const asText = (v: MemoryStatus | Date | boolean | null) => {
  if (v === null) {
    return null;
  }
  return v instanceof Date ? v.toISOString() : String(v);
};

/**
 * Changes a live commitment of the owner's and writes each change into its history; `writeId` — the message that
 * said it (undoing the write puts it back), none — by hand. `onlyOpen` leaves one closed meanwhile as it is. False when
 * there is no such commitment; a patch that changes nothing is true and leaves no line.
 */
const changeCommitment = async (
  tx: Tx,
  ownerId: string,
  id: string,
  patch: CommitmentPatch,
  { onlyOpen = false, writeId }: { onlyOpen?: boolean; writeId?: string } = {}
) => {
  const [row] = await tx
    .select()
    .from(memoryRecords)
    .where(
      and(
        eq(memoryRecords.id, id),
        eq(memoryRecords.ownerId, ownerId),
        eq(memoryRecords.kind, "commitment"),
        isNull(memoryRecords.supersededAt),
        isNull(memoryRecords.deletedAt),
        onlyOpen
          ? inArray(memoryRecords.status, ["open", "unconfirmed"])
          : undefined
      )
    )
    .for("update");
  if (!row) {
    return false;
  }
  const lines: (typeof memoryChanges.$inferInsert)[] = [];
  const set: Partial<typeof memoryRecords.$inferInsert> = {};
  const line = (
    field: MemoryChangeField,
    before: MemoryStatus | Date | boolean | null,
    after: MemoryStatus | Date | boolean | null
  ) => {
    if (asText(before) !== asText(after)) {
      lines.push({
        after: asText(after),
        before: asText(before),
        field,
        ownerId,
        recordId: id,
        writeId,
      });
    }
  };
  if (patch.status && patch.status !== row.status) {
    line("status", row.status, patch.status);
    set.status = patch.status;
    set.doneAt = ENDED.has(patch.status) ? new Date() : null;
    set.closedByWrite = patch.status === "open" ? null : (writeId ?? null);
  }
  if (patch.dueAt !== undefined) {
    line("due", row.dueAt, patch.dueAt);
    set.dueAt = patch.dueAt;
  }
  if (patch.important !== undefined) {
    line("important", row.important, patch.important);
    set.important = patch.important;
  }
  if (lines.length > 0) {
    await tx.update(memoryRecords).set(set).where(eq(memoryRecords.id, id));
    await tx.insert(memoryChanges).values(lines);
  }
  return true;
};

/**
 * Sets a commitment's status — done, cancelled, said to be done, or open again; `writeId` — the write that said it,
 * so undoing the write puts the status back.
 */
export const setCommitmentStatus = (
  ownerId: string,
  id: string,
  status: MemoryStatus,
  writeId?: string
) =>
  getDb().db.transaction((tx) =>
    changeCommitment(tx, ownerId, id, { status }, { writeId })
  );

/** The «Память» page: status, deadline and «важно» of a commitment, by hand. False — no such live commitment. */
export const editCommitment = (
  ownerId: string,
  id: string,
  patch: CommitmentPatch
) => getDb().db.transaction((tx) => changeCommitment(tx, ownerId, id, patch));

/** Ends a fact's validity (it is «Раньше» from then) or, with null, takes the end back. */
export const setValidTo = async (
  ownerId: string,
  id: string,
  at: Date | null,
  writeId?: string
) => {
  const rows = await getDb()
    .db.update(memoryRecords)
    .set({ closedByWrite: at ? (writeId ?? null) : null, validTo: at })
    .where(
      and(
        eq(memoryRecords.id, id),
        eq(memoryRecords.ownerId, ownerId),
        inArray(memoryRecords.kind, ["fact", "assessment"]),
        isNull(memoryRecords.deletedAt)
      )
    )
    .returning({ id: memoryRecords.id });
  return rows.length > 0;
};

const setDeleted = async (ownerId: string, id: string, at: Date | null) => {
  const rows = await getDb()
    .db.update(memoryRecords)
    .set({ deletedAt: at })
    .where(and(eq(memoryRecords.id, id), eq(memoryRecords.ownerId, ownerId)))
    .returning({ id: memoryRecords.id });
  return rows.length > 0;
};

/** Deleting can be taken back: the record is only hidden. */
export const deleteRecord = (ownerId: string, id: string) =>
  setDeleted(ownerId, id, new Date());

export const restoreRecord = (ownerId: string, id: string) =>
  setDeleted(ownerId, id, null);

export interface MemoryRecordFilter {
  kinds?: MemoryRecordKind[];
  /** Records the card takes part in, in any role. */
  entityId?: string;
  /** Records these writes put in. */
  writeIds?: string[];
  /** Records these writes closed. */
  closedBy?: string[];
  ids?: string[];
  /** Corrections' old versions too. */
  includeSuperseded?: boolean;
  /** Deleted ones too (to offer taking the deletion back). */
  includeDeleted?: boolean;
}

/** Newest event first; what has no date by when it was put in. Opened here, in the process. */
export const listRecords = async (
  ownerId: string,
  filter: MemoryRecordFilter = {}
) => {
  const key = await dataKey(ownerId, false);
  if (!key) {
    return [];
  }
  const { db } = getDb();
  const rows = await db
    .select()
    .from(memoryRecords)
    .where(
      and(
        eq(memoryRecords.ownerId, ownerId),
        filter.includeDeleted ? undefined : isNull(memoryRecords.deletedAt),
        filter.includeSuperseded
          ? undefined
          : isNull(memoryRecords.supersededAt),
        filter.kinds ? inArray(memoryRecords.kind, filter.kinds) : undefined,
        filter.writeIds
          ? inArray(memoryRecords.writeId, filter.writeIds)
          : undefined,
        filter.closedBy
          ? inArray(memoryRecords.closedByWrite, filter.closedBy)
          : undefined,
        filter.ids ? inArray(memoryRecords.id, filter.ids) : undefined,
        filter.entityId
          ? inArray(
              memoryRecords.id,
              db
                .select({ id: memoryRecordEntities.recordId })
                .from(memoryRecordEntities)
                .where(eq(memoryRecordEntities.entityId, filter.entityId))
            )
          : undefined
      )
    )
    .orderBy(
      sql`coalesce(${memoryRecords.occurredAt}, ${memoryRecords.recordedAt}) desc`,
      desc(memoryRecords.recordedAt)
    );
  if (rows.length === 0) {
    return [];
  }
  const links = await db
    .select()
    .from(memoryRecordEntities)
    .where(
      inArray(
        memoryRecordEntities.recordId,
        rows.map((r) => r.id)
      )
    );
  const byRecord = new Map<string, MemoryRecord["entities"]>();
  for (const { entityId, recordId, role } of links) {
    byRecord.set(recordId, [
      ...(byRecord.get(recordId) ?? []),
      { entityId, role },
    ]);
  }
  return rows.map((row) => toRecord(row, byRecord.get(row.id) ?? [], key));
};

// --- writes ------------------------------------------------------------------------------------------------------

/**
 * The source of a chat's message: its key is the message's id. The store names it only where it answers a chat —
 * what to show under which message.
 */
export const CHAT_SOURCE = "chat";
/** A note typed on a card (P22 «Записать…»): the write keeps its text itself. */
export const NOTE_SOURCE = "note";

/**
 * One row per material looked at — a chat's message today (ARCH §19.9.5). The same material again is the same write —
 * `created` says which — so one queued twice is not read twice.
 */
export const createWrite = async (
  ownerId: string,
  input: {
    /** Where the material came from («chat») and which one it is there (a message's id). */
    source: string;
    sourceKey: string;
    /** The chat it was said in, when there is one: «Запомнено» is shown there. */
    chatId?: string;
    /** When it was said: the queue's order (ARCH §19.8.1); now, if not given. */
    sentAt?: Date;
    timeZone?: string;
    /** The material itself, for a source with no store of its own (a note typed on a card); sealed. */
    material?: WriteMaterial;
  }
) => {
  const { db } = getDb();
  const { material, ...row } = input;
  const id = crypto.randomUUID();
  const key = material ? await dataKey(ownerId, true) : null;
  const [made] = await db
    .insert(memoryWrites)
    .values({
      ...row,
      id,
      ownerId,
      sealed:
        material && key
          ? sealField(
              JSON.stringify(material),
              memoryAad(ownerId, WRITES, id, BODY),
              key
            )
          : null,
    })
    .onConflictDoNothing()
    .returning();
  if (made) {
    return { created: true, id: made.id, status: made.status };
  }
  const [existing] = await db
    .select()
    .from(memoryWrites)
    .where(
      and(
        eq(memoryWrites.ownerId, ownerId),
        eq(memoryWrites.source, input.source),
        eq(memoryWrites.sourceKey, input.sourceKey)
      )
    )
    .limit(1);
  if (!existing) {
    throw new Error("memory: the write was not saved");
  }
  return { created: false, id: existing.id, status: existing.status };
};

const writeMaterial = z.object({
  /** The card it was typed on. */
  about: z.uuid().optional(),
  /** Typed as a standing rule («Правила», P22): read as one — how or how often to remind, what to watch. */
  intent: z.enum(["rule"]).optional(),
  text: z.string(),
});
export type WriteMaterial = z.infer<typeof writeMaterial>;

/** The material a write keeps itself (`createWrite`'s `material`); null — none, or not the owner's. */
export const materialOf = async (
  ownerId: string,
  writeId: string
): Promise<WriteMaterial | null> => {
  const [row] = await getDb()
    .db.select({ sealed: memoryWrites.sealed })
    .from(memoryWrites)
    .where(and(eq(memoryWrites.id, writeId), eq(memoryWrites.ownerId, ownerId)))
    .limit(1);
  const key = row?.sealed ? await dataKey(ownerId, false) : null;
  if (!(row?.sealed && key)) {
    return null;
  }
  return writeMaterial.parse(
    JSON.parse(
      openField(row.sealed, memoryAad(ownerId, WRITES, writeId, BODY), key)
    )
  );
};

/** Where a write is: `queued` until the queue reads it; null — no such write of the owner's. */
export const writeStatus = async (ownerId: string, id: string) => {
  const [row] = await getDb()
    .db.select({ status: memoryWrites.status })
    .from(memoryWrites)
    .where(and(eq(memoryWrites.id, id), eq(memoryWrites.ownerId, ownerId)))
    .limit(1);
  return row?.status ?? null;
};

/** Material waiting to be read: the next of a person's queue. */
export interface QueuedWrite {
  id: string;
  /** Which adapter loads it (`memory-sources.ts`), and which material it is there. */
  source: string;
  sourceKey: string;
  chatId: string | null;
  sentAt: Date;
  timeZone: string | null;
  attempts: number;
}

/**
 * The person's next message to read: the earliest sent still `queued` — one that failed and is tried again stays
 * first, so a later message never overtakes it (ARCH §19.8.1).
 */
export const nextQueuedWrite = async (
  ownerId: string
): Promise<QueuedWrite | null> => {
  const [row] = await getDb()
    .db.select({
      attempts: memoryWrites.attempts,
      chatId: memoryWrites.chatId,
      id: memoryWrites.id,
      sentAt: memoryWrites.sentAt,
      source: memoryWrites.source,
      sourceKey: memoryWrites.sourceKey,
      timeZone: memoryWrites.timeZone,
    })
    .from(memoryWrites)
    .where(
      and(eq(memoryWrites.ownerId, ownerId), eq(memoryWrites.status, "queued"))
    )
    .orderBy(asc(memoryWrites.sentAt), asc(memoryWrites.createdAt))
    .limit(1);
  return row ?? null;
};

/**
 * One more failed read of a queued message. It stays `queued` — first in line for the next try — until `max`
 * attempts; then it is `failed`, and the queue goes on without it.
 */
export const failWriteAttempt = async (
  ownerId: string,
  id: string,
  error: string,
  max: number
) => {
  const [row] = await getDb()
    .db.update(memoryWrites)
    .set({
      attempts: sql`${memoryWrites.attempts} + 1`,
      error: error.slice(0, 500),
      finishedAt: sql`case when ${memoryWrites.attempts} + 1 >= ${max} then now() else null end`,
      status: sql`case when ${memoryWrites.attempts} + 1 >= ${max} then 'failed' else ${memoryWrites.status} end`,
    })
    .where(
      and(
        eq(memoryWrites.id, id),
        eq(memoryWrites.ownerId, ownerId),
        eq(memoryWrites.status, "queued")
      )
    )
    .returning({ status: memoryWrites.status });
  return { failed: row?.status === "failed" };
};

export const markWrite = async (
  ownerId: string,
  id: string,
  status: Exclude<MemoryWriteStatus, "queued">,
  error?: string
) => {
  await getDb()
    .db.update(memoryWrites)
    .set({ error: error ?? null, finishedAt: new Date(), status })
    .where(and(eq(memoryWrites.id, id), eq(memoryWrites.ownerId, ownerId)));
};

type PlannedLink =
  | { entityId: string; role: MemoryRole }
  | { newRef: string; role: MemoryRole }
  /** The card the person picks in answer to the write's question (P18). */
  | { ask: string; role: MemoryRole };

type PlannedRecord = Omit<MemoryRecordInput, "entities" | "writeId"> & {
  entities: PlannedLink[];
  /**
   * The fact or event this one replaces (ARCH §19.9.3), already checked by `planWrite`: a fact is ended (`valid_to`),
   * an event is put aside as replaced (`superseded_by`); undoing the write brings it back.
   */
  replaces?: string;
};

/** What one message adds: new cards under refs, records pointing at known cards or those refs, and questions. */
export interface MemoryWritePlan {
  entities: (Omit<EntityInput, "aliases" | "writeId"> & { ref: string })[];
  records: PlannedRecord[];
  /** «Какой Андрей?»: records that wait for the person to say which card — kept until they answer. */
  drafts: {
    /** How the message called them: «Андрей» — the name of a new card, if that is the answer. */
    name: string;
    question: string;
    /** The known cards it could be. */
    candidates: string[];
    records: PlannedRecord[];
  }[];
  /** Open commitments the message settles. */
  statuses: { recordId: string; status: Exclude<MemoryStatus, "open"> }[];
  /** Open commitments whose deadline the message moves: the change goes into their history, undoing the write reverts it. */
  dues: { recordId: string; dueAt: Date }[];
  /** Facts the message ends («Марина ушла из команды»): they move to «Раньше», and «Отменить» brings them back. */
  ends: string[];
}

/**
 * A new fact or event takes the place of an old one the plan named (ARCH §19.9.3). A fact is ended — `valid_to` at the
 * day the new one begins (now, when it has no day), `closed_by_write` the message — and an event is set aside as
 * replaced, `superseded_by` the new one: undoing the write brings either back. Only a live record of the owner's of
 * the same kind; a new fact that began before the old one is history beside it, not its end.
 */
const replaceRecord = async (
  tx: Tx,
  ownerId: string,
  writeId: string,
  oldId: string,
  next: MemoryRecord
) => {
  const [old] = await tx
    .select()
    .from(memoryRecords)
    .where(
      and(
        eq(memoryRecords.id, oldId),
        eq(memoryRecords.ownerId, ownerId),
        eq(memoryRecords.kind, next.kind),
        isNull(memoryRecords.deletedAt),
        isNull(memoryRecords.supersededAt)
      )
    )
    .for("update");
  if (!old || old.id === next.id) {
    return;
  }
  if (next.kind === "fact") {
    const to = next.validFrom ?? new Date();
    if (old.validTo || (old.validFrom && old.validFrom > to)) {
      return;
    }
    await tx
      .update(memoryRecords)
      .set({ closedByWrite: writeId, validTo: to })
      .where(eq(memoryRecords.id, old.id));
  } else if (next.kind === "event") {
    await tx
      .update(memoryRecords)
      .set({ supersededAt: new Date(), supersededBy: next.id })
      .where(eq(memoryRecords.id, old.id));
  }
};

/**
 * Puts in all a message adds, in one step: a write that fails halfway and is tried again leaves no doubles. The write
 * ends `done`, or `skipped` when there was nothing to keep. False when the write is not the owner's or is already
 * finished (a second delivery of the same job).
 */
export const applyWrite = async (
  ownerId: string,
  writeId: string,
  plan: MemoryWritePlan
) => {
  const adds = plan.records.length > 0 || plan.drafts.length > 0;
  const keeps =
    adds ||
    plan.statuses.length > 0 ||
    plan.dues.length > 0 ||
    plan.ends.length > 0;
  const key = adds ? await dataKey(ownerId, true) : null;
  return getDb().db.transaction(async (tx) => {
    const [write] = await tx
      .select({ status: memoryWrites.status })
      .from(memoryWrites)
      .where(
        and(eq(memoryWrites.id, writeId), eq(memoryWrites.ownerId, ownerId))
      )
      .for("update");
    if (!write || !["queued", "failed"].includes(write.status)) {
      return false;
    }
    if (key) {
      // One transaction is one connection: these go one after another in it, whatever the code looks like.
      const made = new Map(
        await Promise.all(
          plan.entities.map(async (e) => {
            const entity = await insertEntity(tx, ownerId, key, {
              ...e,
              writeId,
            });
            return [e.ref, entity.id] as const;
          })
        )
      );
      // New cards are made now, for waiting records too: the draft keeps their ids, the answer only picks the card.
      const settle = (links: PlannedLink[]) =>
        links.flatMap((l): PlannedLink[] => {
          if (!("newRef" in l)) {
            return [l];
          }
          const entityId = made.get(l.newRef);
          return entityId ? [{ entityId, role: l.role }] : [];
        });
      const inserted = await Promise.all(
        plan.records.map(({ replaces: _replaces, ...r }) =>
          insertRecord(tx, ownerId, key, {
            ...r,
            entities: settle(r.entities).flatMap((l) =>
              "entityId" in l ? [{ entityId: l.entityId, role: l.role }] : []
            ),
            writeId,
          })
        )
      );
      // What the new records replace (ARCH §19.9.3): one after another, each checked against the row as it is now.
      for (const [i, r] of plan.records.entries()) {
        const next = inserted[i];
        if (r.replaces && next) {
          // oxlint-disable-next-line no-await-in-loop -- one connection, and each replacement reads its row first
          await replaceRecord(tx, ownerId, writeId, r.replaces, next);
        }
      }
      await Promise.all(
        plan.drafts.map((d) => {
          const id = crypto.randomUUID();
          const body: DraftBody = {
            candidates: d.candidates,
            name: d.name,
            question: d.question,
            records: d.records.map((r) => ({
              ...r,
              entities: settle(r.entities),
            })),
          };
          return tx.insert(memoryDrafts).values({
            id,
            ownerId,
            sealed: sealField(
              JSON.stringify(body),
              memoryAad(ownerId, DRAFTS, id, BODY),
              key
            ),
            writeId,
          });
        })
      );
    }
    // Only an open one of the owner's: a commitment closed since the model read it stays as it is.
    await Promise.all(
      plan.statuses.map((s) =>
        changeCommitment(
          tx,
          ownerId,
          s.recordId,
          { status: s.status },
          { onlyOpen: true, writeId }
        )
      )
    );
    // The new deadlines, each into the commitment's history; undoing the write puts the old one back.
    await Promise.all(
      plan.dues.map((d) =>
        changeCommitment(
          tx,
          ownerId,
          d.recordId,
          { dueAt: d.dueAt },
          { onlyOpen: true, writeId }
        )
      )
    );
    // Only a live fact of the owner's; the write that ended it reopens it when undone.
    if (plan.ends.length > 0) {
      await tx
        .update(memoryRecords)
        .set({ closedByWrite: writeId, validTo: new Date() })
        .where(
          and(
            eq(memoryRecords.ownerId, ownerId),
            inArray(memoryRecords.id, plan.ends),
            eq(memoryRecords.kind, "fact"),
            isNull(memoryRecords.validTo),
            isNull(memoryRecords.deletedAt)
          )
        );
    }
    await tx
      .update(memoryWrites)
      .set({
        error: null,
        finishedAt: new Date(),
        status: keeps ? "done" : "skipped",
      })
      .where(eq(memoryWrites.id, writeId));
    return true;
  });
};

// --- questions (P18) -----------------------------------------------------------------------------------------------

interface DraftBody {
  question: string;
  name: string;
  candidates: string[];
  records: PlannedRecord[];
}

const DATES = ["validFrom", "validTo", "givenAt", "dueAt"] as const;

/** The body as it was sealed: dates went in as strings and come back as dates. */
const openDraft = (
  row: typeof memoryDrafts.$inferSelect,
  key: SecretsKey
): DraftBody => {
  const body = JSON.parse(
    openField(row.sealed, memoryAad(row.ownerId, DRAFTS, row.id, BODY), key)
  ) as DraftBody;
  return {
    ...body,
    records: body.records.map((r) => {
      const revived: PlannedRecord = { ...r };
      for (const field of DATES) {
        const value = r[field] as unknown;
        if (typeof value === "string") {
          revived[field] = new Date(value);
        }
      }
      if (r.occurred) {
        revived.occurred = { ...r.occurred, at: new Date(r.occurred.at) };
      }
      return revived;
    }),
  };
};

export interface MemoryQuestion {
  id: string;
  writeId: string;
  chatId: string | null;
  /** The chat's message it came from; null for material of another source. */
  messageId: string | null;
  question: string;
  /** The cards it could be, with who each one is — what the person picks from. */
  candidates: {
    id: string;
    name: string;
    role: string | null;
    kind: MemoryEntityKind;
  }[];
  createdAt: Date;
}

/**
 * A question nobody answered in this many days is given up (ARCH §19.8.6): it is no longer asked, and what waited
 * for it is not written — a person who has not settled «какой Андрей» in two weeks is not going to.
 */
export const QUESTION_DAYS = 14;

const DAY_MS = 86_400_000;

/** Gives up the owner's questions older than `QUESTION_DAYS`. */
const expireQuestions = async (ownerId: string, now: Date) => {
  await getDb()
    .db.update(memoryDrafts)
    .set({ answeredAt: now, status: "expired" })
    .where(
      and(
        eq(memoryDrafts.ownerId, ownerId),
        eq(memoryDrafts.status, "open"),
        lt(
          memoryDrafts.createdAt,
          new Date(now.getTime() - QUESTION_DAYS * DAY_MS)
        )
      )
    );
};

/**
 * Open questions: of one chat (under its answers), or all of them («Не записано» on the «Память» page). The ones past
 * their time are given up first.
 */
export const listQuestions = async (
  ownerId: string,
  filter: { chatId?: string } = {},
  now = new Date()
): Promise<MemoryQuestion[]> => {
  const key = await dataKey(ownerId, false);
  if (!key) {
    return [];
  }
  await expireQuestions(ownerId, now);
  const { db } = getDb();
  const rows = await db
    .select({
      chatId: memoryWrites.chatId,
      draft: memoryDrafts,
      source: memoryWrites.source,
      sourceKey: memoryWrites.sourceKey,
    })
    .from(memoryDrafts)
    .innerJoin(memoryWrites, eq(memoryWrites.id, memoryDrafts.writeId))
    .where(
      and(
        eq(memoryDrafts.ownerId, ownerId),
        eq(memoryDrafts.status, "open"),
        filter.chatId ? eq(memoryWrites.chatId, filter.chatId) : undefined
      )
    )
    .orderBy(memoryDrafts.createdAt);
  if (rows.length === 0) {
    return [];
  }
  const entities = await listEntities(ownerId);
  const cards = new Map(entities.map((e) => [e.id, e]));
  const to = await mergedTo(db, ownerId);
  return rows.map(({ chatId, draft, source, sourceKey }) => {
    const body = openDraft(draft, key);
    return {
      // A candidate merged since the question was asked is the card it went into, once.
      candidates: [...new Set(body.candidates.map(to))].flatMap((id) => {
        const card = cards.get(id);
        return card
          ? [{ id, kind: card.kind, name: card.name, role: card.role }]
          : [];
      }),
      chatId,
      createdAt: draft.createdAt,
      id: draft.id,
      messageId: source === CHAT_SOURCE ? sourceKey : null,
      question: body.question,
      writeId: draft.writeId,
    };
  });
};

export type MemoryAnswer =
  | { entityId: string }
  /** None of them: a new card under the name the message used. */
  | { newCard: true }
  | { dismiss: true };

/**
 * The person's answer: the waiting records go in under the picked card and the write, so «Отменить» undoes them with
 * the rest of it. Null when there is no such open question of the owner (answered in another tab, say).
 */
export const answerQuestion = async (
  ownerId: string,
  draftId: string,
  answer: MemoryAnswer
) => {
  const key = await dataKey(ownerId, false);
  if (!key) {
    return null;
  }
  return getDb().db.transaction(async (tx) => {
    const [draft] = await tx
      .select()
      .from(memoryDrafts)
      .where(
        and(
          eq(memoryDrafts.id, draftId),
          eq(memoryDrafts.ownerId, ownerId),
          eq(memoryDrafts.status, "open")
        )
      )
      .for("update");
    if (!draft) {
      return null;
    }
    const done = (status: "answered" | "dismissed") =>
      tx
        .update(memoryDrafts)
        .set({ answeredAt: new Date(), status })
        .where(eq(memoryDrafts.id, draftId));
    if ("dismiss" in answer) {
      await done("dismissed");
      return [];
    }
    const body = openDraft(draft, key);
    let entityId: string;
    if ("entityId" in answer) {
      const to = await mergedTo(tx, ownerId);
      if (!body.candidates.map(to).includes(to(answer.entityId))) {
        throw new Error(
          "memory: the answer is not one of the question's cards"
        );
      }
      ({ entityId } = answer);
    } else {
      // A new card of the kind its namesakes are: two Андрея are people, two «Склада» projects.
      const [like] = await tx
        .select({ kind: memoryEntities.kind })
        .from(memoryEntities)
        .where(
          and(
            eq(memoryEntities.ownerId, ownerId),
            inArray(memoryEntities.id, body.candidates)
          )
        )
        .limit(1);
      const card = await insertEntity(tx, ownerId, key, {
        kind:
          like?.kind === "org" || like?.kind === "project"
            ? like.kind
            : "person",
        name: body.name,
        writeId: draft.writeId,
      });
      entityId = card.id;
    }
    const records = await Promise.all(
      body.records.map((r) =>
        insertRecord(tx, ownerId, key, {
          ...r,
          entities: r.entities.flatMap((l) => {
            if ("ask" in l) {
              return [{ entityId, role: l.role }];
            }
            return "entityId" in l
              ? [{ entityId: l.entityId, role: l.role }]
              : [];
          }),
          writeId: draft.writeId,
        })
      )
    );
    await done("answered");
    return records;
  });
};

/**
 * «Запомнено» undone: what the write put in is hidden, what it replaced or closed is as it was, and the cards it
 * found go if nothing else holds them. False when there is no such write of the owner, or it is already undone.
 */
/**
 * What a write changed in commitments goes back, newest first — each only while it still holds what the write set
 * («выполнено» the person has since changed by hand stays). The write's lines leave the history.
 */
const revertChanges = async (tx: Tx, ownerId: string, writeId: string) => {
  const changes = await tx
    .select()
    .from(memoryChanges)
    .where(
      and(
        eq(memoryChanges.ownerId, ownerId),
        eq(memoryChanges.writeId, writeId)
      )
    )
    .orderBy(desc(memoryChanges.at));
  for (const c of changes) {
    const where = and(
      eq(memoryRecords.id, c.recordId),
      eq(memoryRecords.ownerId, ownerId)
    );
    if (c.field === "status" && c.before) {
      const before = c.before as MemoryStatus;
      // oxlint-disable-next-line no-await-in-loop -- newest first: a later change goes back before an earlier one
      await tx
        .update(memoryRecords)
        .set({
          closedByWrite: null,
          doneAt: ENDED.has(before) ? sql`${memoryRecords.doneAt}` : null,
          status: before,
        })
        .where(and(where, eq(memoryRecords.status, c.after as MemoryStatus)));
    } else if (c.field === "due") {
      // oxlint-disable-next-line no-await-in-loop -- as above
      await tx
        .update(memoryRecords)
        .set({ dueAt: c.before ? new Date(c.before) : null })
        .where(
          and(
            where,
            c.after
              ? eq(memoryRecords.dueAt, new Date(c.after))
              : isNull(memoryRecords.dueAt)
          )
        );
    } else if (c.field === "important") {
      // oxlint-disable-next-line no-await-in-loop -- as above
      await tx
        .update(memoryRecords)
        .set({ important: c.before === "true" })
        .where(and(where, eq(memoryRecords.important, c.after === "true")));
    }
  }
  await tx.delete(memoryChanges).where(eq(memoryChanges.writeId, writeId));
};

export const undoWrite = (ownerId: string, writeId: string) =>
  getDb().db.transaction(async (tx) => {
    const [write] = await tx
      .select({ status: memoryWrites.status })
      .from(memoryWrites)
      .where(
        and(eq(memoryWrites.id, writeId), eq(memoryWrites.ownerId, ownerId))
      )
      .for("update");
    if (!write || write.status === "undone") {
      return false;
    }
    const own = eq(memoryRecords.ownerId, ownerId);
    const made = tx
      .select({ id: memoryRecords.id })
      .from(memoryRecords)
      .where(and(own, eq(memoryRecords.writeId, writeId)));
    // Replaced by what the write put in: back as it was.
    await tx
      .update(memoryRecords)
      .set({ supersededAt: null, supersededBy: null })
      .where(and(own, inArray(memoryRecords.supersededBy, made)));
    // Closed by the write: open again.
    await tx
      .update(memoryRecords)
      .set({ closedByWrite: null, validTo: null })
      .where(
        and(
          own,
          eq(memoryRecords.closedByWrite, writeId),
          inArray(memoryRecords.kind, ["fact", "assessment"])
        )
      );
    await revertChanges(tx, ownerId, writeId);
    // Closed by the write before commitments had a history: open again.
    await tx
      .update(memoryRecords)
      .set({ closedByWrite: null, doneAt: null, status: "open" })
      .where(
        and(
          own,
          eq(memoryRecords.closedByWrite, writeId),
          eq(memoryRecords.kind, "commitment")
        )
      );
    await tx
      .update(memoryRecords)
      .set({ deletedAt: new Date() })
      .where(
        and(
          own,
          eq(memoryRecords.writeId, writeId),
          isNull(memoryRecords.deletedAt)
        )
      );
    // A card merged into another stays: «Вернуть» of the merge brings it back.
    await tx.delete(memoryEntities).where(
      and(
        eq(memoryEntities.ownerId, ownerId),
        eq(memoryEntities.writeId, writeId),
        isNull(memoryEntities.mergedInto),
        notExists(
          tx
            .select({ one: sql`1` })
            .from(memoryRecordEntities)
            .innerJoin(
              memoryRecords,
              eq(memoryRecords.id, memoryRecordEntities.recordId)
            )
            .where(
              and(
                eq(memoryRecordEntities.entityId, memoryEntities.id),
                isNull(memoryRecords.deletedAt)
              )
            )
        )
      )
    );
    // Its questions go too: nothing to ask about what is no longer kept.
    await tx
      .update(memoryDrafts)
      .set({ answeredAt: new Date(), status: "dismissed" })
      .where(
        and(eq(memoryDrafts.writeId, writeId), eq(memoryDrafts.status, "open"))
      );
    await tx
      .update(memoryWrites)
      .set({ finishedAt: new Date(), status: "undone" })
      .where(eq(memoryWrites.id, writeId));
    return true;
  });

/**
 * What each new record of a message took the place of, by the new record's id, as the old text (ARCH §19.9.3). An
 * event: the one set aside as replaced by it. A fact: the one the same message ended that shares a card with it. A
 * hand correction is not one — the old version of it has the same message as the new.
 */
const replacedTexts = async (
  ownerId: string,
  writeIds: string[],
  records: MemoryRecord[]
) => {
  const out = new Map<string, string>();
  const key = await dataKey(ownerId, false);
  if (!key || records.length === 0) {
    return out;
  }
  const { db } = getDb();
  const events = await db
    .select()
    .from(memoryRecords)
    .where(
      and(
        eq(memoryRecords.ownerId, ownerId),
        inArray(
          memoryRecords.supersededBy,
          records.map((r) => r.id)
        ),
        isNull(memoryRecords.deletedAt)
      )
    );
  const writeOf = new Map(records.map((r) => [r.id, r.writeId]));
  for (const row of events) {
    if (row.supersededBy && row.writeId !== writeOf.get(row.supersededBy)) {
      out.set(row.supersededBy, toRecord(row, [], key).text);
    }
  }
  const ended = await listRecords(ownerId, {
    closedBy: writeIds,
    kinds: ["fact"],
  });
  const taken = new Set<string>();
  for (const r of records) {
    const old = ended.find(
      (e) =>
        r.kind === "fact" &&
        e.closedByWrite === r.writeId &&
        !taken.has(e.id) &&
        e.entities.some((l) =>
          r.entities.some((n) => n.entityId === l.entityId)
        )
    );
    if (old) {
      taken.add(old.id);
      out.set(r.id, old.text);
    }
  }
  return out;
};

/** The deadlines messages moved, by message: which commitment, from when to when. */
const dueMoves = async (ownerId: string, writeIds: string[]) => {
  const rows = await getDb()
    .db.select()
    .from(memoryChanges)
    .where(
      and(
        eq(memoryChanges.ownerId, ownerId),
        eq(memoryChanges.field, "due"),
        inArray(memoryChanges.writeId, writeIds)
      )
    )
    .orderBy(memoryChanges.at);
  const commitments = await listRecords(ownerId, {
    ids: rows.map((r) => r.recordId),
  });
  const texts = new Map(commitments.map((r) => [r.id, r.text]));
  return rows.flatMap((c) => {
    const text = texts.get(c.recordId);
    return text && c.writeId
      ? [
          {
            due: { from: c.before, to: c.after },
            id: c.recordId,
            text,
            writeId: c.writeId,
          },
        ]
      : [];
  });
};

/** What the memory took from one chat: «Запомнено» per message, and the open questions (P18). */
export const chatMemory = async (ownerId: string, chatId: string) => {
  // The chat's own messages: what another source put in is not shown under an answer.
  const writes = await getDb()
    .db.select({ id: memoryWrites.id, messageId: memoryWrites.sourceKey })
    .from(memoryWrites)
    .where(
      and(
        eq(memoryWrites.ownerId, ownerId),
        eq(memoryWrites.chatId, chatId),
        eq(memoryWrites.source, CHAT_SOURCE),
        eq(memoryWrites.status, "done")
      )
    );
  const ids = writes.map((w) => w.id);
  const [records, closed, moved] =
    ids.length > 0
      ? await Promise.all([
          listRecords(ownerId, { writeIds: ids }),
          listRecords(ownerId, { closedBy: ids, kinds: ["commitment"] }),
          dueMoves(ownerId, ids),
        ])
      : [[], [], []];
  const replaced = await replacedTexts(ownerId, ids, records);
  // Oldest first under one answer: in the order the message said them; what it settled after what it added.
  const byWrite = new Map<string, ChatMemory["notes"][number]["records"]>();
  const add = (
    writeId: string,
    line: ChatMemory["notes"][number]["records"][number]
  ) => byWrite.set(writeId, [...(byWrite.get(writeId) ?? []), line]);
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const r = records[i];
    if (r?.writeId) {
      const was = replaced.get(r.id);
      add(r.writeId, {
        id: r.id,
        text: r.text,
        ...(was ? { replaced: was } : {}),
      });
    }
  }
  for (const r of closed) {
    if (r.closedByWrite && r.status && r.status !== "open") {
      add(r.closedByWrite, { id: r.id, status: r.status, text: r.text });
    }
  }
  for (const m of moved) {
    add(m.writeId, { due: m.due, id: m.id, text: m.text });
  }
  return {
    notes: writes.flatMap((w) => {
      const kept = byWrite.get(w.id);
      return kept
        ? [{ messageId: w.messageId, records: kept, writeId: w.id }]
        : [];
    }),
    questions: await listQuestions(ownerId, { chatId }),
  };
};

/**
 * Material that is gone from its source — messages deleted from a chat (a retry, an edit, a regenerated answer): what
 * it put in is undone, and its writes go, so the same material queued again is read afresh.
 */
export const forgetSources = async (
  ownerId: string,
  source: string,
  keys: string[]
) => {
  if (keys.length === 0) {
    return;
  }
  const { db } = getDb();
  const writes = await db
    .select({ id: memoryWrites.id })
    .from(memoryWrites)
    .where(
      and(
        eq(memoryWrites.ownerId, ownerId),
        eq(memoryWrites.source, source),
        inArray(memoryWrites.sourceKey, keys)
      )
    );
  await Promise.all(writes.map(({ id }) => undoWrite(ownerId, id)));
  if (writes.length > 0) {
    await db.delete(memoryWrites).where(
      and(
        eq(memoryWrites.ownerId, ownerId),
        inArray(
          memoryWrites.id,
          writes.map((w) => w.id)
        )
      )
    );
  }
};

/** «Забыть всё»: records, cards, writes and the data key. Without the key whatever a backup still holds is noise. */
export const forgetAll = async (ownerId: string) => {
  await getDb().db.transaction(async (tx) => {
    await tx.delete(memoryRecords).where(eq(memoryRecords.ownerId, ownerId));
    await tx.delete(memoryEntities).where(eq(memoryEntities.ownerId, ownerId));
    await tx.delete(memoryWrites).where(eq(memoryWrites.ownerId, ownerId));
    await tx.delete(memoryKeys).where(eq(memoryKeys.ownerId, ownerId));
  });
  cache().delete(ownerId);
};

// --- the «Память» page (P16) --------------------------------------------------------------------------------------

/**
 * A correction by hand («Изменить» on the page): a new version with the new text and all else as it was; the old one
 * stays in the history. It keeps the message it came from — «Откуда» still shows it, and undoing that message takes
 * the corrected version too. Null when the owner has no such live record.
 */
export const correctRecord = async (
  ownerId: string,
  id: string,
  text: string
) => {
  const [old] = await listRecords(ownerId, { ids: [id] });
  if (!old) {
    return null;
  }
  return supersedeRecord(ownerId, id, {
    dueAt: old.dueAt ?? undefined,
    entities: old.entities,
    givenAt: old.givenAt ?? undefined,
    important: old.important || undefined,
    kind: old.kind,
    occurred:
      old.occurredAt && old.occurredPrecision
        ? { at: old.occurredAt, precision: old.occurredPrecision }
        : undefined,
    role: old.role ?? undefined,
    status: old.status ?? undefined,
    text,
    validFrom: old.validFrom ?? undefined,
    validTo: old.validTo ?? undefined,
    writeId: old.writeId ?? undefined,
  });
};

/** Where each write came from: its source and material there, and its chat — a write of a deleted chat has none. */
export const writeChats = async (ownerId: string, writeIds: string[]) => {
  if (writeIds.length === 0) {
    return new Map<
      string,
      { chatId: string | null; source: string; sourceKey: string }
    >();
  }
  const rows = await getDb()
    .db.select({
      chatId: memoryWrites.chatId,
      id: memoryWrites.id,
      source: memoryWrites.source,
      sourceKey: memoryWrites.sourceKey,
    })
    .from(memoryWrites)
    .where(
      and(
        eq(memoryWrites.ownerId, ownerId),
        inArray(memoryWrites.id, [...new Set(writeIds)])
      )
    );
  return new Map(rows.map((r) => [r.id, r]));
};

/**
 * A record's past: its earlier texts (newest first) and what changed in it — status, deadline, «важно» — across all
 * its versions, oldest first. Null when the owner has no such record.
 */
export const recordHistory = async (ownerId: string, id: string) => {
  const key = await dataKey(ownerId, false);
  if (!key) {
    return null;
  }
  const { db } = getDb();
  const versions: { id: string; text: string; recordedAt: Date }[] = [];
  const [self] = await db
    .select({ id: memoryRecords.id })
    .from(memoryRecords)
    .where(and(eq(memoryRecords.id, id), eq(memoryRecords.ownerId, ownerId)));
  if (!self) {
    return null;
  }
  // A chain is a handful of corrections: one step at a time.
  for (let next = id, step = 0; step < 50; step += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each step needs the one before
    const [older] = await db
      .select()
      .from(memoryRecords)
      .where(
        and(
          eq(memoryRecords.ownerId, ownerId),
          eq(memoryRecords.supersededBy, next)
        )
      )
      .limit(1);
    if (!older) {
      break;
    }
    versions.push({
      id: older.id,
      recordedAt: older.recordedAt,
      text: toRecord(older, [], key).text,
    });
    next = older.id;
  }
  const changes = await db
    .select({
      after: memoryChanges.after,
      at: memoryChanges.at,
      before: memoryChanges.before,
      field: memoryChanges.field,
      writeId: memoryChanges.writeId,
    })
    .from(memoryChanges)
    .where(
      and(
        eq(memoryChanges.ownerId, ownerId),
        inArray(memoryChanges.recordId, [id, ...versions.map((v) => v.id)])
      )
    )
    .orderBy(memoryChanges.at);
  return { changes, versions };
};

/**
 * Open commitments per card, and how many of them are past their day — for the list on the «Память» page. A deadline
 * is midnight of its day in the person's zone, so it is overdue a day after.
 */
export const commitmentCounts = async (ownerId: string, now = new Date()) => {
  const overdueBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const rows = await getDb()
    .db.select({
      entityId: memoryRecordEntities.entityId,
      open: sql<number>`count(*)::int`,
      overdue: sql<number>`count(*) filter (where ${lte(memoryRecords.dueAt, overdueBefore)})::int`,
    })
    .from(memoryRecordEntities)
    .innerJoin(
      memoryRecords,
      eq(memoryRecords.id, memoryRecordEntities.recordId)
    )
    .where(
      and(
        eq(memoryRecords.ownerId, ownerId),
        eq(memoryRecords.kind, "commitment"),
        inArray(memoryRecords.status, ["open", "unconfirmed"]),
        isNull(memoryRecords.supersededAt),
        isNull(memoryRecords.deletedAt)
      )
    )
    .groupBy(memoryRecordEntities.entityId);
  return new Map(rows.map((r) => [r.entityId, r]));
};

// --- «На сегодня» (P17) -------------------------------------------------------------------------------------------

/**
 * «Уже было» on a rhythm row (ARCH §19.6): a contact with the card on that day — an event like any other, so the rhythm
 * counts from it, the card shows it, and deleting it takes it back. Null when the card is not the owner's.
 */
export const recordContact = async (
  ownerId: string,
  entityId: string,
  day: Date,
  text: string
) => {
  try {
    return await addRecord(ownerId, {
      entities: [{ entityId, role: "participant" }],
      kind: "event",
      occurred: { at: day, precision: "day" },
      text,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("not the owner's")) {
      return null;
    }
    throw error;
  }
};

/** The row's key in `memory_dismissals`: a commitment's id, or a rule's and its card's for a rhythm row. */
export const dismissalKey = (recordId: string, entityId?: string) =>
  entityId ? `${recordId}:${entityId}` : recordId;

/** A `date` row's key (ARCH §19.8.7): the rule and the day it comes — taken away for that day only. */
export const dateKey = (recordId: string, day: string) =>
  `date:${recordId}:${day}`;

/**
 * «Убрать» in «Не упустить» (P17). A commitment stays away while its deadline and status are as they are; a rhythm row
 * (`rhythm`) — while the last contact with its card is the one it had then (`since`): a new contact brings it back.
 */
export const dismissSuggestion = async (
  ownerId: string,
  recordId: string,
  rhythm?: { entityId: string; since: Date | null },
  /** A `date` row: the day it was for. */
  date?: string
) => {
  const { db } = getDb();
  const [row] = await db
    .select({ dueAt: memoryRecords.dueAt, status: memoryRecords.status })
    .from(memoryRecords)
    .where(
      and(
        eq(memoryRecords.id, recordId),
        eq(memoryRecords.ownerId, ownerId),
        eq(memoryRecords.kind, rhythm || date ? "rule" : "commitment"),
        isNull(memoryRecords.deletedAt)
      )
    )
    .limit(1);
  if (!row) {
    return false;
  }
  let snapshot = {
    dueAt: row.dueAt,
    entityId: null as string | null,
    status: row.status,
  };
  if (rhythm) {
    snapshot = { dueAt: rhythm.since, entityId: rhythm.entityId, status: null };
  } else if (date) {
    snapshot = { dueAt: null, entityId: null, status: null };
  }
  await db
    .insert(memoryDismissals)
    .values({
      ...snapshot,
      key: date
        ? dateKey(recordId, date)
        : dismissalKey(recordId, rhythm?.entityId),
      ownerId,
      recordId,
    })
    .onConflictDoUpdate({
      set: { ...snapshot, at: new Date() },
      target: memoryDismissals.key,
    });
  return true;
};

/** «Вернуть» after «Убрать». */
export const undismissSuggestion = async (
  ownerId: string,
  recordId: string,
  entityId?: string,
  date?: string
) => {
  const rows = await getDb()
    .db.delete(memoryDismissals)
    .where(
      and(
        eq(memoryDismissals.ownerId, ownerId),
        eq(
          memoryDismissals.key,
          date ? dateKey(recordId, date) : dismissalKey(recordId, entityId)
        )
      )
    )
    .returning({ key: memoryDismissals.key });
  return rows.length > 0;
};

/** What the person took away from «Не упустить», by row key, with the deadline (or last contact) and status then. */
export const listDismissals = async (ownerId: string) => {
  const rows = await getDb()
    .db.select()
    .from(memoryDismissals)
    .where(eq(memoryDismissals.ownerId, ownerId));
  return new Map(rows.map((r) => [r.key, r]));
};

/** When each record was last changed — a status, a deadline, «важно» (`memory_changes`); records never changed are absent. */
export const lastChanges = async (ownerId: string) => {
  const rows = await getDb()
    .db.select({
      at: sql<Date>`max(${memoryChanges.at})`.mapWith(
        (v: string | Date) => new Date(v)
      ),
      recordId: memoryChanges.recordId,
    })
    .from(memoryChanges)
    .where(eq(memoryChanges.ownerId, ownerId))
    .groupBy(memoryChanges.recordId);
  return new Map(rows.map((r) => [r.recordId, r.at]));
};

/** How many times each commitment's deadline was moved: lines of `memory_changes` for `due` that had a deadline before. */
export const movedCounts = async (ownerId: string) => {
  const rows = await getDb()
    .db.select({
      moves: sql<number>`count(*)`.mapWith(Number),
      recordId: memoryChanges.recordId,
    })
    .from(memoryChanges)
    .where(
      and(
        eq(memoryChanges.ownerId, ownerId),
        eq(memoryChanges.field, "due"),
        isNotNull(memoryChanges.before)
      )
    )
    .groupBy(memoryChanges.recordId);
  return new Map(rows.map((r) => [r.recordId, r.moves]));
};

// --- a card's «Кратко» (Г2.1) ---------------------------------------------------------------------------------------

const summaryLine = z.object({
  records: z.array(z.string()),
  text: z.string(),
});
const summaryBody = z.object({
  count: z.number(),
  how: z.array(summaryLine),
  now: z.array(summaryLine),
  who: z.array(summaryLine),
});
export type SummaryBody = z.infer<typeof summaryBody>;

/** What was written of a card: the sentences with the records they stand on, how many records there were, and when. */
export interface StoredSummary extends SummaryBody {
  builtAt: Date;
  coversAt: Date;
}

/** Puts a card's «Кратко» in, in place of the one it had. `coversAt` — the newest record that went into it. */
export const saveSummary = async (
  ownerId: string,
  entityId: string,
  body: SummaryBody,
  coversAt: Date
) => {
  const key = await dataKey(ownerId, true);
  if (!key) {
    throw new Error("memory: no data key");
  }
  const sealed = sealField(
    JSON.stringify(body),
    memoryAad(ownerId, SUMMARIES, entityId, BODY),
    key
  );
  const now = new Date();
  await getDb()
    .db.insert(memorySummaries)
    .values({ builtAt: now, coversAt, entityId, ownerId, sealed })
    .onConflictDoUpdate({
      set: { builtAt: now, coversAt, sealed },
      target: memorySummaries.entityId,
    });
};

/** A card's «Кратко» as it was written; null — none, or it cannot be opened. */
export const loadSummary = async (
  ownerId: string,
  entityId: string
): Promise<StoredSummary | null> => {
  const key = await dataKey(ownerId, false);
  if (!key) {
    return null;
  }
  const [row] = await getDb()
    .db.select()
    .from(memorySummaries)
    .where(
      and(
        eq(memorySummaries.entityId, entityId),
        eq(memorySummaries.ownerId, ownerId)
      )
    )
    .limit(1);
  if (!row) {
    return null;
  }
  try {
    const body = summaryBody.parse(
      JSON.parse(
        openField(
          row.sealed,
          memoryAad(ownerId, SUMMARIES, entityId, BODY),
          key
        )
      )
    );
    return { ...body, builtAt: row.builtAt, coversAt: row.coversAt };
  } catch {
    return null;
  }
};

/** The key of «Оставить» in «Сверка»: the commitment stays open and out of it for a while. */
export const keepKey = (recordId: string) => `stale:${recordId}`;

/** «Убрать» on the «Сверка» row of «Не упустить»: the row stays away for the rest of the week that starts on `week`. */
export const reviewKey = (week: string) => `review:${week}`;

export const dismissReview = async (ownerId: string, week: string) => {
  await getDb()
    .db.insert(memoryDismissals)
    .values({ key: reviewKey(week), ownerId })
    .onConflictDoUpdate({
      set: { at: new Date() },
      target: memoryDismissals.key,
    });
};

/** «Вернуть» after it. */
export const undismissReview = async (ownerId: string, week: string) => {
  await getDb()
    .db.delete(memoryDismissals)
    .where(
      and(
        eq(memoryDismissals.ownerId, ownerId),
        eq(memoryDismissals.key, reviewKey(week))
      )
    );
};

/** «Оставить» in «Сверка» (В2.1): the commitment is not shown there for 30 days. False — it is not an open one of theirs. */
export const keepOpen = async (ownerId: string, recordId: string) => {
  const { db } = getDb();
  const [row] = await db
    .select({ dueAt: memoryRecords.dueAt, status: memoryRecords.status })
    .from(memoryRecords)
    .where(
      and(
        eq(memoryRecords.id, recordId),
        eq(memoryRecords.ownerId, ownerId),
        eq(memoryRecords.kind, "commitment"),
        isNull(memoryRecords.deletedAt)
      )
    )
    .limit(1);
  if (!row) {
    return false;
  }
  const snapshot = { dueAt: row.dueAt, entityId: null, status: row.status };
  await db
    .insert(memoryDismissals)
    .values({ ...snapshot, key: keepKey(recordId), ownerId, recordId })
    .onConflictDoUpdate({
      set: { ...snapshot, at: new Date() },
      target: memoryDismissals.key,
    });
  return true;
};

/** «Вернуть» after «Оставить». */
export const unkeepOpen = async (ownerId: string, recordId: string) => {
  const rows = await getDb()
    .db.delete(memoryDismissals)
    .where(
      and(
        eq(memoryDismissals.ownerId, ownerId),
        eq(memoryDismissals.key, keepKey(recordId))
      )
    )
    .returning({ key: memoryDismissals.key });
  return rows.length > 0;
};

// --- merging cards (ARCH §19.8.5) ----------------------------------------------------------------------------------

/** What the kept card lacks it takes from the other one — its role and ways to reach them; what it has stays. */
const takes = (keep: MemoryEntity, gone: MemoryEntity) => ({
  takesEmail: !keep.email && Boolean(gone.email),
  takesPhone: !keep.phone && Boolean(gone.phone),
  takesRole: !keep.role && Boolean(gone.role),
});

const mergeBody = z.object({
  /** Other names `keep` got from `gone`. */
  aliasesAdded: z.array(z.string()),
  /** `gone`'s «Убрать» rows: moved to `keep` (`from` → `to`), or dropped as `keep` had one (`row`). */
  dismissals: z.array(
    z.object({
      from: z.string(),
      row: z
        .object({
          at: z.string(),
          dueAt: z.string().nullable(),
          recordId: z.string().nullable(),
          status: z.string().nullable(),
        })
        .optional(),
      to: z.string().optional(),
    })
  ),
  /** `gone`'s links dropped as repeats: `keep` had the same role in the same record. */
  dropped: z.array(z.object({ recordId: z.string(), role: z.string() })),
  /** The contacts the kept card took from the other one: «Вернуть» takes them off again. */
  emailTaken: z.boolean().optional(),
  /** `gone`'s links now on `keep`. */
  moved: z.array(z.object({ recordId: z.string(), role: z.string() })),
  phoneTaken: z.boolean().optional(),
  /** `keep`'s role before, when it took `gone`'s. */
  roleBefore: z.string().nullable().optional(),
});

const keyOf = (s: string) => s.trim().toLocaleLowerCase("ru");

/**
 * «Объединить» (ARCH §19.8.5): `gone` becomes part of `keep`, in one transaction. Its links go to `keep` (a repeat is
 * dropped), its name and other names become `keep`'s other names, `keep` takes its role if it has none, its «Убрать»
 * rows follow it. `gone` stays hidden (`merged_into`) for «Вернуть». Null when either card is not the owner's live
 * one, they are the same or of different kinds, or one of them is the owner's own.
 */
export const mergeEntities = async (
  ownerId: string,
  keepId: string,
  goneId: string
) => {
  const key = await dataKey(ownerId, false);
  if (!key || keepId === goneId) {
    return null;
  }
  return getDb().db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(memoryEntities)
      .where(
        and(
          eq(memoryEntities.ownerId, ownerId),
          inArray(memoryEntities.id, [keepId, goneId]),
          isNull(memoryEntities.mergedInto)
        )
      )
      .for("update");
    const keepRow = rows.find((r) => r.id === keepId);
    const goneRow = rows.find((r) => r.id === goneId);
    if (
      !(keepRow && goneRow) ||
      keepRow.kind !== goneRow.kind ||
      keepRow.kind === "self"
    ) {
      return null;
    }
    const keep = toEntity(keepRow, key);
    const gone = toEntity(goneRow, key);
    // Links: to `keep`, but not where it already has the same role in the same record.
    const moved = await tx
      .update(memoryRecordEntities)
      .set({ entityId: keepId })
      .where(
        and(
          eq(memoryRecordEntities.entityId, goneId),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(sql`memory_record_entities as k`)
              .where(
                sql`k.entity_id = ${keepId} and k.record_id = ${memoryRecordEntities.recordId} and k.role = ${memoryRecordEntities.role}`
              )
          )
        )
      )
      .returning({
        recordId: memoryRecordEntities.recordId,
        role: memoryRecordEntities.role,
      });
    const dropped = await tx
      .delete(memoryRecordEntities)
      .where(eq(memoryRecordEntities.entityId, goneId))
      .returning({
        recordId: memoryRecordEntities.recordId,
        role: memoryRecordEntities.role,
      });
    // Names: `gone`'s become `keep`'s other names, once each.
    const known = new Set([keep.name, ...keep.aliases].map(keyOf));
    const aliasesAdded: string[] = [];
    for (const name of [gone.name, ...gone.aliases]) {
      if (name.trim() && !known.has(keyOf(name))) {
        known.add(keyOf(name));
        aliasesAdded.push(name.trim());
      }
    }
    const { takesEmail, takesPhone, takesRole } = takes(keep, gone);
    await tx
      .update(memoryEntities)
      .set({
        sealed: sealEntity(
          ownerId,
          keepId,
          {
            aliases: [...keep.aliases, ...aliasesAdded],
            email: takesEmail ? gone.email : keep.email,
            name: keep.name,
            phone: takesPhone ? gone.phone : keep.phone,
            role: takesRole ? gone.role : keep.role,
            type: keep.type,
          },
          key
        ),
        updatedAt: new Date(),
      })
      .where(eq(memoryEntities.id, keepId));
    // «Убрать» rows keyed by `gone` (a rhythm row: `rule:card`) follow it; where `keep` has one already, it stays.
    const dismissals: z.infer<typeof mergeBody>["dismissals"] = [];
    const goneRows = await tx
      .select()
      .from(memoryDismissals)
      .where(
        and(
          eq(memoryDismissals.ownerId, ownerId),
          eq(memoryDismissals.entityId, goneId)
        )
      );
    for (const row of goneRows) {
      const to = row.key.replace(goneId, keepId);
      // oxlint-disable-next-line eslint/no-await-in-loop -- a handful of rows, one transaction
      const [taken] = await tx
        .select({ key: memoryDismissals.key })
        .from(memoryDismissals)
        .where(eq(memoryDismissals.key, to))
        .limit(1);
      if (taken) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- a handful of rows, one transaction
        await tx
          .delete(memoryDismissals)
          .where(eq(memoryDismissals.key, row.key));
        dismissals.push({
          from: row.key,
          row: {
            at: row.at.toISOString(),
            dueAt: row.dueAt?.toISOString() ?? null,
            recordId: row.recordId,
            status: row.status,
          },
        });
      } else {
        // oxlint-disable-next-line eslint/no-await-in-loop -- a handful of rows, one transaction
        await tx
          .update(memoryDismissals)
          .set({ entityId: keepId, key: to })
          .where(eq(memoryDismissals.key, row.key));
        dismissals.push({ from: row.key, to });
      }
    }
    await tx
      .update(memoryEntities)
      .set({ mergedInto: keepId, updatedAt: new Date() })
      .where(eq(memoryEntities.id, goneId));
    const id = crypto.randomUUID();
    const body: z.infer<typeof mergeBody> = {
      aliasesAdded,
      dismissals,
      dropped,
      emailTaken: takesEmail || undefined,
      moved,
      phoneTaken: takesPhone || undefined,
      roleBefore: takesRole ? keep.role : undefined,
    };
    await tx.insert(memoryMerges).values({
      goneId,
      id,
      keepId,
      ownerId,
      sealed: sealField(
        JSON.stringify(body),
        memoryAad(ownerId, MERGES, id, BODY),
        key
      ),
    });
    return { goneId, id, keepId };
  });
};

/**
 * «Вернуть» after «Объединить»: the links, names, role and «Убрать» rows go back as they were, and `gone` is a card
 * again. What was written to `keep` after the merge stays with it. False when there is no such merge of the owner's
 * still in force.
 */
export const undoMerge = async (ownerId: string, mergeId: string) => {
  const key = await dataKey(ownerId, false);
  if (!key) {
    return false;
  }
  return getDb().db.transaction(async (tx) => {
    const [merge] = await tx
      .select()
      .from(memoryMerges)
      .where(
        and(
          eq(memoryMerges.id, mergeId),
          eq(memoryMerges.ownerId, ownerId),
          isNull(memoryMerges.undoneAt)
        )
      )
      .for("update")
      .limit(1);
    if (!merge) {
      return false;
    }
    const [gone] = await tx
      .select({ into: memoryEntities.mergedInto })
      .from(memoryEntities)
      .where(eq(memoryEntities.id, merge.goneId))
      .limit(1);
    // Merged again since, or its keeper gone: nothing to put back.
    if (gone?.into !== merge.keepId) {
      return false;
    }
    const body = mergeBody.parse(
      JSON.parse(
        openField(merge.sealed, memoryAad(ownerId, MERGES, merge.id, BODY), key)
      )
    );
    for (const link of body.moved) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one card's links, one transaction
      await tx
        .update(memoryRecordEntities)
        .set({ entityId: merge.goneId })
        .where(
          and(
            eq(memoryRecordEntities.entityId, merge.keepId),
            eq(memoryRecordEntities.recordId, link.recordId),
            eq(memoryRecordEntities.role, link.role as MemoryRole)
          )
        );
    }
    if (body.dropped.length > 0) {
      await tx
        .insert(memoryRecordEntities)
        .values(
          body.dropped.map((l) => ({
            entityId: merge.goneId,
            recordId: l.recordId,
            role: l.role as MemoryRole,
          }))
        )
        .onConflictDoNothing();
    }
    const [keepRow] = await tx
      .select()
      .from(memoryEntities)
      .where(eq(memoryEntities.id, merge.keepId))
      .limit(1);
    if (keepRow) {
      const keep = toEntity(keepRow, key);
      const added = new Set(body.aliasesAdded.map(keyOf));
      await tx
        .update(memoryEntities)
        .set({
          sealed: sealEntity(
            ownerId,
            keep.id,
            {
              aliases: keep.aliases.filter((a) => !added.has(keyOf(a))),
              email: body.emailTaken ? null : keep.email,
              name: keep.name,
              phone: body.phoneTaken ? null : keep.phone,
              role: body.roleBefore === undefined ? keep.role : body.roleBefore,
              type: keep.type,
            },
            key
          ),
          updatedAt: new Date(),
        })
        .where(eq(memoryEntities.id, keep.id));
    }
    for (const d of body.dismissals) {
      if (d.to) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- a handful of rows, one transaction
        await tx
          .update(memoryDismissals)
          .set({ entityId: merge.goneId, key: d.from })
          .where(eq(memoryDismissals.key, d.to));
      } else if (d.row) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- a handful of rows, one transaction
        await tx
          .insert(memoryDismissals)
          .values({
            at: new Date(d.row.at),
            dueAt: d.row.dueAt ? new Date(d.row.dueAt) : null,
            entityId: merge.goneId,
            key: d.from,
            ownerId,
            recordId: d.row.recordId,
            status: d.row.status as MemoryStatus | null,
          })
          .onConflictDoNothing();
      }
    }
    await tx
      .update(memoryEntities)
      .set({ mergedInto: null, updatedAt: new Date() })
      .where(eq(memoryEntities.id, merge.goneId));
    await tx
      .update(memoryMerges)
      .set({ undoneAt: new Date() })
      .where(eq(memoryMerges.id, merge.id));
    return true;
  });
};

/** The «Разные» row of a pair: one key whichever card comes first. */
export const mergePairKey = (a: string, b: string) =>
  a < b ? `merge:${a}:${b}` : `merge:${b}:${a}`;

/** «Разные» on «Один человек?»: the pair is not offered again. */
export const dismissMergePair = async (
  ownerId: string,
  a: string,
  b: string
) => {
  await getDb()
    .db.insert(memoryDismissals)
    .values({ key: mergePairKey(a, b), ownerId })
    .onConflictDoNothing();
};

/** «Один человек?» in «Не записано» (ARCH §19.8.5): a few pairs of cards that may be one, none said to be different. */
export const mergeSuggestions = async (ownerId: string) => {
  const [entities, rows] = await Promise.all([
    listEntities(ownerId),
    getDb()
      .db.select({ key: memoryDismissals.key })
      .from(memoryDismissals)
      .where(
        and(
          eq(memoryDismissals.ownerId, ownerId),
          sql`${memoryDismissals.key} like 'merge:%'`
        )
      ),
  ]);
  return likelySame(entities, new Set(rows.map((r) => r.key)), mergePairKey);
};
