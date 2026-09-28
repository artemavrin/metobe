import { getChat } from "@metobe/core/chat";
import { headers } from "next/headers";
import { z } from "zod";

import { getAuth } from "@/lib/auth";
import { stopGeneration } from "@/lib/generations";

// POST /api/chat/[id]/stop (D6): stops the answer being written in the chat; what it wrote by then stays.

export const POST = async (
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
  return Response.json({ stopped: stopGeneration(chat.id) });
};
