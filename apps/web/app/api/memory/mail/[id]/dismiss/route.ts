import { dismissMailWait, undismissMailWait } from "@metobe/core/memory";

import { memoryOwner, notFound, pathId } from "@/lib/memory-route";

// POST /api/memory/mail/[id]/dismiss (Г3.1): «Убрать» on a letter with no answer — away until the person writes again
// in its thread. DELETE — «Вернуть».

interface Params {
  params: Promise<{ id: string }>;
}

export const POST = async (_request: Request, { params }: Params) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const id = await pathId(params);
  return id && (await dismissMailWait(owner, id))
    ? Response.json({ dismissed: true })
    : notFound();
};

export const DELETE = async (_request: Request, { params }: Params) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const id = await pathId(params);
  return id && (await undismissMailWait(owner, id))
    ? Response.json({ restored: true })
    : notFound();
};
