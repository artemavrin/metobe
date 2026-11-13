import { letterTones } from "@metobe/core/memory-letter";
import { reminderDraft } from "@metobe/core/memory-remind";
import { z } from "zod";

import { memoryOwner, notFound, pathId } from "@/lib/memory-route";
import { getPrefs } from "@/lib/prefs";

// POST /api/memory/records/[id]/reminder (Г2.4, P23 «Окно»): the letter «Напомнить» opens with — to the one who owes
// the person an open promise. `{ tone }` asks the model to write it again shorter or softer. Not a promise the person is
// owed, or not open — 404.

const bodySchema = z.object({ tone: z.enum(letterTones).default("base") });

export const POST = async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const id = await pathId(params);
  const body = bodySchema.safeParse(
    (await request.json().catch(() => null)) ?? {}
  );
  if (!(id && body.success)) {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  const { locale, timeZone } = await getPrefs();
  const draft = await reminderDraft(owner, id, {
    locale,
    timeZone,
    tone: body.data.tone,
  });
  return draft ? Response.json(draft) : notFound();
};
