import { getChat } from "@metobe/core/chat";
import { createUIMessageStreamResponse } from "ai";
import { headers } from "next/headers";
import { z } from "zod";

import { getAuth } from "@/lib/auth";
import { resumeStream } from "@/lib/resume-stream";

// GET /api/chat/[id]/stream (D5): the answer being written in the chat, from its start and on as it comes — for a page
// reloaded in the middle of it. 204 when nothing is being written: the saved answer, if any, is on the page already.

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
  const stream = resumeStream(chat.id);
  return stream
    ? createUIMessageStreamResponse({ stream })
    : new Response(null, { status: 204 });
};
