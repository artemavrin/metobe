import { deleteDraftFile, getFile, readFile } from "@metobe/core/files";
import { headers } from "next/headers";
import { z } from "zod";

import { getAuth } from "@/lib/auth";

// GET /api/files/[id]: a file of the user, streamed from S3 — a picture or a PDF opens in the browser, anything else
// downloads under its own name. DELETE: a file taken back from the composer before its message went.

const user = async () => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
};

const idOf = async (params: Promise<{ id: string }>) => {
  const { id } = await params;
  const parsed = z.uuid().safeParse(id);
  return parsed.success ? parsed.data : null;
};

const INLINE = /^(?:image\/|application\/pdf$|text\/plain$)/u;

export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const userId = await user();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const id = await idOf(params);
  const file = id ? await getFile(userId, id) : null;
  if (!file) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }
  const object = await readFile(file.storageKey).catch(() => null);
  if (!object) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }
  const disposition = INLINE.test(file.mediaType) ? "inline" : "attachment";
  return new Response(object.body, {
    headers: {
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      ...(object.contentLength === undefined
        ? {}
        : { "Content-Length": String(object.contentLength) }),
      // Served from our own origin: a file must never run as a page.
      "Content-Security-Policy":
        "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Content-Type": file.mediaType,
      "X-Content-Type-Options": "nosniff",
    },
  });
};

export const DELETE = async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const userId = await user();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const id = await idOf(params);
  const deleted = id ? await deleteDraftFile(userId, id) : false;
  return deleted
    ? new Response(null, { status: 204 })
    : Response.json({ error: "not-found" }, { status: 404 });
};
