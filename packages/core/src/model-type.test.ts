import { randomBytes } from "node:crypto";

import type { Db } from "@metobe/db/client";
import { runMigrations } from "@metobe/db/migrate";
import { modelSlots, models, sources } from "@metobe/db/schema/models";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type * as DiscoveryModule from "./discovery";
import type * as SourcesModule from "./sources";

vi.mock("server-only", () => ({}));

// What the source lists: ids only, as an OpenAI-compatible server does — no type.
vi.mock("./discovery-fetch", () => ({
  DiscoveryError: class extends Error {},
  GATEWAY_MODELS_URL: "https://example.test/v1/models",
  fetchModelList: () =>
    Promise.resolve([
      {
        capabilities: {},
        capabilitiesSource: "discovered",
        contextWindow: null,
        modelId: "microsoft/microsoft-decision-1",
        price: null,
        provider: "other",
        releasedAt: null,
        title: "microsoft/microsoft-decision-1",
      },
    ]),
}));
vi.mock("./secrets", () => ({
  removeSecrets: () => Promise.resolve(),
  withSecret: () => Promise.resolve(null),
}));
vi.mock("./net", () => ({ fetchFor: () => Promise.resolve(fetch) }));

// A decision model marked by the admin in an OpenAI-compatible source (`setModelType`) against what a sync brings.
// Needs a database of its own: MEMORY_TEST_DATABASE_URL=postgres://… pnpm --filter @metobe/core test model-type
const URL = process.env.MEMORY_TEST_DATABASE_URL;

describe.skipIf(!URL)("a decision model marked by the admin", () => {
  let db: Db;
  let discovery: typeof DiscoveryModule;
  let core: typeof SourcesModule;
  let sourceId = "";
  let modelId = "";

  const state = async () => {
    const [row] = await db
      .select({ enabled: models.enabled, type: models.type })
      .from(models)
      .where(eq(models.id, modelId));
    return row;
  };
  const slotOf = async (slot: "decisions" | "memory") => {
    const [row] = await db
      .select({ modelId: modelSlots.modelId })
      .from(modelSlots)
      .where(eq(modelSlots.slot, slot));
    return row?.modelId ?? null;
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
        title: `model-type-${randomBytes(4).toString("hex")}`,
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

  it("takes the model out of chat and out of a text job, and keeps the mark through a sync", async () => {
    await core.setModelsEnabled(sourceId, [modelId], true);
    await db
      .insert(modelSlots)
      .values({ modelId, slot: "memory" })
      .onConflictDoUpdate({ set: { modelId }, target: modelSlots.slot });
    expect(await core.setModelType(sourceId, modelId, "evaluation")).toBe(true);
    expect(await state()).toEqual({ enabled: false, type: "evaluation" });
    expect(await slotOf("memory")).toBeNull();
    // The server lists ids only, so a sync has nothing to say about the type.
    await discovery.syncModels(sourceId);
    expect(await state()).toEqual({ enabled: false, type: "evaluation" });
  });

  it("gives the model back to text, and «Решения» lets it go", async () => {
    await db
      .insert(modelSlots)
      .values({ modelId, slot: "decisions" })
      .onConflictDoUpdate({ set: { modelId }, target: modelSlots.slot });
    expect(await core.setModelType(sourceId, modelId, "language")).toBe(true);
    expect(await state()).toEqual({ enabled: false, type: "language" });
    expect(await slotOf("decisions")).toBeNull();
  });

  it("leaves a source whose catalog says the type itself alone", async () => {
    await db
      .update(sources)
      .set({ kind: "gateway", options: { kind: "gateway" } })
      .where(eq(sources.id, sourceId));
    expect(await core.setModelType(sourceId, modelId, "evaluation")).toBe(
      false
    );
    expect(await state()).toMatchObject({ type: "language" });
  });
});
