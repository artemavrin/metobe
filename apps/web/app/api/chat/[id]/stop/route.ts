import { getChat } from "@metobe/core/chat";
import { z } from "zod";

import { requireContext } from "@/lib/context";
import { stopGeneration } from "@/lib/generations";

// POST /api/chat/[id]/stop (D6): stops the answer being written in the chat; what it wrote by then stays.

export const POST = async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireContext();
  if (ctx instanceof Response) {
    return ctx;
  }
  const { id: given } = await params;
  const id = z.uuid().safeParse(given);
  const chat = id.success ? await getChat(id.data) : null;
  if (!chat || chat.userId !== ctx.userId) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }
  return Response.json({ stopped: stopGeneration(chat.id) });
};
