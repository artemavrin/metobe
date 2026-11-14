import { listMailboxes, setMailboxMemory } from "@metobe/core/mailboxes";
import { dismissMailOffer } from "@metobe/core/memory";
import { z } from "zod";

import { memoryOwner } from "@/lib/memory-route";

// POST /api/memory/mail/offer (Г3.1, P24 «Предложение»): the answer to «Замечать письма без ответа?» in «Не упустить».
// `{ on: true }` — the memory reads every box of the person's (each one can be turned off on its page); `{ on: false }`
// — «Не надо», and it is not offered again.

const bodySchema = z.object({ on: z.boolean() });

export const POST = async (request: Request) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  if (!body.data.on) {
    await dismissMailOffer(owner);
    return Response.json({ boxes: [] });
  }
  const boxes = await listMailboxes(owner);
  await Promise.all(boxes.map((b) => setMailboxMemory(owner, b.id, true)));
  return Response.json({ boxes: boxes.map((b) => b.address) });
};
