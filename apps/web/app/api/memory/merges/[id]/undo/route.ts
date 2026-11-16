import { undoMerge } from "@metobe/core/memory";

import { memoryOwner, notFound, pathId } from "@/lib/memory-route";

// POST /api/memory/merges/[id]/undo (ARCH §19.8.5): «Вернуть» after «Объединить» — both cards as they were; what was
// written to the one left after the merge stays with it.

export const POST = async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const id = await pathId(params);
  return id && (await undoMerge(owner, id))
    ? Response.json({ undone: true })
    : notFound();
};
