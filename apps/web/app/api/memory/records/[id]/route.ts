import { memoryRecordPatchSchema } from "@metobe/contracts/memory";
import {
  correctRecord,
  deleteRecord,
  editCommitment,
} from "@metobe/core/memory";

import { memoryOwner, notFound, pathId } from "@/lib/memory-route";

// PATCH /api/memory/records/[id] (P16): «Изменить» on the page. A new text is a correction — a new version under a
// new id, the old one in the history; status, deadline and «важно» are a commitment's and go into its history.
// DELETE — «Удалить», with «Вернуть» (`POST …/restore`).

interface Params {
  params: Promise<{ id: string }>;
}

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
  const { text, dueAt, status, important, remindAt, repeat } = patch.data;
  if (
    (status !== undefined ||
      dueAt !== undefined ||
      important !== undefined ||
      remindAt !== undefined ||
      repeat !== undefined) &&
    !(await editCommitment(owner, id, {
      dueAt: typeof dueAt === "string" ? new Date(dueAt) : dueAt,
      important,
      remindAt: typeof remindAt === "string" ? new Date(remindAt) : remindAt,
      repeat,
      status,
    }))
  ) {
    return notFound();
  }
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
