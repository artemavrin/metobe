import type { ChatMemory } from "@metobe/contracts/memory";
import { getChat } from "@metobe/core/chat";
import { chatMemory } from "@metobe/core/memory";
import { isMemoryOnFor } from "@metobe/core/memory-write";
import { z } from "zod";

import { requireContext } from "@/lib/context";

// GET /api/memory/chats/[id] (ARCH §19, P18): what the memory took from the person's own chat — «Запомнено» per
// message and the open questions — for under its answers. Off (no «Память» model) says so, and the chat shows nothing.

export const dynamic = "force-dynamic";

export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireContext();
  if (ctx instanceof Response) {
    return ctx;
  }
  const { id: given } = await params;
  const id = z.uuid().safeParse(given);
  if (!id.success) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }
  const on = await isMemoryOnFor(ctx.userId);
  const chat = await getChat(id.data);
  // A new chat asks before its first answer saves it: nothing yet, not an error. Someone else's reads the same.
  if (!(on && chat && chat.userId === ctx.userId)) {
    return Response.json({ notes: [], on, questions: [] } satisfies ChatMemory);
  }
  const memory = await chatMemory(ctx.userId, chat.id);
  return Response.json({
    notes: memory.notes,
    on: true,
    questions: memory.questions.map((q) => ({
      candidates: q.candidates,
      id: q.id,
      messageId: q.messageId,
      question: q.question,
      writeId: q.writeId,
    })),
  } satisfies ChatMemory);
};
