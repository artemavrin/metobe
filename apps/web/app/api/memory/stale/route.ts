import { memoryStale } from "@metobe/core/memory-due";

import { memoryOwner } from "@/lib/memory-route";
import { getPrefs } from "@/lib/prefs";

// GET /api/memory/stale (Д2, P20): «Сверка» — the commitments open a long time with nothing happening to them.

export const dynamic = "force-dynamic";

export const GET = async () => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const { timeZone } = await getPrefs();
  return Response.json({ rows: await memoryStale(owner, timeZone) });
};
