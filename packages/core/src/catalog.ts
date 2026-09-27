import "server-only";
import { auth } from "@ai-sdk/mcp";
import type {
  ApprovalPolicy,
  CatalogAccessMode,
  CredentialMode,
  McpConfig,
} from "@metobe/contracts/catalog";
import type { ProxyMode } from "@metobe/contracts/models";
import {
  catalogAccess,
  catalogItems,
  connections,
  oauthFlows,
} from "@metobe/db/schema/catalog";
import type { CatalogItem } from "@metobe/db/schema/catalog";
import { and, asc, eq, lt, sql } from "drizzle-orm";

import { configChanged } from "./config-bus";
import { getDb } from "./db";
import { checkServer, ownerFor, redirectTarget } from "./mcp";
import { StoredOAuth } from "./mcp-oauth";
import { fetchFor } from "./net";
import {
  listSecretHints,
  removeSecret,
  removeSecrets,
  setSecret,
} from "./secrets";
import type { Owner } from "./secrets";

export type { CatalogItem } from "@metobe/db/schema/catalog";

// The admin's MCP catalog (ARCH §5.4, §8): a server is added by URL and auth, checked at once — its tools listed
// on the spot — then narrowed (allowlist) and given a policy per tool. A per-user server is checked with the
// admin's own connection, when there is one. Every change goes out as `config:changed`.

export const listCatalog = () => {
  const { db } = getDb();
  return db.select().from(catalogItems).orderBy(asc(catalogItems.title));
};

export const getCatalogItem = async (id: string) => {
  const { db } = getDb();
  const [item] = await db
    .select()
    .from(catalogItems)
    .where(eq(catalogItems.id, id))
    .limit(1);
  return item ?? null;
};

export const createCatalogItem = async (input: {
  key: string;
  title: string;
  config: McpConfig;
  credentialMode: CredentialMode;
  logo?: string | null;
}) => {
  const { db } = getDb();
  const [item] = await db.insert(catalogItems).values(input).returning();
  if (!item) {
    throw new Error("the catalog item was not created");
  }
  await configChanged({ catalogId: item.id });
  return item;
};

export const updateCatalogItem = async (
  id: string,
  patch: Partial<{
    title: string;
    logo: string | null;
    config: McpConfig;
    credentialMode: CredentialMode;
    enabled: boolean;
    allowedTools: string[] | null;
    approvalPolicy: ApprovalPolicy;
    proxyMode: ProxyMode;
    proxyId: string | null;
  }>
) => {
  const { db } = getDb();
  await db.update(catalogItems).set(patch).where(eq(catalogItems.id, id));
  await configChanged({ catalogId: id });
};

export const deleteCatalogItem = async (id: string) => {
  const { db } = getDb();
  const users = await db
    .select({ id: connections.id })
    .from(connections)
    .where(eq(connections.catalogId, id));
  await db.delete(catalogItems).where(eq(catalogItems.id, id));
  await removeSecrets({ id, type: "catalog_item" });
  await Promise.all(
    users.map((c) => removeSecrets({ id: c.id, type: "connection" }))
  );
  await configChanged({ catalogId: id });
};

/** The users picked for a server whose access is `selected`. */
export const listCatalogAccess = async (id: string) => {
  const { db } = getDb();
  const rows = await db
    .select({ userId: catalogAccess.userId })
    .from(catalogAccess)
    .where(eq(catalogAccess.catalogId, id));
  return rows.map((r) => r.userId);
};

/** Who gets a server's tools: everyone, or the users picked (the list is kept as given). */
export const setCatalogAccess = async (
  id: string,
  access: CatalogAccessMode,
  userIds: string[]
) => {
  const { db } = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(catalogItems)
      .set({ access })
      .where(eq(catalogItems.id, id));
    await tx.delete(catalogAccess).where(eq(catalogAccess.catalogId, id));
    const unique = [...new Set(userIds)];
    if (unique.length > 0) {
      await tx
        .insert(catalogAccess)
        .values(unique.map((userId) => ({ catalogId: id, userId })));
    }
  });
  await configChanged({ catalogId: id });
};

/** The owner whose credentials are set or checked by `userId` for this item: shared, or their own connection. */
const credentialOwner = async (
  item: CatalogItem,
  userId: string,
  { create = false } = {}
): Promise<Owner | null> => {
  const owner = await ownerFor(item, userId);
  if (owner || !create) {
    return owner;
  }
  const { db } = getDb();
  const [connection] = await db
    .insert(connections)
    .values({ catalogId: item.id, userId })
    .onConflictDoNothing()
    .returning({ id: connections.id });
  return connection
    ? { id: connection.id, type: "connection" }
    : ownerFor(item, userId);
};

/**
 * A token (Bearer), a header's value or a password — shared by the admin, or a user's own for a per-user server. A
 * user's own login and password are kept together (each user has their login); a shared login lives in the config.
 */
export const setCatalogToken = async (
  item: CatalogItem,
  userId: string,
  value: string,
  username?: string
) => {
  const owner = await credentialOwner(item, userId, { create: true });
  if (!owner) {
    throw new Error("no owner for the credentials");
  }
  const secret =
    item.config.auth === "basic" && owner.type === "connection"
      ? `${username ?? item.config.username ?? ""}:${value}`
      : value;
  await setSecret(owner, "token", secret);
  await configChanged({ catalogId: item.id });
};

