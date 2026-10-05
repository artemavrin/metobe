import "server-only";
import { headers } from "next/headers";

/** The address a request came from, as the proxy in front of the app says it; null when it does not say. */
export const clientIp = async () => {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || null;
};
