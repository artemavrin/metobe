import type { MyServer } from "@metobe/core/mcp";

// «Мои подключения»: where a server stands for a user — their own connection to a per-user server, or the
// organization's account of a shared one — the one answer the sidebar list and the server's page both show.

export type Standing =
  | "active"
  | "needs_reauth"
  | "error"
  | "none"
  | "org"
  | "admin";

export const standingOf = (
  s: Pick<MyServer, "mode" | "health" | "connection">
): Standing => {
  if (s.mode === "shared") {
    // The organization's account: working, refused (only the admin can fix it) or the server fails.
    if (s.health?.state === "auth") {
      return "admin";
    }
    return s.health?.state === "error" ? "error" : "org";
  }
  const c = s.connection;
  // A sign-in started and left: the connection exists but never worked — not connected yet, not «again».
  if (!c || (c.status === "needs_reauth" && !c.lastError && !c.lastUsedAt)) {
    return "none";
  }
  return c.status;
};

/** The sidebar list's dot for a standing. */
export const standingDot = (standing: Standing) =>
  (
    ({
      active: "ok",
      admin: "off",
      error: "error",
      needs_reauth: "warning",
      none: "off",
      org: "ok",
    }) as const
  )[standing];
