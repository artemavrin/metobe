import { memoryAnswerSchema } from "@metobe/contracts/memory";
import { answerQuestion } from "@metobe/core/memory";
import { z } from "zod";

import { requireContext } from "@/lib/context";

// POST /api/memory/questions/[id] (P18): the person's answer — a card of the question's, a new card, or «Не
// запоминать». 404 when there is no such open question of theirs (answered in another tab already).

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
  const answer = memoryAnswerSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!(id.success && answer.success)) {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  try {
    const records = await answerQuestion(ctx.userId, id.data, answer.data);
    if (!records) {
      return Response.json({ error: "not-found" }, { status: 404 });
    }
    return Response.json({
      records: records.map((r) => ({ id: r.id, text: r.text })),
    });
  } catch (error) {
    // A card that is not one of the question's.
    console.error("memory: could not answer a question", error);
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
};
