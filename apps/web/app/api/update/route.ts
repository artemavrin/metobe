import { readUpdateRun } from "@metobe/core/updater-bus";

import { requirePlatformRoute } from "@/lib/context";

// GET /api/update: how the update goes (D35), for «О системе» to follow its steps. The platform's staff only (404 for anyone else). A route, not a server
// action: the page asks every second or two, and keeps asking while the app restarts under it.

export const GET = async () => {
  const ctx = await requirePlatformRoute();
  if (ctx instanceof Response) {
    return ctx;
  }
  return Response.json(
    { run: await readUpdateRun() },
    { headers: { "cache-control": "no-store" } }
  );
};
