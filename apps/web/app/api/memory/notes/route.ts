import { memoryNoteSchema } from "@metobe/contracts/memory";
import type { MemoryNoteResult } from "@metobe/contracts/memory";
import { writeFreeNote } from "@metobe/core/memory-page";

import { memoryOwner } from "@/lib/memory-route";
import { getPrefs } from "@/lib/prefs";

// POST /api/memory/notes (Д7.1): a note typed in the search (⌘K), about no card in particular. It goes through the
// memory's queue as any material — the writer picks what it is and where it lies; the answer says what came of it, if
// the queue got to it in time. «Отменить» is `POST /api/memory/writes/[writeId]/undo`.

export const dynamic = "force-dynamic";
/** The note waits for the queue up to 20 s (core/memory-page). */
export const maxDuration = 30;

export const POST = async (request: Request) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const body = memoryNoteSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!body.success) {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  const { timeZone } = await getPrefs();
  const result = await writeFreeNote(owner, body.data.text, timeZone);
  return Response.json(result satisfies MemoryNoteResult);
};
