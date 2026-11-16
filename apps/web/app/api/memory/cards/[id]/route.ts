import { memoryCardPatchSchema } from "@metobe/contracts/memory";
import type { MemoryCard } from "@metobe/contracts/memory";
import { updateEntity } from "@metobe/core/memory";
import { memoryCard } from "@metobe/core/memory-page";

import { memoryOwner, notFound, pathId } from "@/lib/memory-route";
import { getPrefs } from "@/lib/prefs";

// GET /api/memory/cards/[id] (P16): a person, organization or project with all it takes part in.
// PATCH — its name, other names or role, by hand.

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export const GET = async (_request: Request, { params }: Params) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const id = await pathId(params);
  const { timeZone } = await getPrefs();
  const card = id ? await memoryCard(owner, id, timeZone) : null;
  return card ? Response.json(card satisfies MemoryCard) : notFound();
};

export const PATCH = async (request: Request, { params }: Params) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const patch = memoryCardPatchSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!patch.success) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const id = await pathId(params);
  // The person's own card is not on the page and is not changed from it.
  const card = id ? await memoryCard(owner, id, "UTC") : null;
  if (!(id && card)) {
    return notFound();
  }
  await updateEntity(owner, id, patch.data);
  return Response.json({ updated: true });
};
