import { memoryMergeSchema } from "@metobe/contracts/memory";
import { mergeEntities } from "@metobe/core/memory";

import { memoryOwner, notFound, pathId } from "@/lib/memory-route";

// POST /api/memory/cards/[id]/merge (ARCH §19.8.5): «Объединить с…» — this card goes into `into`: its records, other
// names and «Убрать» rows go with it, it is gone from the page. The answer's `id` is for «Вернуть».

export const POST = async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const id = await pathId(params);
  const body = memoryMergeSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!(id && body.success)) {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  const merge = await mergeEntities(owner, body.data.into, id);
  return merge ? Response.json({ id: merge.id }) : notFound();
};
