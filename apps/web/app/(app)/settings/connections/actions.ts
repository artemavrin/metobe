"use server";

import {
  catalogAccessModes,
  catalogKeySchema,
  catalogLogoSchema,
  credentialModes,
  mcpAuthKinds,
  mcpConfigSchema,
  mcpTransports,
  toolApprovals,
} from "@metobe/contracts/catalog";
import {
  checkCatalogItem,
  createCatalogItem,
  deleteCatalogItem,
  getCatalogItem,
  listCatalog,
  setCatalogAccess,
  setCatalogToken,
  signOutCatalogItem,
  updateCatalogItem,
} from "@metobe/core/catalog";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSettingsViewer } from "@/lib/settings-access";

// MCP servers of the catalog (M4): admins only; every change refreshes the settings layout (the sidebar's rows).

const requireAdmin = async () => {
  const { admin, user } = await getSettingsViewer();
  if (!admin || !user) {
    throw new Error("forbidden");
  }
  return user;
};

const idSchema = z.uuid();
const refresh = () => revalidatePath("/settings", "layout");

const itemOf = async (id: string) => {
  const item = await getCatalogItem(idSchema.parse(id));
  if (!item) {
    throw new Error("not found");
  }
  return item;
};

const slug = (value: string) =>
  value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "_")
    .replaceAll(/^_+|_+$/gu, "")
    .replace(/^(?=\d)/u, "m")
    .slice(0, 20);

/** A tool prefix: latin from the title, else the server's name (`github` of api.github.com); unique in the catalog. */
const keyFor = async (title: string, url: string) => {
  const labels = new URL(url).hostname.split(".");
  const base =
    [slug(title), slug(labels.at(-2) ?? labels[0] ?? "")].find(
      (x) => catalogKeySchema.safeParse(x).success
    ) ?? "mcp";
  const catalog = await listCatalog();
  const taken = new Set(catalog.map((x) => x.key));
  let key = base;
  for (let n = 2; taken.has(key); n += 1) {
    key = `${base.slice(0, 20)}_${n}`;
  }
  return key;
};

export type CreateResult = { ok: true; id: string } | { ok: false };

export const create = async (input: {
  title: string;
  url: string;
  auth: string;
  credentialMode: string;
}): Promise<CreateResult> => {
  await requireAdmin();
  const title = z.string().trim().min(1).max(100).safeParse(input.title);
  const config = mcpConfigSchema.safeParse({
    auth: input.auth,
    headerName: input.auth === "header" ? "X-API-Key" : undefined,
    transport: "http",
    url: input.url.trim(),
  });
  if (!title.success || !config.success) {
    return { ok: false };
  }
  const item = await createCatalogItem({
    config: config.data,
    credentialMode: z.enum(credentialModes).parse(input.credentialMode),
    key: await keyFor(title.data, config.data.url),
    title: title.data,
  });
  refresh();
  return { id: item.id, ok: true };
};

export const rename = async (id: string, title: string) => {
  await requireAdmin();
  await updateCatalogItem(idSchema.parse(id), {
    title: z.string().trim().min(1).max(100).parse(title),
  });
  refresh();
};

export const setEnabled = async (id: string, enabled: boolean) => {
  await requireAdmin();
  await updateCatalogItem(idSchema.parse(id), { enabled: Boolean(enabled) });
  refresh();
};

/** The server itself: its address, transport and how it authenticates. */
export const setServer = async (
  id: string,
  patch: {
    url?: string;
    transport?: string;
    auth?: string;
    headerName?: string;
    username?: string;
  }
): Promise<{ ok: boolean }> => {
  await requireAdmin();
  const item = await itemOf(id);
  const config = mcpConfigSchema.safeParse({
    ...item.config,
    ...patch,
    ...(patch.transport
      ? { transport: z.enum(mcpTransports).parse(patch.transport) }
      : {}),
    ...(patch.auth ? { auth: z.enum(mcpAuthKinds).parse(patch.auth) } : {}),
  });
  if (!config.success) {
    return { ok: false };
  }
  await updateCatalogItem(item.id, { config: config.data });
  refresh();
  return { ok: true };
};

export const setMode = async (id: string, mode: string) => {
  await requireAdmin();
  await updateCatalogItem(idSchema.parse(id), {
    credentialMode: z.enum(credentialModes).parse(mode),
  });
  refresh();
};

/**
 * The one account for everyone: its token, a header's value, or a login with its password — an empty secret keeps
 * the saved one, so a login can change alone. Each user's own credentials are theirs, entered where they connect.
 */
export const setToken = async (
  id: string,
  value: string,
  username?: string
): Promise<{ ok: boolean }> => {
  const user = await requireAdmin();
  const item = await itemOf(id);
  const secret = z.string().trim().max(4000).safeParse(value);
  // A colon ends the login in basic auth, so a login cannot hold one.
  const login = z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[^:]*$/u)
    .safeParse(username ?? "");
  const basic = item.config.auth === "basic";
  if (
    item.credentialMode !== "shared" ||
    !secret.success ||
    (basic && !login.success)
  ) {
    return { ok: false };
  }
  if (basic && login.data !== item.config.username) {
    await updateCatalogItem(item.id, {
      config: { ...item.config, username: login.data },
    });
  }
  if (secret.data) {
    await setCatalogToken(item, user.id, secret.data);
  }
  refresh();
  return { ok: true };
};

/** Connects and lists the tools; for OAuth not signed in yet, the provider's page to open. */
export const check = async (id: string) => {
  const user = await requireAdmin();
  const item = await itemOf(id);
  const result = await checkCatalogItem(
    item,
    user.id,
    `/settings/connections/${item.id}`
  );
  refresh();
  return {
    authorizationUrl: result.authorizationUrl,
    state: result.health.state,
  };
};

/** One policy for several tools at once (a single tool is a list of one). */
export const setApprovals = async (
  id: string,
  tools: string[],
  approval: string
) => {
  await requireAdmin();
  const item = await itemOf(id);
  const value = z.enum(toolApprovals).parse(approval);
  const names = z.array(z.string().min(1).max(200)).max(1000).parse(tools);
  await updateCatalogItem(item.id, {
    approvalPolicy: {
      ...item.approvalPolicy,
      ...Object.fromEntries(names.map((n) => [n, value])),
    },
  });
  refresh();
};

export const remove = async (id: string) => {
  await requireAdmin();
  await deleteCatalogItem(idSchema.parse(id));
  refresh();
};

/** An optional picture, already resized in the browser; null takes it away. */
export const setLogo = async (id: string, logo: string | null) => {
  await requireAdmin();
  await updateCatalogItem(idSchema.parse(id), {
    logo: logo === null ? null : catalogLogoSchema.parse(logo),
  });
  refresh();
};

/** Who gets the server's tools: everyone, or the users picked. */
export const setAccess = async (
  id: string,
  access: string,
  userIds: string[]
) => {
  await requireAdmin();
  await setCatalogAccess(
    idSchema.parse(id),
    z.enum(catalogAccessModes).parse(access),
    z.array(z.string().min(1).max(100)).max(1000).parse(userIds)
  );
  refresh();
};

/** Out of the server's OAuth: shared tokens, or the admin's own for a per-user server. */
export const signOut = async (id: string) => {
  const user = await requireAdmin();
  await signOutCatalogItem(await itemOf(id), user.id);
  refresh();
};
