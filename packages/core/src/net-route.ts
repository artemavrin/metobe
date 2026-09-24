// Route selection (ARCH §18.2), free of the network and the DB so it can be tested directly.
// Order: an explicit choice on the object → the most specific proxy domain covering the host → direct.

export type RouteMode = "auto" | "direct" | "proxy";

export interface Target {
  mode: RouteMode;
  proxyId?: string | null;
}

export type Route =
  | { kind: "direct"; why: "explicit" | "no-match" }
  | { kind: "proxy"; proxyId: string; why: "explicit" }
  | { kind: "proxy"; proxyId: string; why: "domain"; domain: string };

/** `openai.com` covers `openai.com` and `api.openai.com`, not `notopenai.com`. */
export const covers = (domain: string, host: string) =>
  host === domain || host.endsWith(`.${domain}`);

export const resolveRoute = (
  target: Target | null,
  host: string,
  domains: { domain: string; proxyId: string }[],
  enabledProxies: ReadonlySet<string>
): Route => {
  if (target?.mode === "direct") {
    return { kind: "direct", why: "explicit" };
  }
  if (
    target?.mode === "proxy" &&
    target.proxyId &&
    enabledProxies.has(target.proxyId)
  ) {
    return { kind: "proxy", proxyId: target.proxyId, why: "explicit" };
  }
  const normalized = host.toLowerCase().replace(/\.$/u, "");
  let best: { domain: string; proxyId: string } | undefined;
  for (const d of domains) {
    if (
      enabledProxies.has(d.proxyId) &&
      covers(d.domain, normalized) &&
      (!best || d.domain.length > best.domain.length)
    ) {
      best = d;
    }
  }
  return best
    ? {
        domain: best.domain,
        kind: "proxy",
        proxyId: best.proxyId,
        why: "domain",
      }
    : { kind: "direct", why: "no-match" };
};
