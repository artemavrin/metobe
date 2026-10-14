import { importSkill } from "@metobe/core/skills";

import { getSettingsViewer } from "@/lib/settings-access";

// POST /api/skills: a skill folder (ARCH §8.3) from the settings — a zip, or the files of a picked folder each with
// its path; `scope=shared` — the organization's (admins only), else the user's own. A route, not a server action: a
// zip may be up to 10 MB, past an action's body limit.

export const POST = async (request: Request) => {
  const { admin, user } = await getSettingsViewer();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const form = await request.formData().catch(() => null);
  if (!form) {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  const shared = form.get("scope") === "shared";
  if (shared && !admin) {
    return Response.json({ error: "forbidden" }, { status: 403 });
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
    shared,
  });
  return Response.json(result, { status: result.ok ? 200 : 422 });
};
