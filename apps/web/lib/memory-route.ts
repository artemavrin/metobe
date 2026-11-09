import { isMemoryOn } from "@metobe/core/memory-write";
import { headers } from "next/headers";
import { z } from "zod";

import { getAuth } from "./auth";

// The «Память» page's routes (ARCH §19, P16) start the same way: a session, and the memory on — off, it is neither
// read nor changed (§19.1), what is kept waits.

export const memoryOwner = async () => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await isMemoryOn())) {
    return Response.json({ error: "memory-off" }, { status: 409 });
  }
  return session.user.id;
};

/** The id in the path, or null when it is not a uuid (then it is nobody's). */
export const pathId = async (params: Promise<{ id: string }>) => {
  const { id: given } = await params;
  const id = z.uuid().safeParse(given);
  return id.success ? id.data : null;
};

export const notFound = () =>
  Response.json({ error: "not-found" }, { status: 404 });
