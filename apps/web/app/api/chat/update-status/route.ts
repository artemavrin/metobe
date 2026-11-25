import { isDraining } from "@metobe/core/updater-bus";

import { requireContext } from "@/lib/context";

export const GET = async () => {
  const ctx = await requireContext();
  if (ctx instanceof Response) {
    return ctx;
  }
  return Response.json(
    { draining: await isDraining() },
    { headers: { "cache-control": "no-store" } }
  );
};
