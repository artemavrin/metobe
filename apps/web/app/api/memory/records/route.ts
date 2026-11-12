import { memoryPromiseCreateSchema } from "@metobe/contracts/memory";
import { createPromise } from "@metobe/core/memory-due";
import { headers } from "next/headers";

import { getAuth } from "@/lib/auth";
import { memoryOwner, notFound } from "@/lib/memory-route";

// POST /api/memory/records: a promise written by hand in the calendar («Новое обещание»). A promise of the person, or a
// card's to them; the deadline is set, the reminder is the person's to ask for. The edits are `PATCH …/[id]`.

export const dynamic = "force-dynamic";

export const POST = async (request: Request) => {
  const owner = await memoryOwner();
  if (owner instanceof Response) {
    return owner;
  }
  const body = memoryPromiseCreateSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!body.success) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const session = await getAuth().api.getSession({ headers: await headers() });
  const id = await createPromise(owner, session?.user.name ?? "", body.data);
  return id ? Response.json({ id }) : notFound();
};
