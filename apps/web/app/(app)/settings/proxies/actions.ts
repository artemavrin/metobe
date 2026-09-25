"use server";

import { proxyDomainSchema, proxyTypeSchema } from "@metobe/contracts/proxies";
import { parseProxyAddress } from "@metobe/core/net-transport";
import {
  addProxyDomain,
  createProxy,
  deleteProxy,
  recheckProxy,
  removeProxyDomain,
  setProxyCredentials,
  updateProxy,
} from "@metobe/core/proxies";
import type { DomainResult } from "@metobe/core/proxies";
import { setSourceRoute } from "@metobe/core/sources";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSettingsViewer } from "@/lib/settings-access";

// Proxies (M2 step 6c-2): admins only; every change refreshes the settings layout (the sidebar's state and flags).

const requireAdmin = async () => {
  const { admin } = await getSettingsViewer();
  if (!admin) {
    throw new Error("forbidden");
  }
};

const idSchema = z.uuid();
const refresh = () => revalidatePath("/settings", "layout");

export type AddressResult = { ok: true; id: string } | { ok: false };

/** A new proxy from `host:port` (with the picked type) or a full URL; checked right away. */
export const create = async (
  address: string,
  type: string
): Promise<AddressResult> => {
  await requireAdmin();
  const config = parseProxyAddress(address, proxyTypeSchema.parse(type));
  if (!config) {
    return { ok: false };
  }
  const id = await createProxy(config);
  refresh();
  return { id, ok: true };
};

export const rename = async (id: string, title: string) => {
  await requireAdmin();
  await updateProxy(idSchema.parse(id), {
    title: z.string().trim().min(1).max(100).parse(title),
  });
  refresh();
};

export const setType = async (id: string, type: string) => {
  await requireAdmin();
  await updateProxy(idSchema.parse(id), { type: proxyTypeSchema.parse(type) });
  refresh();
};

export const setEnabled = async (id: string, enabled: boolean) => {
  await requireAdmin();
  await updateProxy(idSchema.parse(id), { enabled: Boolean(enabled) });
  refresh();
};

/** A new address; a full URL may also carry the type and the login. */
export const setAddress = async (
  id: string,
  address: string,
  type: string
): Promise<{ ok: boolean }> => {
  await requireAdmin();
  const proxyId = idSchema.parse(id);
  const config = parseProxyAddress(address, proxyTypeSchema.parse(type));
  if (!config) {
    return { ok: false };
  }
  await updateProxy(proxyId, {
    host: config.host,
    port: config.port,
    type: config.type,
  });
  if (config.username) {
    await setProxyCredentials(
      proxyId,
      config.username,
      config.password ?? undefined
    );
  }
  refresh();
  return { ok: true };
};

/** Login and password; an empty login removes both, an empty password keeps the stored one. */
export const setCredentials = async (
  id: string,
  username: string,
  password: string
) => {
  await requireAdmin();
  const login = z.string().trim().max(200).parse(username);
  await setProxyCredentials(
    idSchema.parse(id),
    login || null,
    login ? z.string().max(500).parse(password) || undefined : null
  );
  refresh();
};

export const recheck = async (id: string) => {
  await requireAdmin();
  await recheckProxy(idSchema.parse(id));
  refresh();
};

export const addDomain = async (
  id: string,
  raw: string
): Promise<DomainResult | { ok: false; invalid: true }> => {
  await requireAdmin();
  // People paste URLs: the scheme and the path go, the domain stays.
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//u, "")
    .replace(/\/.*$/u, "");
  const domain = proxyDomainSchema.safeParse(cleaned);
  if (!domain.success) {
    return { invalid: true, ok: false };
  }
  const result = await addProxyDomain(idSchema.parse(id), domain.data);
  refresh();
  return result;
};

export const removeDomain = async (id: string, domain: string) => {
  await requireAdmin();
  await removeProxyDomain(idSchema.parse(id), proxyDomainSchema.parse(domain));
  refresh();
};

/** A source through this proxy, or back to direct. */
export const routeSource = async (
  sourceId: string,
  proxyId: string,
  on: boolean
) => {
  await requireAdmin();
  await setSourceRoute(
    idSchema.parse(sourceId),
    on
      ? { mode: "proxy", proxyId: idSchema.parse(proxyId) }
      : { mode: "direct", proxyId: null }
  );
  refresh();
};

export const remove = async (id: string) => {
  await requireAdmin();
  await deleteProxy(idSchema.parse(id));
  refresh();
};
