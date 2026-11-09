import { dismissSuggestion, undismissSuggestion } from "@metobe/core/memory";
import { z } from "zod";

import { memoryOwner, notFound, pathId } from "@/lib/memory-route";

// POST /api/memory/records/[id]/dismiss (P17): «Убрать» in «Не упустить» — a commitment is not suggested again while
// its deadline and status stay as they are; a rhythm row (a rule's id, `{ entityId, since }` in the body) while the
// last contact with the card stays the same. DELETE — «Вернуть» (`?entity=` for a rhythm row).

interface Params {
  params: Promise<{ id: string }>;
}

const rhythmSchema = z.object({
  entityId: z.uuid(),
  since: z.iso.datetime().nullable(),
});

export const POST = async (request: Request, { params }: Params) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const id = await pathId(params);
  // No body — a commitment; a body that is not a rhythm row's is not one either.
  const given = rhythmSchema.safeParse(await request.json().catch(() => null));
  const rhythm = given.success ? given.data : null;
  const done =
    id &&
    (await dismissSuggestion(
      owner,
      id,
      rhythm
        ? {
            entityId: rhythm.entityId,
            since: rhythm.since ? new Date(rhythm.since) : null,
          }
        : undefined
    ));
  return done ? Response.json({ dismissed: true }) : notFound();
};

export const DELETE = async (request: Request, { params }: Params) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const id = await pathId(params);
  const entity = z
    .uuid()
    .safeParse(new URL(request.url).searchParams.get("entity"));
  return id &&
    (await undismissSuggestion(
      owner,
      id,
      entity.success ? entity.data : undefined
    ))
    ? Response.json({ restored: true })
    : notFound();
};
