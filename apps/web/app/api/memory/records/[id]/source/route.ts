import type { MemoryRecordSource } from "@metobe/contracts/memory";
import { recordSource } from "@metobe/core/memory-page";

import { memoryOwner, notFound, pathId } from "@/lib/memory-route";

// GET /api/memory/records/[id]/source (P16): «Откуда» — the chat and the words it came from — and the history:
// earlier texts, and status, deadline and «важно» as they changed.

export const dynamic = "force-dynamic";

export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const id = await pathId(params);
  const source = id ? await recordSource(owner, id) : null;
  return source
    ? Response.json(source satisfies MemoryRecordSource)
    : notFound();
};
