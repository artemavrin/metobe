import "server-only";
import { UnauthorizedError, createMCPClient } from "@ai-sdk/mcp";
import type { MCPClient } from "@ai-sdk/mcp";
import type { CatalogHealth, CatalogTool } from "@metobe/contracts/catalog";
import {
  catalogAccess,
  catalogItems,
  connections,
} from "@metobe/db/schema/catalog";
import type { CatalogItem } from "@metobe/db/schema/catalog";
import type { ToolSet } from "ai";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";

import { onConfigChange } from "./config-bus";
import { getDb } from "./db";
import { StoredOAuth } from "./mcp-oauth";
import type { OAuthStart } from "./mcp-oauth";
import { fetchFor } from "./net";
import { withSecret } from "./secrets";
import type { Owner } from "./secrets";

// MCP servers of the catalog (ARCH §8): a client per server and owner of credentials, kept in memory (one `app`,
// D2) and dropped on `config:changed`. Requests go through core/net, so a server behind a proxy is reached like a
// source; redirects are refused (SSRF). Tools reach a chat prefixed with the item's key, narrowed by the
// allowlist, `deny` hidden, `ask` waiting for the user.

/** Whose credentials open a server for a user: the item's own (shared) or the user's connection (per user). */
export const ownerFor = async (
  item: CatalogItem,
  userId: string
): Promise<Owner | null> => {
  if (item.credentialMode === "shared") {
    return { id: item.id, type: "catalog_item" };
  }
  const { db } = getDb();
  const [connection] = await db
    .select({ id: connections.id })
    .from(connections)
    .where(
      and(eq(connections.catalogId, item.id), eq(connections.userId, userId))
    )
    .limit(1);
  return connection ? { id: connection.id, type: "connection" } : null;
};

const headersFor = async (item: CatalogItem, owner: Owner) => {
  const { auth, headerName, username } = item.config;
  if (auth === "none" || auth === "oauth") {
    return {};
  }
  const value = await withSecret(owner, "token", (v) => v);
  if (!value) {
    return {};
  }
  if (auth === "basic") {
    // A user's own connection keeps its login with the password; a shared server's login is in its config.
    const pair =
      owner.type === "connection" ? value : `${username ?? ""}:${value}`;
    return { authorization: `Basic ${Buffer.from(pair).toString("base64")}` };
  }
  return auth === "bearer"
    ? { authorization: `Bearer ${value}` }
    : { [headerName ?? "X-API-Key"]: value };
};

/**
 * Where a server's address moves to, when it answers with a redirect on its own host (`/mcp` → `/mcp/`): the
 * transport never follows redirects (SSRF), so the address itself is corrected. Another host — no answer.
 */
export const redirectTarget = async (item: CatalogItem) => {
  const fetch = await fetchFor(
    { mode: item.proxyMode, proxyId: item.proxyId },
    item.config.url
  );
  const response = await fetch(item.config.url, {
    body: "{}",
    headers: { "content-type": "application/json" },
    method: "POST",
    redirect: "manual",
  });
  const location = response.headers.get("location");
  if (response.status < 300 || response.status >= 400 || !location) {
    return null;
  }
  const target = new URL(location, item.config.url);
  return target.origin === new URL(item.config.url).origin
    ? target.toString()
    : null;
};

/** Opens a client to a server with an owner's credentials; for OAuth, `oauth` catches the sign-in page. */
export const openClient = async (
  item: CatalogItem,
  owner: Owner,
  oauth?: StoredOAuth
) =>
  createMCPClient({
    transport: {
      authProvider:
        item.config.auth === "oauth"
          ? (oauth ?? new StoredOAuth(owner))
          : undefined,
      fetch: await fetchFor(
        { mode: item.proxyMode, proxyId: item.proxyId },
        item.config.url
      ),
      headers: await headersFor(item, owner),
      redirect: "error",
      type: item.config.transport,
      url: item.config.url,
    },
  });

/** Closes a client and does not mind if it is gone already. */
const closeQuietly = async (
  client: MCPClient | Promise<MCPClient> | undefined
) => {
  try {
    const open = await client;
    await open?.close();
  } catch (error) {
    console.error("mcp: could not close a client", error);
  }
};

/** A refused token or header comes back as the transport's 401/403 — the same «wants credentials» as OAuth. */
export const isRefused = (error: unknown) =>
  error instanceof Error && /\(HTTP 40[13]\)/u.test(error.message);

/** What a check found: the server's tools, or that it wants a sign-in (its page, when OAuth), or why it failed. */
export interface ServerCheck {
  health: CatalogHealth;
  tools: CatalogTool[];
  authorizationUrl?: string;
}

