import { exportAccount } from "@metobe/core/account";

import { requireContext } from "@/lib/context";

// GET /api/account/export: everything of the signed-in user's to take away, as one JSON file — the profile, the
// chats with their messages, the names of their connections and mailboxes. No secret, nobody else's data.

export const GET = async () => {
  const ctx = await requireContext();
  if (ctx instanceof Response) {
    return ctx;
  }
  const day = new Date().toISOString().slice(0, 10);
  return new Response(
    JSON.stringify(await exportAccount(ctx.userId), null, 2),
    {
      headers: {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="metobe-export-${day}.json"`,
        "content-type": "application/json; charset=utf-8",
      },
    }
  );
};
