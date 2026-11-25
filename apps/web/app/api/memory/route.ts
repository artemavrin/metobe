import type { MemoryOverview } from "@metobe/contracts/memory";
import { memoryOverview } from "@metobe/core/memory-page";
import { memoryStateFor } from "@metobe/core/memory-write";

import { requireContext } from "@/lib/context";

// GET /api/memory (ARCH §19, P16): the list on the left of the «Память» page — cards with their open and overdue
// commitments, «Не записано» and «Правила». Off says so, and the page says the memory is off.

export const dynamic = "force-dynamic";

export const GET = async () => {
  const ctx = await requireContext();
  if (ctx instanceof Response) {
    return ctx;
  }
  const state = await memoryStateFor(ctx.userId);
  if (!state.on) {
    return Response.json({
      cards: [],
      me: [],
      merges: [],
      off: state.service ? "person" : "service",
      on: false,
      questions: [],
      rules: [],
    } satisfies MemoryOverview);
  }
  return Response.json({
    ...(await memoryOverview(ctx.userId)),
    on: true,
  } satisfies MemoryOverview);
};
