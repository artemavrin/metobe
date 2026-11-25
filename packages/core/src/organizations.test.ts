import { randomBytes } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createDb } from "@metobe/db/client";
import { defaultMigrationsFolder, runMigrations } from "@metobe/db/migrate";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Organizations in the data (D48, ORGS-PLAN О1): the migration on an install that predates them, the claim on a new
// one. Each case makes a database of its own on the test server and drops it after — the claim needs an install
// nobody has claimed. MEMORY_TEST_DATABASE_URL=postgres://… pnpm --filter @metobe/core test organizations
const URL = process.env.MEMORY_TEST_DATABASE_URL;

/** The migration that brings organizations: an install before it is one at the migration before. */
const EXPAND = "0071_orgs_expand";

type Sql = ReturnType<typeof createDb>["sql"];

const serverUrl = (name: string) => {
  const url = new globalThis.URL(URL as string);
  url.pathname = `/${name}`;
  return url.toString();
};

const createDatabase = async () => {
  const name = `orgs_test_${randomBytes(4).toString("hex")}`;
  const admin = createDb(URL as string).sql;
  try {
    await admin.unsafe(`create database ${name}`);
  } finally {
    await admin.end();
  }
  return name;
};

const dropDatabase = async (name: string) => {
  const admin = createDb(URL as string).sql;
  try {
    await admin.unsafe(`drop database if exists ${name} with (force)`);
  } finally {
    await admin.end();
  }
};

/** The migrations folder as the release before organizations shipped it: every migration before expand. */
const folderBeforeOrganizations = async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "metobe-orgs-"));
  await mkdir(path.join(dir, "meta"));
  const journal = JSON.parse(
    await readFile(
      path.join(defaultMigrationsFolder, "meta/_journal.json"),
      "utf-8"
    )
  ) as { entries: { tag: string }[] };
  const cut = journal.entries.findIndex((entry) => entry.tag === EXPAND);
  journal.entries = journal.entries.slice(0, cut);
  const kept = new Set(journal.entries.map((entry) => `${entry.tag}.sql`));
  for (const name of await readdir(defaultMigrationsFolder)) {
    if (kept.has(name)) {
      // oxlint-disable-next-line no-await-in-loop -- a few dozen small files, once
      await cp(path.join(defaultMigrationsFolder, name), path.join(dir, name));
    }
  }
  await writeFile(
    path.join(dir, "meta/_journal.json"),
    JSON.stringify(journal)
  );
  return dir;
};

/** The core's modules against another database: the pool and the environment are per process, so both are reset. */
const coreOn = async (url: string) => {
  process.env.DATABASE_URL = url;
  Reflect.deleteProperty(globalThis, Symbol.for("metobe.db"));
  vi.resetModules();
  return {
    claim: await import("./claim"),
    invitations: await import("./invitations"),
    organizations: await import("./organizations"),
  };
};

const endCorePool = async () => {
  const key = Symbol.for("metobe.db");
  const pool = (globalThis as Record<symbol, { sql: Sql } | undefined>)[key];
  await pool?.sql.end();
  Reflect.deleteProperty(globalThis, key);
};

const roles = (sql: Sql) =>
  sql<
    { id: string; organization_id: string | null; org_role: string | null }[]
  >`
    select id, organization_id, org_role from "user" order by id`;

