import { sendReminder } from "@metobe/core/memory-remind";
import { z } from "zod";

import { memoryOwner, notFound, pathId } from "@/lib/memory-route";
import { getPrefs } from "@/lib/prefs";

// POST /api/memory/records/[id]/reminder/send (Г2.4): the letter as the person left it in the window, from their box —
// the press of «Отправить» is the «ask first?». Then an event on the card and the row away from «Не упустить». A letter
// the mail server refused comes back as 502 with its words.

const bodySchema = z.object({
  mailbox: z.string().max(320).optional(),
  subject: z.string().trim().min(1).max(300),
  text: z.string().trim().min(1).max(20_000),
  to: z.email().max(320),
});

export const POST = async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const id = await pathId(params);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!(id && body.success)) {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  const { locale, timeZone } = await getPrefs();
  try {
    const sent = await sendReminder(owner, id, body.data, {
      locale,
      timeZone,
    });
    return sent ? Response.json(sent) : notFound();
  } catch (error) {
    console.error("memory: a reminder letter was not sent", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "not sent" },
      { status: 502 }
    );
  }
};
