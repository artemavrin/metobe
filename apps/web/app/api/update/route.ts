import { readUpdateRun } from "@metobe/core/updater-bus";

import { getSettingsViewer } from "@/lib/settings-access";

// GET /api/update: how the update goes (D35), for «О системе» to follow its steps. Admins only. A route, not a server
// action: the page asks every second or two, and keeps asking while the app restarts under it.

export const GET = async () => {
  const { admin } = await getSettingsViewer();
  if (!admin) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  return Response.json(
    { run: await readUpdateRun() },
    { headers: { "cache-control": "no-store" } }
  );
};
