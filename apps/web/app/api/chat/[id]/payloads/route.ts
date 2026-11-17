import { getChat, getSharedChat, listModelPayloads } from "@metobe/core/chat";
import { headers } from "next/headers";
import { z } from "zod";

import { getAuth } from "@/lib/auth";

// GET /api/chat/[id]/payloads (PII-GUARD-PLAN З5): what the model saw for each message of the chat — message id →
// its record. Read by whoever may read the chat: its owner, or anyone signed in when the owner shared it with the team.

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
  // Someone else's chat is as missing as one that never was — unless it is shared with the team, as on its page.
  const readable =
    chat !== null &&
    (chat.userId === session.user.id ||
      (await getSharedChat(chat.id)) !== null);
  if (!(chat && readable)) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }
  return Response.json(await listModelPayloads(chat.id), {
    headers: { "cache-control": "no-store" },
  });
};
