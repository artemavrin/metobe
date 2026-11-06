import { turnOffTaskMail } from "@metobe/core/task-mail";
import { z } from "zod";

// One-click unsubscribe (RFC 8058) from a task's letter: the mail client posts `List-Unsubscribe=One-Click` here, the
// link signed for the task. No session — the signature is the proof.
export const POST = async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const token = new URL(request.url).searchParams.get("t") ?? "";
  if (!z.uuid().safeParse(id).success) {
    return new Response(null, { status: 404 });
  }
  const ok = await turnOffTaskMail(id, token);
  return new Response(null, { status: ok ? 200 : 403 });
};
