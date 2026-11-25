import { isMemoryOnFor } from "@metobe/core/memory-write";
import { z } from "zod";

import { requireContext } from "./context";

// The «Память» page's routes (ARCH §19, P16) start the same way: a session, and the memory on — the service's and the
// person's own; off, it is neither read nor changed (§19.1), what is kept waits.

export const memoryOwner = async () => {
  const ctx = await requireContext();
  if (ctx instanceof Response) {
    return ctx;
  }
  if (!(await isMemoryOnFor(ctx.userId))) {
    return Response.json({ error: "memory-off" }, { status: 409 });
  }
  return ctx.userId;
};

/** The id in the path, or null when it is not a uuid (then it is nobody's). */
export const pathId = async (params: Promise<{ id: string }>) => {
  const { id: given } = await params;
  const id = z.uuid().safeParse(given);
  return id.success ? id.data : null;
};

export const notFound = () =>
  Response.json({ error: "not-found" }, { status: 404 });
