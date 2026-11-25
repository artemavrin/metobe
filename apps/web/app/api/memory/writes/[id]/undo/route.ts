import { undoWrite } from "@metobe/core/memory";
import { z } from "zod";

import { requireContext } from "@/lib/context";

// POST /api/memory/writes/[id]/undo (ARCH §19): «Запомнено · Отменить» — what one message put in goes, what it
// replaced or closed is as it was, its questions are dropped. The page waits a few seconds with «Вернуть» before it
// calls this, so taking it back needs nothing here.

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
  if (!(id.success && (await undoWrite(ctx.userId, id.data)))) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }
  return Response.json({ undone: true });
};