describe.skipIf(!URL)(
  "organizations in the data (D48)",
  { timeout: 60_000 },
  () => {
    const made: string[] = [];

    beforeAll(() => {
      process.env.SECRETS_KEY = randomBytes(32).toString("base64");
      process.env.BETTER_AUTH_SECRET ??= randomBytes(32).toString("base64");
      process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
    });

    afterAll(async () => {
      await endCorePool();
      await Promise.all(made.map(dropDatabase));
    });

    it("gives an install that predates them one organization, and the superuser owns it", async () => {
      const name = await createDatabase();
      made.push(name);
      const url = serverUrl(name);
      const { sql } = createDb(url);
      try {
        await runMigrations(url, await folderBeforeOrganizations());
        await sql`insert into "user" (id, name, email, role, created_at, updated_at) values
        ('a-owner', 'Owner', 'owner@acme.example', 'superuser', now() - interval '3 days', now()),
        ('b-admin', 'Admin', 'admin@acme.example', 'admin', now() - interval '2 days', now()),
        ('c-user', 'User', 'user@acme.example', 'user', now() - interval '1 day', now())`;
        await sql`insert into invitations (role, token_hash, expires_at) values ('admin', 'h1', now() + interval '1 day')`;
        await sql`insert into system_settings (id, policies) values (1, ${JSON.stringify({ access: { domains: ["acme.example"] }, chat: { x: 1 } })}::jsonb)
        on conflict (id) do update set policies = excluded.policies`;

        await runMigrations(url);

        const orgs = await sql<
          { id: string; name: string; settings: unknown }[]
        >`
        select id, name, settings from organizations`;
        expect(orgs).toHaveLength(1);
        const [org] = orgs;
        expect(org?.name).toBe("acme.example");
        // Only the organization's parts of the policies, copied (O3 moves them).
        expect(org?.settings).toEqual({
          access: { domains: ["acme.example"] },
        });
        expect(await roles(sql)).toEqual([
          { id: "a-owner", org_role: "owner", organization_id: org?.id },
          { id: "b-admin", org_role: "admin", organization_id: org?.id },
          { id: "c-user", org_role: "member", organization_id: org?.id },
        ]);
        const [invitation] =
          await sql`select organization_id, org_role from invitations`;
        expect(invitation).toEqual({
          org_role: "admin",
          organization_id: org?.id,
        });

        // The previous release, still running after the update, writes an account without either: the organization comes
        // from the default, the role is read from the install's role until contract fills it in.
        await sql`insert into "user" (id, name, email, role) values ('d-old', 'Old', 'old@acme.example', 'admin')`;
        const core = await coreOn(url);
        expect(await core.organizations.getMembership("d-old")).toEqual({
          orgRole: "admin",
          organization: {
            id: org?.id,
            name: "acme.example",
            status: "active",
            timeZone: "Europe/Moscow",
          },
        });
        const owner = await core.organizations.getMembership("a-owner");
        expect(owner?.orgRole).toBe("owner");
        expect(await core.organizations.getMembership("nobody")).toBeNull();

        // Running the migrations again changes nothing.
        const before = await roles(sql);
        await runMigrations(url);
        expect(await roles(sql)).toEqual(before);
        expect(await sql`select 1 from organizations`).toHaveLength(1);
      } finally {
        await endCorePool();
        await sql.end();
      }
    });

    it("makes the oldest person the owner where there is no superuser, until the claim takes it over", async () => {
      const name = await createDatabase();
      made.push(name);
      const url = serverUrl(name);
      const { sql } = createDb(url);
      try {
        await runMigrations(url, await folderBeforeOrganizations());
        // The upgrade check's base: one person with the role `user`, no superuser.
        await sql`insert into "user" (id, name, email, email_verified, created_at, updated_at)
        values ('upgrade-check', 'Upgrade check', 'upgrade-check@example.com', true, now(), now())`;
        await runMigrations(url);
        const [org] = await sql<
          { id: string; name: string }[]
        >`select id, name from organizations`;
        expect(org?.name).toBe("example.com");
        expect(await roles(sql)).toEqual([
          { id: "upgrade-check", org_role: "owner", organization_id: org?.id },
        ]);

        const core = await coreOn(url);
        await sql`insert into claim_tokens (token_hash, expires_at)
        values (encode(sha256('claim-token'::bytea), 'hex'), now() + interval '1 day')`;
        expect(
          await core.claim.redeemClaimToken({
            email: "boss@other.example",
            name: "Boss",
            token: "claim-token",
          })
        ).toEqual({ ok: true });
        const people = await sql<
          { email: string; org_role: string; organization_id: string }[]
        >`
        select email, org_role, organization_id from "user" order by email`;
        expect(people).toEqual([
          {
            email: "boss@other.example",
            org_role: "owner",
            organization_id: org?.id,
          },
          {
            email: "upgrade-check@example.com",
            org_role: "admin",
            organization_id: org?.id,
          },
        ]);
        expect(await sql`select 1 from organizations`).toHaveLength(1);
      } finally {
        await endCorePool();
        await sql.end();
      }
    });

    it("has a new install's claim make the organization, named by the superuser's mail domain", async () => {
      const name = await createDatabase();
      made.push(name);
      const url = serverUrl(name);
      const { sql } = createDb(url);
      try {
        await runMigrations(url);
        expect(await sql`select 1 from organizations`).toHaveLength(0);

        const core = await coreOn(url);
        await sql`insert into claim_tokens (token_hash, expires_at)
        values (encode(sha256('claim-token'::bytea), 'hex'), now() + interval '1 day')`;
        expect(
          await core.claim.redeemClaimToken({
            email: "Owner@Acme.Example",
            name: "Owner",
            token: "claim-token",
          })
        ).toEqual({ ok: true });
        const [org] = await sql<
          { id: string; name: string }[]
        >`select id, name from organizations`;
        expect(org?.name).toBe("acme.example");
        const [owner] = await sql<
          { id: string; role: string }[]
        >`select id, role from "user"`;
        expect(owner?.role).toBe("superuser");
        const membership = await core.organizations.getMembership(
          owner?.id ?? ""
        );
        expect(membership?.orgRole).toBe("owner");

        // An invitation joins the inviter's organization, with the role in it that goes with the role in the install.
        const issued = await core.invitations.issueInvitation({
          actor: { id: owner?.id ?? "", role: "superuser" },
          email: "new@acme.example",
          role: "user",
        });
        if (!issued.ok) {
          throw new Error("no invitation");
        }
        const token =
          new globalThis.URL(issued.url).searchParams.get("token") ?? "";
        expect(
          await core.invitations.redeemInvitation({
            email: "new@acme.example",
            name: "New",
            token,
          })
        ).toEqual({ ok: true, verified: true });
        const [joined] =
          await sql`select organization_id, org_role from "user" where email = 'new@acme.example'`;
        expect(joined).toEqual({
          org_role: "member",
          organization_id: org?.id,
        });
      } finally {
        await endCorePool();
        await sql.end();
      }
    });
  }
);
