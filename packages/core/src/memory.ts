import "server-only";
import type {
  ChatMemory,
  MemoryChangeField,
  MemoryEntityKind,
  MemoryPrecision,
  MemoryRecordKind,
  MemoryRole,
  MemoryStatus,
  MemoryWriteStatus,
} from "@metobe/contracts/memory";
import type { Db } from "@metobe/db/client";
import {
  memoryChanges,
  memoryDrafts,
  memoryEntities,
  memoryKeys,
  memoryRecordEntities,
  memoryRecords,
  memoryWrites,
} from "@metobe/db/schema/memory";
import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  lte,
  notExists,
  sql,
} from "drizzle-orm";
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
const DRAFTS = "memory_drafts";
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

interface EntityInput {
  kind: Exclude<MemoryEntityKind, "self">;
  name: string;
  aliases?: string[];
  role?: string | null;
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
  /** Commitments only: the person said it is important, or marked it so. */
  important?: boolean;
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
  important: boolean;
  doneAt: Date | null;
  /** The write that closed it (a fact's end, a commitment's status). */
  closedByWrite: string | null;
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

/** A commitment that is over — done or no longer needed; `unconfirmed` is not over, it waits for the person. */
const ENDED = new Set<MemoryStatus>(["done", "cancelled"]);

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
  if (input.kind !== "commitment" && (input.status || input.important)) {
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
      doneAt: status && ENDED.has(status) ? new Date() : null,
      dueAt: input.dueAt,
      givenAt: input.givenAt,
      id,
      important: input.important ?? false,
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

type PlannedLink =
  | { entityId: string; role: MemoryRole }
  | { newRef: string; role: MemoryRole }
  /** The card the person picks in answer to the write's question (P18). */
  | { ask: string; role: MemoryRole };

type PlannedRecord = Omit<MemoryRecordInput, "entities" | "writeId"> & {
  entities: PlannedLink[];
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
}

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
  const keeps = adds || plan.statuses.length > 0;
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
      await Promise.all(
        plan.records.map((r) =>
          insertRecord(tx, ownerId, key, {
            ...r,
            entities: settle(r.entities).flatMap((l) =>
              "entityId" in l ? [{ entityId: l.entityId, role: l.role }] : []
            ),
            writeId,
          })
        )
      );
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
  messageId: string;
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

/** Open questions: of one chat (under its answers), or all of them («Не записано» on the «Память» page). */
export const listQuestions = async (
  ownerId: string,
  filter: { chatId?: string } = {}
): Promise<MemoryQuestion[]> => {
  const key = await dataKey(ownerId, false);
  if (!key) {
    return [];
  }
  const { db } = getDb();
  const rows = await db
    .select({
      chatId: memoryWrites.chatId,
      draft: memoryDrafts,
      messageId: memoryWrites.messageId,
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
  return rows.map(({ chatId, draft, messageId }) => {
    const body = openDraft(draft, key);
    return {
      candidates: body.candidates.flatMap((id) => {
        const card = cards.get(id);
        return card
          ? [{ id, kind: card.kind, name: card.name, role: card.role }]
          : [];
      }),
      chatId,
      createdAt: draft.createdAt,
      id: draft.id,
      messageId,
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
      if (!body.candidates.includes(answer.entityId)) {
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

/** What the memory took from one chat: «Запомнено» per message, and the open questions (P18). */
export const chatMemory = async (ownerId: string, chatId: string) => {
  const writes = await getDb()
    .db.select({ id: memoryWrites.id, messageId: memoryWrites.messageId })
    .from(memoryWrites)
    .where(
      and(
        eq(memoryWrites.ownerId, ownerId),
        eq(memoryWrites.chatId, chatId),
        eq(memoryWrites.status, "done")
      )
    );
  const ids = writes.map((w) => w.id);
  const [records, closed] =
    ids.length > 0
      ? await Promise.all([
          listRecords(ownerId, { writeIds: ids }),
          listRecords(ownerId, { closedBy: ids, kinds: ["commitment"] }),
        ])
      : [[], []];
  // Oldest first under one answer: in the order the message said them; what it settled after what it added.
  const byWrite = new Map<string, ChatMemory["notes"][number]["records"]>();
  const add = (
    writeId: string,
    line: ChatMemory["notes"][number]["records"][number]
  ) => byWrite.set(writeId, [...(byWrite.get(writeId) ?? []), line]);
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const r = records[i];
    if (r?.writeId) {
      add(r.writeId, { id: r.id, text: r.text });
    }
  }
  for (const r of closed) {
    if (r.closedByWrite && r.status && r.status !== "open") {
      add(r.closedByWrite, { id: r.id, status: r.status, text: r.text });
    }
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
 * Messages deleted from a chat (a retry, an edit, a regenerated answer): what they put in is undone, and their writes
 * go, so the same message sent again is read afresh.
 */
export const forgetMessages = async (ownerId: string, messageIds: string[]) => {
  if (messageIds.length === 0) {
    return;
  }
  const { db } = getDb();
  const writes = await db
    .select({ id: memoryWrites.id })
    .from(memoryWrites)
    .where(
      and(
        eq(memoryWrites.ownerId, ownerId),
        inArray(memoryWrites.messageId, messageIds)
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
    status: old.status ?? undefined,
    text,
    validFrom: old.validFrom ?? undefined,
    validTo: old.validTo ?? undefined,
    writeId: old.writeId ?? undefined,
  });
};

/** Which chat each write came from; a write of a deleted chat has none. */
export const writeChats = async (ownerId: string, writeIds: string[]) => {
  if (writeIds.length === 0) {
    return new Map<string, { chatId: string | null; messageId: string }>();
  }
  const rows = await getDb()
    .db.select({
      chatId: memoryWrites.chatId,
      id: memoryWrites.id,
      messageId: memoryWrites.messageId,
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
