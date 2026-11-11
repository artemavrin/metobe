import { keepOpen, unkeepOpen } from "@metobe/core/memory";

import { memoryOwner, notFound, pathId } from "@/lib/memory-route";

// POST /api/memory/records/[id]/keep (Д2): «Оставить» in «Сверка» — the commitment stays open and is not shown there
// for 30 days. DELETE — «Вернуть».

interface Params {
  params: Promise<{ id: string }>;
}

export const POST = async (_request: Request, { params }: Params) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const id = await pathId(params);
  return id && (await keepOpen(owner, id))
    ? Response.json({ kept: true })
    : notFound();
};

export const DELETE = async (_request: Request, { params }: Params) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const id = await pathId(params);
  return id && (await unkeepOpen(owner, id))
    ? Response.json({ kept: false })
    : notFound();
};
