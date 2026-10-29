import { isDraining } from "@metobe/core/updater-bus";
import { headers } from "next/headers";

import { getAuth } from "@/lib/auth";

export const GET = async () => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json(
    { draining: await isDraining() },
    { headers: { "cache-control": "no-store" } }
  );
};
