import "server-only";
import type {
  MemoryEntityKind,
  MemoryPrecision,
  MemoryRecordKind,
  MemoryRole,
  MemoryStatus,
  MemoryWriteStatus,
} from "@metobe/contracts/memory";
import type { Db } from "@metobe/db/client";
import {
  memoryEntities,
  memoryKeys,
  memoryRecordEntities,
  memoryRecords,
  memoryWrites,
} from "@metobe/db/schema/memory";
import { and, desc, eq, inArray, isNull, notExists, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "./db";
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
const global = globalThis as { [CACHE]?: Map<string, SecretsKey> };
const cache = () => (global[CACHE] ??= new Map<string, SecretsKey>());

/** The owner's data key; made on the first write (`create`), otherwise null — a person with nothing kept has no key. */
const dataKey = async (
  ownerId: string,
  create: boolean
): Promise<SecretsKey | null> => {
  const cached = cache().get(ownerId);
  if (cached) {
    return cached;
  }
  const { db } = getDb();
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
  cache().set(ownerId, key);
  return key;
};

const ENTITIES = "memory_entities";
const RECORDS = "memory_records";
const BODY = "body";

// --- entities ----------------------------------------------------------------------------------------------------

const entityBody = z.object({
  aliases: z.array(z.string()),
  name: z.string(),
  role: z.string().nullable(),
});

export interface MemoryEntity {
  id: string;
  kind: MemoryEntityKind;
  /** The name it is known by; `aliases` are the other ways it is called. */
  name: string;
  aliases: string[];
  /** «закупщик поставщика», «наш перевозчик»: who it is to the person. */
  role: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const sealEntity = (
  ownerId: string,
  id: string,
  body: z.infer<typeof entityBody>,
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
    id: row.id,
    kind: row.kind,
    name: body.name,
    role: body.role,
    updatedAt: row.updatedAt,
  };
};

export const createEntity = async (
  ownerId: string,
  input: {
    kind: Exclude<MemoryEntityKind, "self">;
    name: string;
    aliases?: string[];
    role?: string | null;
    /** The write that found it: undoing the write takes the card away with it. */
    writeId?: string;
  }
) => {
  const name = input.name.trim();
  if (!name) {
    throw new Error("memory: an entity needs a name");
  }
  const key = await dataKey(ownerId, true);
  if (!key) {
    throw new Error("memory: no data key");
  }
  const id = crypto.randomUUID();
  const body = {
    aliases: input.aliases ?? [],
    name,
    role: input.role ?? null,
  };
  const [row] = await getDb()
    .db.insert(memoryEntities)
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

export const listEntities = async (ownerId: string) => {
  const key = await dataKey(ownerId, false);
  if (!key) {
    return [];
  }
  const rows = await getDb()
    .db.select()
    .from(memoryEntities)
    .where(eq(memoryEntities.ownerId, ownerId))
    .orderBy(memoryEntities.createdAt);
  return rows.map((row) => toEntity(row, key));
};

/** Changes a card in place; null when the owner has no such card. */
export const updateEntity = async (
  ownerId: string,
  id: string,
  patch: { name?: string; aliases?: string[]; role?: string | null }
) => {
  const key = await dataKey(ownerId, false);
  if (!key) {
    return null;
  }
  const { db } = getDb();
  const where = and(
    eq(memoryEntities.id, id),
    eq(memoryEntities.ownerId, ownerId)
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
          name,
          role: patch.role === undefined ? was.role : patch.role,
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

const recordBody = z.object({ text: z.string() });

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
  /** The write it comes from; leave out for what the person put in by hand. */
  writeId?: string;
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
  doneAt: Date | null;
  recordedAt: Date;
  supersededAt: Date | null;
  deletedAt: Date | null;
  writeId: string | null;
}

const toRecord = (
  row: typeof memoryRecords.$inferSelect,
  entities: MemoryRecord["entities"],
  key: SecretsKey
): MemoryRecord => ({
  deletedAt: row.deletedAt,
  doneAt: row.doneAt,
  dueAt: row.dueAt,
  entities,
  givenAt: row.givenAt,
  id: row.id,
  kind: row.kind,
  occurredAt: row.occurredAt,
  occurredPrecision: row.occurredPrecision,
  recordedAt: row.recordedAt,
  status: row.status,
  supersededAt: row.supersededAt,
  text: recordBody.parse(
    JSON.parse(
      openField(row.sealed, memoryAad(row.ownerId, RECORDS, row.id, BODY), key)
    )
  ).text,
  validFrom: row.validFrom,
  validTo: row.validTo,
  writeId: row.writeId,
});

const insertRecord = async (
  tx: Tx,
  ownerId: string,
  key: SecretsKey,
  input: MemoryRecordInput
) => {
  const text = input.text.trim();
  if (!text) {
    throw new Error("memory: a record needs a text");
  }
  if (input.kind !== "commitment" && input.status) {
    throw new Error("memory: only a commitment has a status");
  }
  const links = [
    ...new Map(
      input.entities.map((e) => [`${e.entityId}:${e.role}`, e] as const)
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
      doneAt: status === "done" ? new Date() : null,
      dueAt: input.dueAt,
      givenAt: input.givenAt,
      id,
      kind: input.kind,
      occurredAt: input.occurred?.at,
      occurredPrecision: input.occurred?.precision,
      ownerId,
      sealed: sealField(
        JSON.stringify({ text }),
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

/** Marks a commitment done or open again; `writeId` — the write that said it, so undoing the write undoes this. */
export const setCommitmentStatus = async (
  ownerId: string,
  id: string,
  status: MemoryStatus,
  writeId?: string
) => {
  const done = status === "done";
  const rows = await getDb()
    .db.update(memoryRecords)
    .set({
      closedByWrite: done ? (writeId ?? null) : null,
      doneAt: done ? new Date() : null,
      status,
    })
    .where(
      and(
        eq(memoryRecords.id, id),
        eq(memoryRecords.ownerId, ownerId),
        eq(memoryRecords.kind, "commitment"),
        isNull(memoryRecords.deletedAt)
      )
    )
    .returning({ id: memoryRecords.id });
  return rows.length > 0;
};

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
 * One row per message looked at. The same message again is the same write — `created` says which — so a message
 * queued twice is not read twice.
 */
export const createWrite = async (
  ownerId: string,
  input: { chatId: string; messageId: string }
) => {
  const { db } = getDb();
  const [made] = await db
    .insert(memoryWrites)
    .values({ ...input, id: crypto.randomUUID(), ownerId })
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
        eq(memoryWrites.messageId, input.messageId)
      )
    )
    .limit(1);
  if (!existing) {
    throw new Error("memory: the write was not saved");
  }
  return { created: false, id: existing.id, status: existing.status };
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

/**
 * «Запомнено» undone: what the write put in is hidden, what it replaced or closed is as it was, and the cards it
 * found go if nothing else holds them. False when there is no such write of the owner, or it is already undone.
 */
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
    await tx.delete(memoryEntities).where(
      and(
        eq(memoryEntities.ownerId, ownerId),
        eq(memoryEntities.writeId, writeId),
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
    await tx
      .update(memoryWrites)
      .set({ finishedAt: new Date(), status: "undone" })
      .where(eq(memoryWrites.id, writeId));
    return true;
  });

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
