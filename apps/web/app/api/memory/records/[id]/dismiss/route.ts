import { dismissSuggestion, undismissSuggestion } from "@metobe/core/memory";

import { memoryOwner, notFound, pathId } from "@/lib/memory-route";

// POST /api/memory/records/[id]/dismiss (P17): «Убрать» in «На сегодня» — not suggested again while its deadline and
// status stay as they are. DELETE — «Вернуть».

interface Params {
  params: Promise<{ id: string }>;
}

export const POST = async (_request: Request, { params }: Params) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const id = await pathId(params);
  return id && (await dismissSuggestion(owner, id))
    ? Response.json({ dismissed: true })
    : notFound();
};

export const DELETE = async (_request: Request, { params }: Params) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const id = await pathId(params);
  return id && (await undismissSuggestion(owner, id))
    ? Response.json({ restored: true })
    : notFound();
};
