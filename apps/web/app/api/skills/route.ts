import { importSkill } from "@metobe/core/skills";

import { getSettingsViewer } from "@/lib/settings-access";

// POST /api/skills: a skill folder for the organization (ARCH §8.3), from the settings screen — a zip, or the files
// of a picked folder each with its path. A route, not a server action: a zip may be up to 10 MB, past an action's
// body limit. Admins only.

export const POST = async (request: Request) => {
  const { admin, user } = await getSettingsViewer();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!admin) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const form = await request.formData().catch(() => null);
  if (!form) {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  const replace = form.get("replace") === "1";
  const zip = form.get("zip");
  const entries = form.getAll("files").filter((f) => f instanceof File);
  let input: Parameters<typeof importSkill>[1];
  if (zip instanceof File) {
    input = { zip: new Uint8Array(await zip.arrayBuffer()) };
  } else if (entries.length > 0) {
    input = {
      files: await Promise.all(
        entries.map(async (file) => ({
          bytes: new Uint8Array(await file.arrayBuffer()),
          // The browser gives a folder's file its path as the name.
          path: file.name,
        }))
      ),
    };
  } else {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  const result = await importSkill({ admin, userId: user.id }, input, {
    replace,
    shared: true,
  });
  return Response.json(result, { status: result.ok ? 200 : 422 });
};
