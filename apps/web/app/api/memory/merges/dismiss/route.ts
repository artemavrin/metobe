import { memoryMergePairSchema } from "@metobe/contracts/memory";
import { dismissMergePair } from "@metobe/core/memory";

import { memoryOwner } from "@/lib/memory-route";

// POST /api/memory/merges/dismiss (ARCH §19.8.5): «Разные» on «Один человек?» — the pair is not offered again.

export const POST = async (request: Request) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const body = memoryMergePairSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!body.success) {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  await dismissMergePair(owner, body.data.a, body.data.b);
  return Response.json({ dismissed: true });
};
