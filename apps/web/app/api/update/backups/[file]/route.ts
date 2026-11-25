import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { requirePlatformRoute } from "@/lib/context";

const BACKUPS = "/backups";
const BACKUP_NAME = /^metobe-\d+\.\d+\.\d+-[\dTZ-]+\.dump$/u;

export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ file: string }> }
) => {
  // The dump holds every organization's data: the platform's staff only, and for anyone else the route is not there.
  const ctx = await requirePlatformRoute();
  if (ctx instanceof Response) {
    return ctx;
  }
  const { file } = await params;
  if (!BACKUP_NAME.test(file) || path.basename(file) !== file) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  const fullPath = path.join(BACKUPS, file);
  try {
    const info = await stat(fullPath);
    if (!info.isFile()) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    const stream = createReadStream(fullPath);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": `attachment; filename="${file}"`,
        "content-length": String(info.size),
        "content-type": "application/octet-stream",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    throw error;
  }
};
