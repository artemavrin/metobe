"use server";

import {
  capabilitiesSchema,
  pricingSchema,
  proxyModes,
  sourceInputSchema,
  sourceOptionsSchema,
} from "@metobe/contracts/models";
import type { SourceHealth, SourceInput } from "@metobe/contracts/models";
import {
  connectSource,
  deleteSource,
  recheckSource,
  replaceSourceKey,
  setModelCapabilities,
  setModelPricing,
  setModelsEnabled,
  setSourceRoute,
  syncSource,
  updateSource,
  updateSourceConfig,
} from "@metobe/core/sources";
import type {
  ChangeResult,
  ConnectResult,
  SyncResult,
  Via,
} from "@metobe/core/sources";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logoSchema } from "@/lib/logo";
import { getSettingsViewer } from "@/lib/settings-access";
import { translateIssue } from "@/lib/validation";

// Sources (M2 step 6b): every action is for admins only and refreshes the settings layout, so the sidebar list
// and counts follow right away.

const requireAdmin = async () => {
  const { admin } = await getSettingsViewer();
  if (!admin) {
    throw new Error("forbidden");
  }
};

const refresh = () => revalidatePath("/settings", "layout");

const idSchema = z.uuid();

export type FieldErrors = Partial<
  Record<"apiKey" | "baseUrl" | "folderId", string>
>;
export type ConnectState =
  | ConnectResult
  | { status: "invalid"; errors: FieldErrors };

/** Checks and connects a new source; `via` answers a proxy offer or carries a proxy typed in the form. */
export const connect = async (
  raw: SourceInput,
  via?: Via
): Promise<ConnectState> => {
  await requireAdmin();
  const parsed = sourceInputSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field =
        issue.path[0] === "options" ? "folderId" : String(issue.path[0]);
      if (field === "apiKey" || field === "baseUrl" || field === "folderId") {
        // oxlint-disable-next-line no-await-in-loop -- at most three fields
        errors[field] ??= await translateIssue(issue.message);
      }
    }
    return { errors, status: "invalid" };
  }
  const result = await connectSource(parsed.data, via);
  if (result.status === "connected") {
    refresh();
  }
  return result;
};

export const sync = async (id: string): Promise<SyncResult> => {
  await requireAdmin();
  const result = await syncSource(idSchema.parse(id));
  refresh();
  return result;
};

export const recheck = async (id: string): Promise<SourceHealth> => {
  await requireAdmin();
  const health = await recheckSource(idSchema.parse(id));
  refresh();
  return health;
};

export const replaceKey = async (
  id: string,
  apiKey: string
): Promise<ChangeResult> => {
  await requireAdmin();
  const key = z.string().trim().min(1).max(4096).parse(apiKey);
  const result = await replaceSourceKey(idSchema.parse(id), key);
  refresh();
  return result;
};

export type ConfigState = ChangeResult | { ok: false; invalid: string };

/** A new API address (OpenAI-compatible) or Yandex folder; saved only if the source answers with it. */
export const updateConfig = async (
  id: string,
  change: { baseUrl?: string; folderId?: string }
): Promise<ConfigState> => {
  await requireAdmin();
  const sourceId = idSchema.parse(id);
  if (change.folderId !== undefined) {
    const options = sourceOptionsSchema.safeParse({
      folderId: change.folderId.trim(),
      kind: "yandex",
    });
    if (!options.success) {
      return {
        invalid: (await translateIssue(options.error.issues[0]?.message)) ?? "",
        ok: false,
      };
    }
    const result = await updateSourceConfig(sourceId, {
      baseUrl: null,
      options: options.data,
    });
    refresh();
    return result;
  }
  const baseUrl = z
    .string()
    .trim()
    .regex(/^https?:\/\/\S+$/u, "baseUrl")
    .safeParse(change.baseUrl);
  if (!baseUrl.success) {
    return {
      invalid: (await translateIssue(baseUrl.error.issues[0]?.message)) ?? "",
      ok: false,
    };
  }
  const result = await updateSourceConfig(sourceId, {
    baseUrl: baseUrl.data,
    options: { kind: "openai-compatible" },
  });
  refresh();
  return result;
};

export const setRoute = async (
  id: string,
  route: { mode: string; proxyId: string | null }
): Promise<SourceHealth> => {
  await requireAdmin();
  const mode = z.enum(proxyModes).parse(route.mode);
  const health = await setSourceRoute(idSchema.parse(id), {
    mode,
    proxyId: mode === "proxy" ? idSchema.parse(route.proxyId) : null,
  });
  refresh();
  return health;
};

export const rename = async (id: string, title: string) => {
  await requireAdmin();
  await updateSource(idSchema.parse(id), {
    title: z.string().trim().min(1).max(100).parse(title),
  });
  refresh();
};

/** A built-in logo key, an uploaded image, or `null` for the kind's own. */
export const setLogo = async (id: string, logo: string | null) => {
  await requireAdmin();
  await updateSource(idSchema.parse(id), {
    logo: logo === null ? null : logoSchema.parse(logo),
  });
  refresh();
};

export const setEnabled = async (id: string, enabled: boolean) => {
  await requireAdmin();
  await updateSource(idSchema.parse(id), { enabled: Boolean(enabled) });
  refresh();
};

export const remove = async (id: string) => {
  await requireAdmin();
  await deleteSource(idSchema.parse(id));
  refresh();
};

export const toggleModels = async (
  id: string,
  modelIds: string[],
  enabled: boolean
) => {
  await requireAdmin();
  await setModelsEnabled(
    idSchema.parse(id),
    z.array(idSchema).max(5000).parse(modelIds),
    Boolean(enabled)
  );
  refresh();
};

export type PricingState = { ok: true } | { ok: false; error: string };

/** Prices as the admin typed them, per any number of tokens; `null` clears them. */
export const setPricing = async (
  id: string,
  modelId: string,
  raw: unknown
): Promise<PricingState> => {
  await requireAdmin();
  const sourceId = idSchema.parse(id);
  const model = idSchema.parse(modelId);
  if (raw === null) {
    await setModelPricing(sourceId, model, null);
    refresh();
    return { ok: true };
  }
  const parsed = pricingSchema.safeParse(raw);
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    const key = issue?.path[0] === "unitTokens" ? "unitTokens" : issue?.message;
    return { error: (await translateIssue(key)) ?? "", ok: false };
  }
  await setModelPricing(sourceId, model, parsed.data);
  refresh();
  return { ok: true };
};

/** Capabilities set by hand (kept through syncs); `null` hands them back to the source and re-reads it. */
export const setCapabilities = async (
  id: string,
  modelId: string,
  raw: unknown
) => {
  await requireAdmin();
  const sourceId = idSchema.parse(id);
  const model = idSchema.parse(modelId);
  if (raw === null) {
    await setModelCapabilities(sourceId, model, null);
    await syncSource(sourceId);
  } else {
    await setModelCapabilities(sourceId, model, capabilitiesSchema.parse(raw));
  }
  refresh();
};
