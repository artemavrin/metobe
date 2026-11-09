import type { ChatMemory } from "@metobe/contracts/memory";
import { getChat } from "@metobe/core/chat";
import { chatMemory } from "@metobe/core/memory";
import { isMemoryOnFor } from "@metobe/core/memory-write";
import { headers } from "next/headers";
import { z } from "zod";

import { getAuth } from "@/lib/auth";

// GET /api/memory/chats/[id] (ARCH §19, P18): what the memory took from the person's own chat — «Запомнено» per
// message and the open questions — for under its answers. Off (no «Память» model) says so, and the chat shows nothing.

export const dynamic = "force-dynamic";

export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id: given } = await params;
  const id = z.uuid().safeParse(given);
  const chat = id.success ? await getChat(id.data) : null;
  if (!chat || chat.userId !== session.user.id) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }
  if (!(await isMemoryOnFor(session.user.id))) {
    return Response.json({
      notes: [],
      on: false,
      questions: [],
    } satisfies ChatMemory);
  }
  const memory = await chatMemory(session.user.id, chat.id);
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
