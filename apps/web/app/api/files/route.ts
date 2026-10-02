import { createFile } from "@metobe/core/files";
import { headers } from "next/headers";

import { getAuth } from "@/lib/auth";

// POST /api/files (D33): a file picked in the composer, stored at once — before its message goes. One file per
// request (the composer sends them in parallel, each with its own progress).

const STATUS = {
  failed: 502,
  "storage-off": 503,
  "too-big": 413,
  type: 415,
} as const;

export const POST = async (request: Request) => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  const result = await createFile(session.user.id, file);
  if ("error" in result) {
    return Response.json(
      { error: result.error },
      { status: STATUS[result.error] }
    );
  }
  return Response.json(result.file, { status: 201 });
};
