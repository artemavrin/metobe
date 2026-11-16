import { undoWrite } from "@metobe/core/memory";
import { headers } from "next/headers";
import { z } from "zod";

import { getAuth } from "@/lib/auth";

// POST /api/memory/writes/[id]/undo (ARCH §19): «Запомнено · Отменить» — what one message put in goes, what it
// replaced or closed is as it was, its questions are dropped. The page waits a few seconds with «Вернуть» before it
// calls this, so taking it back needs nothing here.

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
  if (!(id.success && (await undoWrite(session.user.id, id.data)))) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }
  return Response.json({ undone: true });
};
