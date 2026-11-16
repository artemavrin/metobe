import type { MemoryOverview } from "@metobe/contracts/memory";
import { memoryOverview } from "@metobe/core/memory-page";
import { memoryStateFor } from "@metobe/core/memory-write";
import { headers } from "next/headers";

import { getAuth } from "@/lib/auth";

// GET /api/memory (ARCH §19, P16): the list on the left of the «Память» page — cards with their open and overdue
// commitments, «Не записано» and «Правила». Off says so, and the page says the memory is off.

export const dynamic = "force-dynamic";

export const GET = async () => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const state = await memoryStateFor(session.user.id);
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
    ...(await memoryOverview(session.user.id)),
    on: true,
  } satisfies MemoryOverview);
};
