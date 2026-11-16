import { memoryCardCreateSchema } from "@metobe/contracts/memory";
import { createCard } from "@metobe/core/memory-page";

import { memoryOwner } from "@/lib/memory-route";

// POST /api/memory/cards (P22): a card made by hand — «+» next to a section of the list. `existed` — a card of that
// name was there already: it comes back instead of a second one.

export const dynamic = "force-dynamic";

export const POST = async (request: Request) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const body = memoryCardCreateSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!body.success) {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  return Response.json(await createCard(owner, body.data));
};
