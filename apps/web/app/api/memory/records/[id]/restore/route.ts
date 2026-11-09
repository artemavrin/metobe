import { restoreRecord } from "@metobe/core/memory";

import { memoryOwner, notFound, pathId } from "@/lib/memory-route";

// POST /api/memory/records/[id]/restore (P16): «Вернуть» after «Удалить».

export const POST = async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const id = await pathId(params);
  return id && (await restoreRecord(owner, id))
    ? Response.json({ restored: true })
    : notFound();
};
