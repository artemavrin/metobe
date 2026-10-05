import "server-only";
import { FILE_MAX_BYTES, acceptedFile } from "@metobe/contracts/files";
import type { UploadError, UploadedFile } from "@metobe/contracts/files";
import { files } from "@metobe/db/schema/files";
import { and, count, eq, inArray, isNull, notInArray, sum } from "drizzle-orm";

import { getDb } from "./db";
import { deleteObject, getObject, getStorage, putObject } from "./storage";

// Attachments (D33): a file goes to S3 as soon as it is picked, its row says whose it is; it joins a chat when its
// message is saved. The browser never talks to S3 — it reads a file back through GET /api/files/[id].

const keyOf = (id: string) => `files/${id}`;

/** Stores one picked file for its user; refuses what is too big, of a type we do not read, or with storage off. */
export const createFile = async (
  userId: string,
  file: File
): Promise<{ file: UploadedFile } | { error: UploadError }> => {
  if (!getStorage()) {
    return { error: "storage-off" };
  }
  if (file.size > FILE_MAX_BYTES) {
    return { error: "too-big" };
  }
  const accepted = acceptedFile(file.name);
  if (!accepted) {
    return { error: "type" };
  }
  const id = crypto.randomUUID();
  const key = keyOf(id);
  try {
    await putObject(key, new Uint8Array(await file.arrayBuffer()), {
      contentLength: file.size,
      contentType: accepted.mediaType,
    });
  } catch (error) {
    console.error("files: upload failed", error);
    return { error: "failed" };
  }
  const { db } = getDb();
  const name = file.name.slice(0, 255);
  await db.insert(files).values({
    id,
    kind: accepted.kind,
    mediaType: accepted.mediaType,
    name,
    size: file.size,
    storageKey: key,
    userId,
  });
  return {
    file: {
      id,
      kind: accepted.kind,
      mediaType: accepted.mediaType,
      name,
      size: file.size,
    },
  };
};

/** A file of this user (by id), or null. */
export const getFile = async (userId: string, id: string) => {
  const { db } = getDb();
  const [row] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, id), eq(files.userId, userId)));
  return row ?? null;
};

/** The bytes of a file, streamed from S3. */
export const readFile = (storageKey: string) => getObject(storageKey);

/** The user's files among `ids` — the ones a message may carry. */
export const filesOf = async (userId: string, ids: string[]) => {
  if (ids.length === 0) {
    return [];
  }
  const { db } = getDb();
  return await db
    .select()
    .from(files)
    .where(and(eq(files.userId, userId), inArray(files.id, ids)));
};

/** The files of a message join its chat once it is saved; a file already in another chat stays where it is. */
export const attachFiles = async (
  userId: string,
  chatId: string,
  ids: string[]
) => {
  if (ids.length === 0) {
    return;
  }
  const { db } = getDb();
  await db
    .update(files)
    .set({ chatId })
    .where(
      and(
        eq(files.userId, userId),
        inArray(files.id, ids),
        isNull(files.chatId)
      )
    );
};

/** Takes back a file still in the composer (no chat yet): the object, then the row. */
export const deleteDraftFile = async (userId: string, id: string) => {
  const file = await getFile(userId, id);
  if (!file || file.chatId) {
    return false;
  }
  await deleteObject(file.storageKey).catch((error) =>
    console.error("files: could not delete the object", id, error)
  );
  const { db } = getDb();
  await db.delete(files).where(eq(files.id, id));
  return true;
};

/**
 * After a message was edited: the chat's files that no message carries any more (taken out by the edit, or in the
 * answers and questions the edit dropped) — their objects, then their rows. Best effort, like the other deletes.
 */
export const pruneChatFiles = async (chatId: string, keep: string[]) => {
  if (!getStorage()) {
    return;
  }
  const { db } = getDb();
  const rows = await db
    .select({ id: files.id, key: files.storageKey })
    .from(files)
    .where(
      keep.length > 0
        ? and(eq(files.chatId, chatId), notInArray(files.id, keep))
        : eq(files.chatId, chatId)
    );
  const gone: string[] = [];
  await Promise.all(
    rows.map(async (r) => {
      try {
        await deleteObject(r.key);
        gone.push(r.id);
      } catch (error) {
        console.error("files: could not delete the object", r.key, error);
      }
    })
  );
  if (gone.length > 0) {
    await db.delete(files).where(inArray(files.id, gone));
  }
};

/** Before a chat is deleted: its files' objects (the rows go with the chat). Best effort — a row never outlives it. */
export const deleteChatObjects = async (chatId: string) => {
  if (!getStorage()) {
    return;
  }
  const { db } = getDb();
  const rows = await db
    .select({ key: files.storageKey })
    .from(files)
    .where(eq(files.chatId, chatId));
  await Promise.all(
    rows.map((r) =>
      deleteObject(r.key).catch((error) =>
        console.error("files: could not delete the object", r.key, error)
      )
    )
  );
};

/** Before an account is deleted: every object of its files (the rows go with the user). */
export const deleteUserObjects = async (userId: string) => {
  if (!getStorage()) {
    return;
  }
  const { db } = getDb();
  const rows = await db
    .select({ key: files.storageKey })
    .from(files)
    .where(eq(files.userId, userId));
  await Promise.all(
    rows.map((r) =>
      deleteObject(r.key).catch((error) =>
        console.error("files: could not delete the object", r.key, error)
      )
    )
  );
};

/** What the files take, in all: how many and how many bytes, by kind — for the admin's storage screen. */
export const storageUsage = async () => {
  const rows = await getDb()
    .db.select({
      bytes: sum(files.size),
      count: count(),
      kind: files.kind,
    })
    .from(files)
    .groupBy(files.kind);
  const kinds = rows.map((r) => ({
    bytes: Number(r.bytes ?? 0),
    count: r.count,
    kind: r.kind,
  }));
  return {
    bytes: kinds.reduce((total, k) => total + k.bytes, 0),
    count: kinds.reduce((total, k) => total + k.count, 0),
    kinds,
  };
};

export type { FileRow } from "@metobe/db/schema/files";
