import { z } from "zod";

// The admin's catalog (ARCH §5.4, §8, §17): what a chat connects to. v1 starts with MCP over HTTP; connectors
// (email, http_api) join the same table later. A server is either shared — the admin sets its auth, everyone uses
// it — or per user: each user connects with their own credentials (a row in `connections`).

export const catalogTypes = ["mcp"] as const;
export type CatalogType = (typeof catalogTypes)[number];

export const mcpTransports = ["http", "sse"] as const;
export type McpTransport = (typeof mcpTransports)[number];

/**
 * How a server authenticates: nothing, a Bearer token, a header of the admin's choice, a login and password (HTTP
 * Basic), or OAuth 2.1 with PKCE.
 */
export const mcpAuthKinds = [
  "none",
  "bearer",
  "header",
  "basic",
  "oauth",
] as const;
export type McpAuthKind = (typeof mcpAuthKinds)[number];

export const credentialModes = ["shared", "per_user"] as const;
export type CredentialMode = (typeof credentialModes)[number];

/** Who gets a server's tools in chat: everyone, or only the users picked for it (`catalog_access`). */
export const catalogAccessModes = ["all", "selected"] as const;
export type CatalogAccessMode = (typeof catalogAccessModes)[number];

/** A server's picture: a small image as a data URL, resized in the browser (there is no file storage yet). */
export const catalogLogoSchema = z
  .string()
  .max(120_000)
  .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/u);

/** Per tool: call freely, ask the user first, or hide it from the model. */
export const toolApprovals = ["auto", "ask", "deny"] as const;
export type ToolApproval = (typeof toolApprovals)[number];

/** The prefix of a server's tools (`github_search_issues`): short, lowercase, safe in a tool name. */
export const catalogKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{1,23}$/u, "key");

export const mcpConfigSchema = z.object({
  auth: z.enum(mcpAuthKinds),
  /** For `header` auth: the header's name, e.g. `X-API-Key`. */
  headerName: z
    .string()
    .regex(/^[A-Za-z0-9-]{1,64}$/u)
    .optional(),
  /** For `oauth`: scopes to ask for, space-separated; none — what the server offers. */
  scope: z.string().max(500).optional(),
  transport: z.enum(mcpTransports),
  url: z.url({ protocol: /^https?$/u }),
  /** For `basic`: the login (not a secret); the password is one. */
  username: z.string().max(200).optional(),
});
export type McpConfig = z.infer<typeof mcpConfigSchema>;

export const approvalPolicySchema = z.record(z.string(), z.enum(toolApprovals));
export type ApprovalPolicy = z.infer<typeof approvalPolicySchema>;

/** A tool as the server described it at the last check. Annotations come from the server and are not trusted. */
export const catalogToolSchema = z.object({
  description: z.string().optional(),
  destructive: z.boolean().optional(),
  name: z.string(),
  readOnly: z.boolean().optional(),
  title: z.string().optional(),
});
export type CatalogTool = z.infer<typeof catalogToolSchema>;

export const catalogHealthSchema = z.object({
  checkedAt: z.iso.datetime(),
  error: z.string().optional(),
  /** `auth` — the server wants credentials (OAuth not done yet, a token refused). */
  state: z.enum(["ok", "auth", "error"]),
});
export type CatalogHealth = z.infer<typeof catalogHealthSchema>;

export const connectionStatuses = ["active", "needs_reauth", "error"] as const;
export type ConnectionStatus = (typeof connectionStatuses)[number];

/** Whose credentials a secret or an OAuth flow belongs to: a shared catalog item, or one user's connection. */
export const credentialOwnerTypes = ["catalog_item", "connection"] as const;
export type CredentialOwnerType = (typeof credentialOwnerTypes)[number];
