// S28: the code of the release before organizations (this checkout's @metobe/core, unchanged) on the migrated base.
//   S28_STAGE=2 — after expand + backfill: everything must work (the rolling window, and image-only rollback).
//   S28_STAGE=3 — after contract: shows what of the old code breaks, so contract ships a release later.
// Run: S28_STAGE=2 pnpm exec vitest run --root spikes/S28-org-migration
import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { buildFolder, connect, recreateDb, runMigrations, URL } from "./lib";

// No Redis here: the config bus only tells other processes what changed.
vi.mock("../../packages/core/src/config-bus", () => ({
  configChanged: () => Promise.resolve(),
  onConfigChange: () => undefined,
}));

const stage = Number(process.env.S28_STAGE ?? 2) as 2 | 3;
const sql = connect();

type Core = {
  invitations: typeof import("../../packages/core/src/invitations");
  catalog: typeof import("../../packages/core/src/catalog");
  skills: typeof import("../../packages/core/src/skills");
  run: typeof import("../../packages/core/src/chat-run");
};
let core: Core;

describe(`old code after ${stage === 2 ? "expand + backfill" : "contract"}`, () => {
  beforeAll(async () => {
    await recreateDb();
    // The installation before the update: a superuser and a person.
    await runMigrations(URL, await buildFolder(0));
    await sql`insert into "user" (id, name, email, role, email_verified, created_at, updated_at) values
      ('su', 'Su', 'su@example.test', 'superuser', true, now(), now()),
      ('u2', 'U2', 'u2@example.test', 'user', true, now(), now())`;
    await runMigrations(URL, await buildFolder(stage));
    process.env.DATABASE_URL = URL;
    process.env.SECRETS_KEY = randomBytes(32).toString("base64");
    process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("base64");
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    core = {
      catalog: await import("../../packages/core/src/catalog"),
      invitations: await import("../../packages/core/src/invitations"),
      run: await import("../../packages/core/src/chat-run"),
      skills: await import("../../packages/core/src/skills"),
    };
  });

  afterAll(async () => {
    await sql.end();
    const db = await import("../../packages/core/src/db");
    await db.getDb().sql.end();
  });

  it("issues and redeems an invitation (a new user)", async () => {
    const issued = await core.invitations.issueInvitation({
      actor: { id: "su", role: "superuser" },
      email: "new@example.test",
      role: "admin",
    });
    expect(issued.ok).toBe(true);
    const token =
      new globalThis.URL(issued.ok ? issued.url : "http://x").searchParams.get(
        "token"
      ) ?? "";
    const redeemed = await core.invitations.redeemInvitation({
      email: "new@example.test",
      name: "New",
      token,
    });
    expect(redeemed).toEqual({ ok: true, verified: true });
    expect((await core.invitations.listOpenInvitations()).length).toBe(0);
    const [row] =
      await sql`select organization_id, org_role from "user" where email = 'new@example.test'`;
    // The default gave the organization; the role in it is contract's catch-up.
    expect(row?.organization_id).not.toBeNull();
  });

  it("adds a catalog item and lists the catalog", async () => {
    const item = await core.catalog.createCatalogItem({
      config: { transport: "http", url: "https://mcp.example.test" } as never,
      credentialMode: "shared",
      key: "svc",
      title: "Service",
    });
    expect(item.key).toBe("svc");
    expect((await core.catalog.listCatalog()).map((i) => i.key)).toContain(
      "svc"
    );
  });

  it("adds a skill and gives it to the chat", async () => {
    const result = await core.skills.createSkill(
      { admin: false, userId: "u2" },
      { description: "Does things", instructions: "Steps", name: "my-skill" }
    );
    expect(result.ok).toBe(true);
    const forChat = await core.skills.skillsForChat("u2");
    expect(JSON.stringify(forChat)).toContain("my-skill");
  });

  it("records a model run (what the old worker does during the update)", async () => {
    await core.run.recordRun({
      chatId: null,
      latencyMs: 10,
      model: { id: null, priceCurrency: "USD", priceUnitTokens: null } as never,
      status: "ok",
      userId: "u2",
    });
    const [row] =
      await sql`select organization_id from model_runs where user_id = 'u2'`;
    expect(row?.organization_id).not.toBeNull();
  });
});