export const catalogSecretHint = async (item: CatalogItem, userId: string) => {
  const owner = await ownerFor(item, userId);
  if (!owner) {
    return null;
  }
  const hints = await listSecretHints(owner);
  return hints.find((h) => h.purpose === "token")?.hint ?? null;
};

/**
 * Connects and lists the tools, keeping what it found on the item. For OAuth without tokens yet, the answer
 * carries the provider's sign-in page: the UI opens it, the callback finishes the sign-in (`finishOAuth`).
 */
export const checkCatalogItem = async (
  item: CatalogItem,
  userId: string,
  returnTo: string
) => {
  const owner = await credentialOwner(item, userId, {
    create: item.config.auth === "oauth",
  });
  if (!owner) {
    return {
      health: { checkedAt: new Date().toISOString(), state: "auth" as const },
      tools: item.tools,
    };
  }
  let result = await checkServer(item, owner, { returnTo, userId });
  // An address that moves on its own host (`/mcp` → `/mcp/`) is corrected once, then checked again.
  if (result.health.state === "error") {
    const moved = await redirectTarget(item).catch(() => null);
    if (moved && moved !== item.config.url) {
      const config = { ...item.config, url: moved };
      await updateCatalogItem(item.id, { config });
      result = await checkServer({ ...item, config }, owner, {
        returnTo,
        userId,
      });
    }
  }
  const { db } = getDb();
  await db
    .update(catalogItems)
    .set({
      health: result.health,
      ...(result.health.state === "ok" ? { tools: result.tools } : {}),
    })
    .where(eq(catalogItems.id, item.id));
  if (owner.type === "connection") {
    await db
      .update(connections)
      .set(
        result.health.state === "ok"
          ? { lastError: null, status: "active" }
          : {
              lastError: result.health.error ?? null,
              status: result.health.state === "auth" ? "needs_reauth" : "error",
            }
      )
      .where(eq(connections.id, owner.id));
  }
  await configChanged({ catalogId: item.id });
  return result;
};

/** The catalog item a flow signs in to: its own row, or the item of the connection it signs in for. */
const catalogIdOfFlow = async (flow: {
  ownerType: "catalog_item" | "connection";
  ownerId: string;
}) => {
  if (flow.ownerType === "catalog_item") {
    return flow.ownerId;
  }
  const { db } = getDb();
  const [connection] = await db
    .select({ catalogId: connections.catalogId })
    .from(connections)
    .where(eq(connections.id, flow.ownerId))
    .limit(1);
  return connection?.catalogId;
};

/**
 * Signs out of a server's OAuth: the owner's tokens go (the registered client stays, so signing in again is quick),
 * the server now wants a sign-in, and its clients reconnect everywhere.
 */
export const signOutCatalogItem = async (item: CatalogItem, userId: string) => {
  const owner = await ownerFor(item, userId);
  if (!owner) {
    return;
  }
  await removeSecret(owner, "oauth_tokens");
  await removeSecret(owner, "oauth_verifier");
  const { db } = getDb();
  const health = {
    checkedAt: new Date().toISOString(),
    state: "auth" as const,
  };
  await (owner.type === "connection"
    ? db
        .update(connections)
        .set({ status: "needs_reauth" })
        .where(eq(connections.id, owner.id))
    : db
        .update(catalogItems)
        .set({ health })
        .where(eq(catalogItems.id, item.id)));
  if (owner.type === "connection") {
    await db
      .update(catalogItems)
      .set({ health })
      .where(eq(catalogItems.id, item.id));
  }
  await configChanged({ catalogId: item.id });
};

/** A sign-in that never came back is forgotten after an hour. */
const FLOW_TTL = sql`now() - interval '1 hour'`;

/**
 * The OAuth callback: the state names the flow, the code is traded for tokens (kept as the owner's secrets).
 * Returns where to send the user, or null for a state that is unknown, stale or someone else's.
 */
export const finishOAuth = async (input: {
  state: string;
  code: string;
  userId: string;
  issuer?: string;
}) => {
  const { db } = getDb();
  await db.delete(oauthFlows).where(lt(oauthFlows.createdAt, FLOW_TTL));
  const [flow] = await db
    .delete(oauthFlows)
    .where(
      and(
        eq(oauthFlows.state, input.state),
        eq(oauthFlows.userId, input.userId)
      )
    )
    .returning();
  if (!flow) {
    return null;
  }
  const catalogId = await catalogIdOfFlow(flow);
  const item = catalogId ? await getCatalogItem(catalogId) : null;
  if (!item) {
    return null;
  }
  const owner: Owner = { id: flow.ownerId, type: flow.ownerType };
  const result = await auth(
    new StoredOAuth(owner, { callbackState: input.state }),
    {
      authorizationCode: input.code,
      callbackIssuer: input.issuer,
      callbackState: input.state,
      fetchFn: await fetchFor(
        { mode: item.proxyMode, proxyId: item.proxyId },
        item.config.url
      ),
      scope: item.config.scope,
      serverUrl: item.config.url,
    }
  );
  if (result !== "AUTHORIZED") {
    return null;
  }
  await checkCatalogItem(item, input.userId, flow.returnTo);
  return flow.returnTo;
};
