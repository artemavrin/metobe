import { randomBytes } from "node:crypto";

import type { Db } from "@metobe/db/client";
import { runMigrations } from "@metobe/db/migrate";
import { user } from "@metobe/db/schema/auth";
import { organizations } from "@metobe/db/schema/organizations";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type * as ContextModule from "./context";
import type * as UsersModule from "./users";

vi.mock("server-only", () => ({}));

// The context of a request and the gates (D48, ORGS-PLAN §6, О2): who a person is, in which organization and as what,
// and when work for them stops — their organization is off, or the platform turned them off. Needs a database:
// MEMORY_TEST_DATABASE_URL=postgres://… pnpm --filter @metobe/core test context
// The test makes its own organizations and people and touches nothing else, so a shared database is fine.
const URL = process.env.MEMORY_TEST_DATABASE_URL;

describe.skipIf(!URL)("the context of a request and its gates", () => {
  const tag = randomBytes(4).toString("hex");
  const id = (name: string) => `ctx-${tag}-${name}`;
  const person = (
    name: string,
    organizationId: string,
    over: Partial<typeof user.$inferInsert> = {}
  ) => ({
    email: `${id(name)}@example.test`,
    id: id(name),
    name,
    organizationId,
    ...over,
  });
  let db: Db;
  let context: typeof ContextModule;
  let users: typeof UsersModule;
  let on: string;
  let off: string;
  const can = (name: string) => context.userCanAct(id(name));

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    process.env.SECRETS_KEY = randomBytes(32).toString("base64");
    process.env.BETTER_AUTH_SECRET ??= randomBytes(32).toString("base64");
    process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    await runMigrations(URL as string);
    const dbModule = await import("./db");
    ({ db } = dbModule.getDb());
    context = await import("./context");
    users = await import("./users");
    const made = await db
      .insert(organizations)
      .values([
        { name: `on-${tag}` },
        {
          disabledReason: "unpaid",
          name: `off-${tag}`,
          status: "disabled",
        },
      ])
      .returning({ id: organizations.id, name: organizations.name });
    on = made.find((o) => o.name === `on-${tag}`)?.id ?? "";
    off = made.find((o) => o.name === `off-${tag}`)?.id ?? "";
    await db.insert(user).values([
      person("owner", on, { orgRole: "owner", role: "superuser" }),
      person("admin", on, { orgRole: "admin" }),
      person("member", on, { orgRole: "member" }),
      // Written by the release before roles in the organization: no `org_role`, read from the install's role.
      person("old", on, { role: "admin" }),
      person("blocked", on, { blockedAt: new Date(), orgRole: "member" }),
      person("switched-off", on, { disabledAt: new Date(), orgRole: "member" }),
      person("in-off-org", off, { orgRole: "admin" }),
      person("blocked-in-off-org", off, {
        blockedAt: new Date(),
        orgRole: "member",
      }),
    ]);
  });

  afterAll(async () => {
    if (!db) {
      return;
    }
    await db.delete(user).where(eq(user.organizationId, on));
    await db.delete(user).where(eq(user.organizationId, off));
    await db.delete(organizations).where(inArray(organizations.id, [on, off]));
  });

  it("reads who the person is, where, and as what — from the base, both roles", async () => {
    expect(await context.loadContext(id("owner"))).toEqual({
      gate: null,
      orgDisabledReason: null,
      orgId: on,
      orgName: `on-${tag}`,
      orgRole: "owner",
      orgStatus: "active",
      platformRole: "superuser",
      userId: id("owner"),
    });
    const admin = await context.loadContext(id("admin"));
    expect([admin?.platformRole, admin?.orgRole]).toEqual(["user", "admin"]);
    const member = await context.loadContext(id("member"));
    expect([member?.platformRole, member?.orgRole]).toEqual(["user", "member"]);
  });

  it("reads the organization role of a row the previous release wrote from its install role", async () => {
    const old = await context.loadContext(id("old"));
    expect([old?.platformRole, old?.orgRole]).toEqual(["admin", "admin"]);
  });

  it("knows nobody who is not there", async () => {
    expect(await context.loadContext(id("nobody"))).toBeNull();
  });

  it("closes the gate for an organization that is off, and says why", async () => {
    const ctx = await context.loadContext(id("in-off-org"));
    expect(ctx).toMatchObject({
      gate: "org-disabled",
      orgDisabledReason: "unpaid",
      orgStatus: "disabled",
    });
  });

  it("closes the gate for a person the platform turned off, an organization's reason first", async () => {
    const blocked = await context.loadContext(id("blocked"));
    const blockedInOffOrg = await context.loadContext(id("blocked-in-off-org"));
    expect(blocked?.gate).toBe("blocked");
    expect(blockedInOffOrg?.gate).toBe("org-disabled");
  });

  it("lets work go on for an active person only", async () => {
    expect(await can("owner")).toBe(true);
    expect(await can("member")).toBe(true);
    expect(await can("blocked")).toBe(false);
    expect(await can("switched-off")).toBe(false);
    expect(await can("in-off-org")).toBe(false);
    expect(await can("nobody")).toBe(false);
  });

  it("says the same in SQL, for the worker's queries over many people", async () => {
    const ids = [
      "owner",
      "member",
      "blocked",
      "switched-off",
      "in-off-org",
    ].map(id);
    const rows = await db.select({ id: user.id }).from(user).where(
      // The one rule of `userCanAct`, as a condition on this column.
      context.userCanActSql(user.id)
    );
    const active = new Set(rows.map((r) => r.id));
    expect(ids.filter((i) => active.has(i))).toEqual([
      id("owner"),
      id("member"),
    ]);
  });

  it("acts again as soon as the organization is back", async () => {
    expect(await context.userCanAct(id("in-off-org"))).toBe(false);
    await db
      .update(organizations)
      .set({ disabledReason: null, status: "active" })
      .where(eq(organizations.id, off));
    try {
      expect(await context.userCanAct(id("in-off-org"))).toBe(true);
      const back = await context.loadContext(id("in-off-org"));
      expect(back?.gate).toBeNull();
    } finally {
      await db
        .update(organizations)
        .set({ disabledReason: "unpaid", status: "disabled" })
        .where(eq(organizations.id, off));
    }
  });

  it("lets nobody the platform turned off sign in, and everyone else — an off organization's people too, to see why", async () => {
    expect(await users.isSignInAllowed(id("member"))).toBe(true);
    expect(await users.isSignInAllowed(id("in-off-org"))).toBe(true);
    expect(await users.isSignInAllowed(id("blocked"))).toBe(false);
    expect(await users.isSignInAllowed(id("switched-off"))).toBe(false);
  });
});
