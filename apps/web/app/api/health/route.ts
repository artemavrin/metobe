import { checkHealth } from "@metobe/core/health";

export const GET = async () => {
  const health = await checkHealth();
  return Response.json(health, { status: health.status === "ok" ? 200 : 503 });
};
