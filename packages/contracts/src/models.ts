import { z } from "zod";

// Sources (who gives access) and models (D29, ARCH §5.2): shapes shared by forms and the server.

export const sourceKinds = [
  "openai",
  "anthropic",
  "openai-compatible",
  "yandex",
  "gateway",
] as const;
export const sourceKindSchema = z.enum(sourceKinds);
export type SourceKind = z.infer<typeof sourceKindSchema>;

/** Kind-specific settings kept in `sources.options`. The key itself lives in `secrets`, never here. */
export const sourceOptionsSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("openai") }),
  z.object({ kind: z.literal("anthropic") }),
  z.object({ kind: z.literal("gateway") }),
  z.object({ kind: z.literal("openai-compatible") }),
  // A folder id from the Yandex Cloud console; model URIs are gpt://<folderId>/<model>/latest (S3).
  z.object({
    folderId: z.string().regex(/^b1g[a-z0-9]{17}$/u, "folderId"),
    kind: z.literal("yandex"),
  }),
]);
export type SourceOptions = z.infer<typeof sourceOptionsSchema>;

export const proxyModes = ["auto", "direct", "proxy"] as const;
export type ProxyMode = (typeof proxyModes)[number];

/** The last real check of a source: a request, not a key-format check (ARCH §7). */
export const sourceHealthSchema = z.object({
  checkedAt: z.iso.datetime(),
  error: z.string().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  state: z.enum(["ok", "error"]),
});
export type SourceHealth = z.infer<typeof sourceHealthSchema>;

/** `null` — the source did not say; `false` — it certainly cannot (ARCH §7.3). */
export const capabilitiesSchema = z.object({
  reasoning: z.boolean().nullable(),
  structured: z.boolean().nullable(),
  tools: z.boolean().nullable(),
  vision: z.boolean().nullable(),
});
export type Capabilities = z.infer<typeof capabilitiesSchema>;
export const unknownCapabilities: Capabilities = {
  reasoning: null,
  structured: null,
  tools: null,
  vision: null,
};

export const capabilitySources = ["discovered", "seed", "manual"] as const;
export type CapabilitySource = (typeof capabilitySources)[number];

export const currencies = ["USD", "RUB"] as const;
export type Currency = (typeof currencies)[number];

export const runStatuses = ["ok", "error", "aborted"] as const;
export type RunStatus = (typeof runStatuses)[number];
