import "server-only";
import { models, providers, sources } from "@metobe/db/schema/models";
import { asc, count, countDistinct, eq, sql } from "drizzle-orm";

import { getDb } from "./db";
import { PROVIDERS, titleOfSlug } from "./discovery-rules";

// Providers — who made a model (ARCH §5.2), apart from sources — who gives access to it. The same maker can come
// through several sources (Claude directly and through the Gateway); here the admin names it and picks its logo.

/** Every provider that has at least one model, with its counts across all sources. */
export const listProviders = () => {
  const { db } = getDb();
  return db
    .select({
      id: providers.id,
      logo: providers.logo,
      modelsEnabled:
        sql<number>`count(${models.id}) filter (where ${models.enabled})`.mapWith(
          Number
        ),
      modelsTotal: count(models.id),
      slug: providers.slug,
      sources: countDistinct(models.sourceId),
      title: providers.title,
    })
    .from(providers)
    .innerJoin(models, eq(models.providerId, providers.id))
    .groupBy(providers.id)
    .orderBy(sql`count(${models.id}) desc`, asc(providers.title));
};
export type ProviderSummary = Awaited<ReturnType<typeof listProviders>>[number];

/** One provider with its models, each with the source it comes through; null when it is gone. */
export const getProvider = async (id: string) => {
  const { db } = getDb();
  const [provider] = await db
    .select()
    .from(providers)
    .where(eq(providers.id, id))
    .limit(1);
  if (!provider) {
    return null;
  }
  const rows = await db
    .select({
      capabilities: models.capabilities,
      capabilitiesSource: models.capabilitiesSource,
      contextWindow: models.contextWindow,
      enabled: models.enabled,
      id: models.id,
      modelId: models.modelId,
      priceCacheRead: models.priceCacheRead,
      priceCacheWrite: models.priceCacheWrite,
      priceCurrency: models.priceCurrency,
      priceInput: models.priceInput,
      priceOutput: models.priceOutput,
      priceUnitTokens: models.priceUnitTokens,
      releasedAt: models.releasedAt,
      source: {
        baseUrl: sources.baseUrl,
        enabled: sources.enabled,
        health: sources.health,
        id: sources.id,
        kind: sources.kind,
        logo: sources.logo,
        title: sources.title,
      },
      title: models.title,
    })
    .from(models)
    .innerJoin(sources, eq(sources.id, models.sourceId))
    .where(eq(models.providerId, id))
    // One list, newest first, whatever source a model comes through (prototype P7).
    .orderBy(
      sql`${models.releasedAt} desc nulls last`,
      asc(models.title),
      asc(sources.createdAt)
    );
  // «Renamed» only when the name really differs from the one it came with (renaming back is not a rename).
  const original =
    PROVIDERS.find((p) => p.slug === provider.slug)?.title ??
    titleOfSlug(provider.slug);
  return { models: rows, provider, renamed: provider.title !== original };
};
export type ProviderDetail = NonNullable<
  Awaited<ReturnType<typeof getProvider>>
>;

/** The admin's name or logo for a maker; marked edited. `logo: null` puts back the built-in logo right away. */
export const updateProvider = async (
  id: string,
  patch: { title?: string; logo?: string | null }
) => {
  const { db } = getDb();
  let { logo } = patch;
  if (logo === null) {
    const [row] = await db
      .select({ slug: providers.slug })
      .from(providers)
      .where(eq(providers.id, id))
      .limit(1);
    logo = PROVIDERS.find((p) => p.slug === row?.slug)?.logo ?? null;
  }
  await db
    .update(providers)
    .set({
      ...patch,
      ...(patch.logo === undefined ? {} : { logo }),
      edited: true,
    })
    .where(eq(providers.id, id));
};
