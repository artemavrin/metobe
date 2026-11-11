import type { MemoryRecordView } from "@metobe/contracts/memory";
import { recordsByIds } from "@metobe/core/memory-page";
import { z } from "zod";

import { memoryOwner } from "@/lib/memory-route";

// POST /api/memory/records/lookup: records by id as they are now — a list in an answer in the chat is read again when
// the chat opens, so what was closed since shows closed and what was deleted is gone. Other people's ids are not there.

export const dynamic = "force-dynamic";

const MAX_IDS = 50;

const bodySchema = z.object({ ids: z.array(z.uuid()).max(MAX_IDS) });

export const POST = async (request: Request) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const records = await recordsByIds(owner, body.data.ids);
  return Response.json({ records } satisfies { records: MemoryRecordView[] });
};
