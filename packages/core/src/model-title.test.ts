import { randomBytes } from "node:crypto";

import type { Db } from "@metobe/db/client";
import { runMigrations } from "@metobe/db/migrate";
import { models, sources } from "@metobe/db/schema/models";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type * as DiscoveryModule from "./discovery";
import type * as SourcesModule from "./sources";

vi.mock("server-only", () => ({}));

// What the source lists: the test says it, no network.
const listed = vi.hoisted(() => ({ title: "deepseek/deepseek-v4.1-flash" }));
vi.mock("./discovery-fetch", () => ({
  DiscoveryError: class extends Error {},
  GATEWAY_MODELS_URL: "https://example.test/v1/models",
  fetchModelList: () =>
    Promise.resolve([
      {
        capabilities: { tools: true },
        capabilitiesSource: "discovered",
        contextWindow: null,
        modelId: "deepseek/deepseek-v4.1-flash",
        price: null,
        provider: "deepseek",
        releasedAt: null,
        title: listed.title,
      },
    ]),
}));
vi.mock("./secrets", () => ({
  removeSecrets: () => Promise.resolve(),
  withSecret: () => Promise.resolve(null),
}));
vi.mock("./net", () => ({ fetchFor: () => Promise.resolve(fetch) }));

// A model's name given by the admin (`setModelTitle`) against what a sync brings. Needs a database of its own, as the
// memory's store tests do: MEMORY_TEST_DATABASE_URL=postgres://… pnpm --filter @metobe/core test model-title
const URL = process.env.MEMORY_TEST_DATABASE_URL;

describe.skipIf(!URL)("a model renamed by the admin", () => {
  let db: Db;
  let discovery: typeof DiscoveryModule;
  let core: typeof SourcesModule;
  let sourceId = "";
  let modelId = "";

  const titles = async () => {
    const [row] = await db
      .select({ original: models.originalTitle, title: models.title })
      .from(models)
      .where(eq(models.id, modelId));
    return row;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    process.env.SECRETS_KEY ??= randomBytes(32).toString("base64");
    process.env.BETTER_AUTH_SECRET ??= randomBytes(32).toString("base64");
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    await runMigrations(URL as string);
    const dbModule = await import("./db");
    ({ db } = dbModule.getDb());
    discovery = await import("./discovery");
    core = await import("./sources");
    const [source] = await db
      .insert(sources)
      .values({
        baseUrl: "https://example.test/v1",
        kind: "openai-compatible",
        options: { kind: "openai-compatible" },
        title: `model-title-${randomBytes(4).toString("hex")}`,
      })
      .returning({ id: sources.id });
    sourceId = source?.id ?? "";
    await discovery.syncModels(sourceId);
    const [model] = await db
      .select({ id: models.id })
      .from(models)
      .where(eq(models.sourceId, sourceId));
    modelId = model?.id ?? "";
  });

  afterAll(async () => {
    await db?.delete(sources).where(eq(sources.id, sourceId));
  });

  it("keeps the admin's name through a sync, and the source's aside", async () => {
    expect(await titles()).toEqual({
      original: null,
      title: "deepseek/deepseek-v4.1-flash",
    });
    await core.setModelTitle(sourceId, modelId, "DeepSeek 4.1 Flash");
    expect(await titles()).toEqual({
      original: "deepseek/deepseek-v4.1-flash",
      title: "DeepSeek 4.1 Flash",
    });
    // The source renames it on its side: ours stays, theirs is refreshed.
    listed.title = "DeepSeek V4.1 Flash (new)";
    await discovery.syncModels(sourceId);
    expect(await titles()).toEqual({
      original: "DeepSeek V4.1 Flash (new)",
      title: "DeepSeek 4.1 Flash",
    });
  });

  it("puts the source's name back, and follows the source again after", async () => {
    await core.setModelTitle(sourceId, modelId, null);
    expect(await titles()).toEqual({
      original: null,
      title: "DeepSeek V4.1 Flash (new)",
    });
    listed.title = "deepseek/deepseek-v4.1-flash";
    await discovery.syncModels(sourceId);
    expect(await titles()).toEqual({
      original: null,
      title: "deepseek/deepseek-v4.1-flash",
    });
  });

  it("takes a rename to the source's own name as no rename", async () => {
    await core.setModelTitle(sourceId, modelId, "Короткое имя");
    await core.setModelTitle(sourceId, modelId, "deepseek/deepseek-v4.1-flash");
    expect(await titles()).toEqual({
      original: null,
      title: "deepseek/deepseek-v4.1-flash",
    });
  });
});