/** Connects with an owner's credentials and lists the tools — the moment the admin (or a user) sees if it works. */
export const checkServer = async (
  item: CatalogItem,
  owner: Owner,
  start?: OAuthStart,
  { fresh = false }: { fresh?: boolean } = {}
): Promise<ServerCheck> => {
  const checkedAt = new Date().toISOString();
  const oauth =
    item.config.auth === "oauth"
      ? new StoredOAuth(owner, { fresh, start })
      : undefined;
  let client: MCPClient | undefined;
  try {
    client = await openClient(item, owner, oauth);
    const { tools } = await client.listTools();
    return {
      health: { checkedAt, state: "ok" },
      tools: tools.map((tool) => ({
        description: tool.description,
        destructive: tool.annotations?.destructiveHint,
        name: tool.name,
        readOnly: tool.annotations?.readOnlyHint,
        title: tool.title ?? tool.annotations?.title,
      })),
    };
  } catch (error) {
    if (
      error instanceof UnauthorizedError ||
      oauth?.authorizationUrl ||
      isRefused(error)
    ) {
      return {
        authorizationUrl: oauth?.authorizationUrl?.toString(),
        health: { checkedAt, state: "auth" },
        tools: [],
      };
    }
    return {
      health: {
        checkedAt,
        error: error instanceof Error ? error.message : String(error),
        state: "error",
      },
      tools: [],
    };
  } finally {
    await closeQuietly(client);
  }
};

const clients = new Map<string, Promise<MCPClient>>();
const clientKey = (item: CatalogItem, owner: Owner) =>
  `${item.id}:${owner.type}:${owner.id}`;

// A failed connection must not stick: the next chat tries again.
const forgetIfFails = async (key: string, client: Promise<MCPClient>) => {
  try {
    await client;
  } catch {
    clients.delete(key);
  }
};

const clientFor = (item: CatalogItem, owner: Owner) => {
  const key = clientKey(item, owner);
  let client = clients.get(key);
  if (!client) {
    client = openClient(item, owner);
    void forgetIfFails(key, client);
    clients.set(key, client);
  }
  return client;
};

const dropClients = (catalogId?: string) => {
  for (const [key, client] of clients) {
    if (!catalogId || key.startsWith(`${catalogId}:`)) {
      clients.delete(key);
      void closeQuietly(client);
    }
  }
};

// A catalog item changed (or everything did), here or in another process: its clients reconnect.
onConfigChange((change) => {
  if (!change.sourceId) {
    dropClients(change.catalogId);
  }
});

/** A server that wants the user to sign in again: marked, so the UI can say «переподключите». */
const markUnauthorized = async (owner: Owner, error: unknown) => {
  const { db } = getDb();
  const message = error instanceof Error ? error.message : String(error);
  await (owner.type === "connection"
    ? db
        .update(connections)
        .set({ lastError: message, status: "needs_reauth" })
        .where(eq(connections.id, owner.id))
    : db
        .update(catalogItems)
        .set({
          health: {
            checkedAt: new Date().toISOString(),
            error: message,
            state: "auth",
          },
        })
        .where(eq(catalogItems.id, owner.id)));
};

/**
 * A user's connection after a chat opened it: working — «used just now» (written at most once a minute) and active
 * again; refused — its token or password no longer fits, and the settings say so.
 */
const noteConnection = async (owner: Owner, error?: unknown) => {
  if (owner.type !== "connection") {
    return;
  }
  const { db } = getDb();
  if (error === undefined) {
    await db
      .update(connections)
      .set({ lastError: null, lastUsedAt: new Date(), status: "active" })
      .where(
        and(
          eq(connections.id, owner.id),
          sql`(${connections.status} <> 'active' or ${connections.lastUsedAt} is null or ${connections.lastUsedAt} < now() - interval '1 minute')`
        )
      );
    return;
  }
  await db
    .update(connections)
    .set({
      lastError: error instanceof Error ? error.message : String(error),
      status: "error",
    })
    .where(eq(connections.id, owner.id));
};

/** Servers a user may use: enabled, and open to everyone or to them. */
const usable = (userId: string) =>
  and(
    eq(catalogItems.enabled, true),
    or(
      eq(catalogItems.access, "all"),
      sql`exists (select 1 from ${catalogAccess} where ${catalogAccess.catalogId} = ${catalogItems.id} and ${catalogAccess.userId} = ${userId})`
    )
  );

/**
 * The servers a user can mention in a chat, by name: with their picture and tool count, and who must sign in first
 * — the user (a per-user server without their working connection) or the admin (a shared one that lost its own).
 */
