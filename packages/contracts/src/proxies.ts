import { z } from "zod";

// Proxies (ARCH §18). `socks5h` resolves names on the proxy — for networks that block DNS too.
export const proxyTypes = ["http", "https", "socks5", "socks5h"] as const;
export const proxyTypeSchema = z.enum(proxyTypes);
export type ProxyType = z.infer<typeof proxyTypeSchema>;

export const proxyHealthSchema = z.object({
  checkedAt: z.iso.datetime(),
  /** ISO country code of the exit address. */
  country: z.string().optional(),
  error: z.string().optional(),
  ip: z.string().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  state: z.enum(["ok", "error"]),
});
export type ProxyHealth = z.infer<typeof proxyHealthSchema>;

/** A bare domain: `openai.com` covers `api.openai.com`. No scheme, path, port or wildcard. */
export const proxyDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u,
    "domain"
  );
