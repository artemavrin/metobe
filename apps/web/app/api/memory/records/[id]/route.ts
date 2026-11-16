import { memoryRecordPatchSchema } from "@metobe/contracts/memory";
import type { MemoryRecordPatch } from "@metobe/contracts/memory";
import {
  correctRecord,
  deleteRecord,
  editCommitment,
  editReminder,
  listRecords,
  setPromiseReminder,
} from "@metobe/core/memory";

import { memoryOwner, notFound, pathId } from "@/lib/memory-route";

// PATCH /api/memory/records/[id] (P16): «Изменить» on the page. A new text is a correction — a new version under a
// new id, the old one in the history; status, deadline and «важно» are a commitment's and go into its history.
// DELETE — «Удалить», with «Вернуть» (`POST …/restore`).

interface Params {
  params: Promise<{ id: string }>;
}

type Patch = MemoryRecordPatch;

const dateOf = (v: string | null | undefined) =>
  typeof v === "string" ? new Date(v) : v;

/**
 * A reminder of its own (D45) is a row of «Напоминания» like a promise: «Готово» and «Не сделано» mark it, a new time
 * — or a new day — moves it.
 */
const patchReminder = (owner: string, id: string, patch: Patch) =>
  editReminder(owner, id, {
    at: dateOf(patch.remindAt) ?? dateOf(patch.dueAt) ?? undefined,
    done: patch.status === undefined ? undefined : patch.status !== "open",
    repeat: patch.repeat,
  });

/** A commitment's status, deadline and «важно» go into its history; its reminder is a schedule of its own. */
const patchCommitment = async (owner: string, id: string, patch: Patch) => {
  const { dueAt, status, important, remindAt, repeat } = patch;
  if (
    (status !== undefined || dueAt !== undefined || important !== undefined) &&
    !(await editCommitment(owner, id, {
      dueAt: dateOf(dueAt),
      important,
      status,
    }))
  ) {
    return false;
  }
  return remindAt === undefined && repeat === undefined
    ? true
    : setPromiseReminder(owner, id, dateOf(remindAt), repeat);
};

export const PATCH = async (request: Request, { params }: Params) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const patch = memoryRecordPatchSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!patch.success) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  let id = await pathId(params);
  if (!id) {
    return notFound();
  }
  const [record] = await listRecords(owner, { ids: [id] });
  const done =
    record?.schedule?.kind === "reminder"
      ? await patchReminder(owner, id, patch.data)
      : await patchCommitment(owner, id, patch.data);
  if (!done) {
    return notFound();
  }
  const { text } = patch.data;
  if (text !== undefined) {
    const next = await correctRecord(owner, id, text);
    if (!next) {
      return notFound();
    }
    ({ id } = next);
  }
  return Response.json({ id });
};

export const DELETE = async (_request: Request, { params }: Params) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const id = await pathId(params);
  return id && (await deleteRecord(owner, id))
    ? Response.json({ deleted: true })
    : notFound();
};
