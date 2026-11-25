import { getChat } from "@metobe/core/chat";
import { createUIMessageStreamResponse } from "ai";
import { z } from "zod";

import { requireContext } from "@/lib/context";
import { resumeStream } from "@/lib/resume-stream";

// GET /api/chat/[id]/stream (D5): the answer being written in the chat, from its start and on as it comes — for a page
// reloaded in the middle of it. 204 when nothing is being written: the saved answer, if any, is on the page already.

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
  const chat = id.success ? await getChat(id.data) : null;
  if (!chat || chat.userId !== ctx.userId) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }
  const stream = resumeStream(chat.id);
  return stream
    ? createUIMessageStreamResponse({ stream })
    : new Response(null, { status: 204 });
};
