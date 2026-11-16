import { recordContact } from "@metobe/core/memory";
import { localMidnight } from "@metobe/core/memory-extract";
import { z } from "zod";

import { dayKey } from "@/lib/memory-dates";
import { memoryOwner, notFound, pathId } from "@/lib/memory-route";
import { getPrefs } from "@/lib/prefs";

// POST /api/memory/cards/[id]/contact (ARCH §19.6): «Уже было» on a rhythm row of «Не упустить» — a contact with the
// card today, in the person's zone. The words are the page's («Контакт: Андрей Седов»); «Вернуть» deletes the record.

const bodySchema = z.object({ text: z.string().trim().min(1).max(500) });

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
  const { timeZone } = await getPrefs();
  const day = localMidnight(dayKey(new Date(), timeZone), timeZone);
  const record = day
    ? await recordContact(owner, id, day, body.data.text)
    : null;
  return record ? Response.json({ id: record.id }) : notFound();
};
