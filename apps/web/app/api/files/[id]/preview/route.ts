import { bytesOf } from "@metobe/core/attachment-text";
import { filePreview } from "@metobe/core/file-preview";
import { getReadableFile } from "@metobe/core/files";
import { z } from "zod";

import { requireContext } from "@/lib/context";

// GET /api/files/[id]/preview: a file as the viewer draws it (D47) — a sheet's tables, a document's HTML, a text —
// for whoever may read the file (GET /api/files/[id]). A PDF and a picture the viewer opens by the file's own URL.

export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const ctx = await requireContext();
  if (ctx instanceof Response) {
    return ctx;
  }
  const { id } = await params;
  const parsed = z.uuid().safeParse(id);
  const file = parsed.success
    ? await getReadableFile(ctx.userId, parsed.data)
    : null;
  if (!file) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }
  const bytes = await bytesOf(file);
  if (!bytes) {
    return Response.json({ error: "not-found" }, { status: 404 });
  }
  try {
    return Response.json(await filePreview(file, bytes), {
      headers: { "Cache-Control": "private, max-age=3600" },
    });
  } catch (error) {
    console.error("files: could not draw a preview", file.id, error);
    return Response.json({ error: "unreadable" }, { status: 422 });
  }
};
