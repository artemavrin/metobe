import { previewDraft } from "@metobe/core/ai";
import { getChat, getChatModel } from "@metobe/core/chat";
import { z } from "zod";

import { requireContext } from "@/lib/context";

// POST /api/chat/[id]/preview (P31, PII-GUARD-PLAN З7): the draft in the composer as the chosen model
// would get it — masked in the chat's data protection session without keeping anything, as it is for a
// local model, or nothing when the protection is off or down.

const bodySchema = z.object({
  modelId: z.string().min(1),
  text: z.string().max(20_000),
});

export const POST = async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireContext();
  if (ctx instanceof Response) {
    return ctx;
  }
  const { id: given } = await params;
  const id = z.uuid().safeParse(given);
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!(id.success && body.success)) {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  // A new chat has no row yet: its id is the session all the same.
  const chat = await getChat(id.data);
  if (chat && chat.userId !== ctx.userId) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }
  const model = await getChatModel(body.data.modelId);
  if (!model) {
    return Response.json({ error: "model-unavailable" }, { status: 422 });
  }
  if (!body.data.text.trim()) {
    return Response.json({ labels: [], state: "masked", text: "" });
  }
  return Response.json(
    await previewDraft(model.sourceId, id.data, body.data.text)
  );
};
