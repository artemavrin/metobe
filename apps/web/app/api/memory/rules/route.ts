import { memoryRuleSchema } from "@metobe/contracts/memory";
import type { MemoryNoteResult } from "@metobe/contracts/memory";
import { writeRule } from "@metobe/core/memory-page";

import { memoryOwner } from "@/lib/memory-route";
import { getPrefs } from "@/lib/prefs";

// POST /api/memory/rules (P22): a rule typed on the «Правила» page. It goes through the memory's queue like a note on a
// card, with the question «what standing rule should I remember?» before it; the answer says what came of it.

export const dynamic = "force-dynamic";
/** The rule waits for the queue up to 20 s (core/memory-page). */
export const maxDuration = 30;

export const POST = async (request: Request) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const body = memoryRuleSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!body.success) {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  const { timeZone } = await getPrefs();
  return Response.json(
    (await writeRule(
      owner,
      body.data.text,
      timeZone
    )) satisfies MemoryNoteResult
  );
};
