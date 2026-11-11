import { memoryDue } from "@metobe/core/memory-due";

import { memoryOwner } from "@/lib/memory-route";
import { getPrefs } from "@/lib/prefs";

// GET /api/memory/due (Д6, P27): the open commitments by day — past their day, the next two weeks, those with no day.

export const dynamic = "force-dynamic";

export const GET = async () => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const { timeZone } = await getPrefs();
  return Response.json(await memoryDue(owner, timeZone));
};
