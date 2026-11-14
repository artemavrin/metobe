import { mailReminderDraft } from "@metobe/core/memory-remind";

import { memoryOwner, notFound, pathId } from "@/lib/memory-route";
import { getPrefs } from "@/lib/prefs";

// POST /api/memory/mail/[id]/reminder (Г3.1): the reply «Напомнить» opens with for a letter with no answer — by the
// template, in its thread, from the box it went from. No such wait — 404.

export const POST = async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const id = await pathId(params);
  if (!id) {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  const { locale, timeZone } = await getPrefs();
  const draft = await mailReminderDraft(owner, id, { locale, timeZone });
  return draft ? Response.json(draft) : notFound();
};
