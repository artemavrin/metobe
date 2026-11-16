import type { MemorySearch } from "@metobe/contracts/memory";
import { searchMemory } from "@metobe/core/memory-page";

import { memoryOwner } from "@/lib/memory-route";

// GET /api/memory/search?q= (P16): cards by name and records by text, done and cancelled ones too — the page shows
// those under «Ещё N выполненных».

export const dynamic = "force-dynamic";

export const GET = async (request: Request) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const q = new URL(request.url).searchParams.get("q")?.slice(0, 200) ?? "";
  return Response.json((await searchMemory(owner, q)) satisfies MemorySearch);
};
