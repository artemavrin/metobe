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

/** A new source as the admin types it; the title falls back to the kind's name, a key is optional only for
 * OpenAI-compatible servers (Ollama needs none). Messages are «validation» keys (D31). */
export const sourceInputSchema = z
  .object({
    apiKey: z.string().trim().max(4096).optional(),
    baseUrl: z
      .string()
      .trim()
      .regex(/^https?:\/\/\S+$/u, "baseUrl")
      .optional(),
    kind: sourceKindSchema,
    options: sourceOptionsSchema,
    title: z.string().trim().max(100).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.options.kind !== input.kind) {
      ctx.addIssue({ code: "custom", message: "options", path: ["options"] });
    }
    if (input.kind === "openai-compatible" && !input.baseUrl) {
      ctx.addIssue({ code: "custom", message: "baseUrl", path: ["baseUrl"] });
    }
    if (input.kind !== "openai-compatible" && !input.apiKey) {
      ctx.addIssue({ code: "custom", message: "apiKey", path: ["apiKey"] });
    }
  });
export type SourceInput = z.infer<typeof sourceInputSchema>;

/**
 * Why a check failed, as a code the UI turns into «what happened + why + what to do» (ARCH UX §4):
 * `auth` — 401/403, the key; `not-found` — 404, the address; `unreachable` — no answer, a dropped connection or a
 * body that stops mid-way (DPI); `http` — any other status; `invalid` — an answer that is not a model list.
 */
export const sourceFailures = [
  "auth",
  "not-found",
  "unreachable",
  "http",
  "invalid",
] as const;
export type SourceFailure = (typeof sourceFailures)[number];

/** The last real check of a source: a request, not a key-format check (ARCH §7). */
export const sourceHealthSchema = z.object({
  checkedAt: z.iso.datetime(),
  error: z.string().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  /** Set when `state` is `error`. */
  reason: z.enum(sourceFailures).optional(),
  state: z.enum(["ok", "error"]),
  /** The HTTP status behind `auth` / `not-found` / `http`. */
  status: z.number().int().optional(),
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

/** A price as typed: a plain decimal, no exponent, so it round-trips exactly through Postgres numeric. */
export const decimalSchema = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d+)?$/u, "decimal");

/** Model prices per `unitTokens` tokens (any positive count), in one currency. Every price is optional. */
export const pricingSchema = z.object({
  cacheRead: decimalSchema.nullable(),
  cacheWrite: decimalSchema.nullable(),
  currency: z.enum(currencies),
  input: decimalSchema.nullable(),
  output: decimalSchema.nullable(),
  unitTokens: z.number().int().positive(),
});
export type Pricing = z.infer<typeof pricingSchema>;

export const runStatuses = ["ok", "error", "aborted"] as const;
export type RunStatus = (typeof runStatuses)[number];

/** Service jobs an admin gives a model to (ARCH §7): outside the chat, a model need not be in the chat to do one. */
export const modelSlots = ["titles"] as const;
export type ModelSlot = (typeof modelSlots)[number];

/** What a run was for: a chat's answer, or a service job. */
export const runPurposes = ["chat", "title"] as const;
export type RunPurpose = (typeof runPurposes)[number];