export const listChatServers = async (userId: string) => {
  const { db } = getDb();
  const rows = await db
    .select({
      config: catalogItems.config,
      connection: connections.status,
      credentialMode: catalogItems.credentialMode,
      health: catalogItems.health,
      id: catalogItems.id,
      key: catalogItems.key,
      logo: catalogItems.logo,
      title: catalogItems.title,
      tools: catalogItems.tools,
    })
    .from(catalogItems)
    .leftJoin(
      connections,
      and(
        eq(connections.catalogId, catalogItems.id),
        eq(connections.userId, userId)
      )
    )
    .where(usable(userId))
    .orderBy(asc(catalogItems.title));
  return rows.map((r) => {
    let signIn: "ready" | "self" | "admin" = "ready";
    if (r.credentialMode === "per_user" && r.connection !== "active") {
      signIn = "self";
    } else if (r.credentialMode === "shared" && r.health?.state === "auth") {
      signIn = "admin";
    }
    return {
      auth: r.config.auth,
      headerName: r.config.headerName,
      id: r.id,
      /** Its tools' prefix in a chat (`<key>_<tool>`). */
      key: r.key,
      logo: r.logo,
      /** `self` — the user signs in with their own credentials (from the chat); `admin` — only the admin can. */
      signIn,
      title: r.title,
      toolCount: r.tools.length,
    };
  });
};
export type ChatServer = Awaited<ReturnType<typeof listChatServers>>[number];

/**
 * «Мои подключения»: the servers a user may use — the per-user ones with their own connection (or none yet), the
 * shared ones with the admin's account — by title.
 */
export const listMyConnections = async (userId: string) => {
  const { db } = getDb();
  const rows = await db
    .select({
      config: catalogItems.config,
      connection: {
        createdAt: connections.createdAt,
        lastError: connections.lastError,
        lastUsedAt: connections.lastUsedAt,
        status: connections.status,
      },
      credentialMode: catalogItems.credentialMode,
      health: catalogItems.health,
      id: catalogItems.id,
      logo: catalogItems.logo,
      title: catalogItems.title,
      tools: catalogItems.tools,
    })
    .from(catalogItems)
    .leftJoin(
      connections,
      and(
        eq(connections.catalogId, catalogItems.id),
        eq(connections.userId, userId)
      )
    )
    .where(usable(userId))
    .orderBy(asc(catalogItems.title));
  return rows.map((r) => ({
    auth: r.config.auth,
    // A left join gives a row of nulls when the user has not connected.
    connection:
      r.credentialMode === "per_user" && r.connection?.status
        ? {
            createdAt: r.connection.createdAt,
            lastError: r.connection.lastError,
            lastUsedAt: r.connection.lastUsedAt,
            status: r.connection.status,
          }
        : null,
    headerName: r.config.headerName,
    health: r.health,
    id: r.id,
    logo: r.logo,
    mode: r.credentialMode,
    title: r.title,
    toolCount: r.tools.length,
  }));
};
export type MyServer = Awaited<ReturnType<typeof listMyConnections>>[number];

/** A server's tools for a chat, as `<key>_<name>`, with what names the server to the model. */
export interface ServerTools {
  key: string;
  title: string;
  tools: ToolSet;
}

/**
 * The MCP tools a user's chat gets, server by server: the servers the chat mentions that the user may use and can
 * open, each tool as `<key>_<name>`. The allowlist narrows, `deny` hides, `ask` needs the user's yes. A server that
 * fails is left out of this answer, not the chat.
 */
export const toolsForUser = async (
  userId: string,
  catalogIds: string[]
): Promise<ServerTools[]> => {
  if (catalogIds.length === 0) {
    return [];
  }
  const { db } = getDb();
  const items = await db
    .select()
    .from(catalogItems)
    .where(and(inArray(catalogItems.id, catalogIds), usable(userId)));
  const sets = await Promise.all(
    items.map(async (item): Promise<ServerTools | null> => {
      const owner = await ownerFor(item, userId);
      if (!owner) {
        return null;
      }
      try {
        const client = await clientFor(item, owner);
        const tools = await client.tools();
        const allowed = item.allowedTools ? new Set(item.allowedTools) : null;
        const set: ToolSet = {};
        for (const [name, tool] of Object.entries(tools)) {
          const approval = item.approvalPolicy[name] ?? "auto";
          if (approval === "deny" || (allowed && !allowed.has(name))) {
            continue;
          }
          // The server's tool as it is, with our answer to «ask first?» (a Tool of the same shape).
          set[`${item.key}_${name}`] = {
            ...tool,
            needsApproval: approval === "ask",
          } as ToolSet[string];
        }
        await noteConnection(owner).catch((noteError: unknown) =>
          console.error("mcp: could not note a use", item.key, noteError)
        );
        return { key: item.key, title: item.title, tools: set };
      } catch (error) {
        console.error("mcp: a server is left out", item.key, error);
        if (error instanceof UnauthorizedError) {
          await markUnauthorized(owner, error).catch((markError: unknown) =>
            console.error("mcp: could not mark a sign-in", item.key, markError)
          );
        } else if (isRefused(error)) {
          await noteConnection(owner, error).catch((noteError: unknown) =>
            console.error("mcp: could not note a refusal", item.key, noteError)
          );
        }
        return null;
      }
    })
  );
  return sets.filter((s) => s !== null);
};
