// S28: the cases a live installation can be in. Usage: tsx edge.ts — prints a line per case, exits 1 on a failure.
import { buildFolder, connect, recreateDb, runMigrations, URL } from "./lib";

const results: { case: string; ok: boolean; detail: string }[] = [];
const check = async (name: string, fn: () => Promise<string>) => {
  try {
    results.push({ case: name, detail: await fn(), ok: true });
  } catch (error) {
    results.push({ case: name, detail: (error as Error).message, ok: false });
  }
};

const fresh = async (upTo: 0 | 1 | 2 | 3) => {
  await recreateDb();
  await runMigrations(URL, await buildFolder(upTo));
};

const one = async <T>(fn: (sql: ReturnType<typeof connect>) => Promise<T>) => {
  const sql = connect();
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
};

// A new installation: every migration on an empty base; no organization until the claim makes it.
await check("new installation: all migrations on an empty base", async () => {
  await fresh(3);
  const [r] = await one(
    (sql) => sql`select count(*)::int as n from organizations`
  );
  if (r?.n !== 0) {
    throw new Error(`organizations: ${r?.n}`);
  }
  return "applied; 0 organizations — the claim makes the first one";
});

// The upgrade check's base (.github/scripts/upgrade-check.sh): one person with the default role, no superuser.
await check(
  "no superuser (upgrade-check.sh): one person becomes the owner",
  async () => {
    await fresh(0);
    await one(
      (
        sql
      ) => sql`insert into "user" (id, name, email, email_verified, created_at, updated_at)
      values ('upgrade-check', 'Upgrade check', 'upgrade-check@example.com', true, now(), now())`
    );
    await runMigrations(URL, await buildFolder(3));
    const [r] = await one(
      (sql) =>
        sql`select u.org_role, o.name from "user" u join organizations o on o.id = u.organization_id`
    );
    if (r?.org_role !== "owner") {
      throw new Error(JSON.stringify(r));
    }
    return `org_role=owner, organization «${r.name}»`;
  }
);

// Two admins, no superuser: the oldest admin is the owner, the other stays admin.
await check(
  "no superuser, two admins: the oldest admin is the owner",
  async () => {
    await fresh(0);
    await one(
      (
        sql
      ) => sql`insert into "user" (id, name, email, role, created_at, updated_at) values
      ('a1', 'A1', 'a1@example.test', 'admin', now() - interval '2 days', now()),
      ('a2', 'A2', 'a2@example.test', 'admin', now() - interval '1 day', now()),
      ('u1', 'U1', 'u1@example.test', 'user', now() - interval '3 days', now())`
    );
    await runMigrations(URL, await buildFolder(3));
    const rows = await one(
      (sql) => sql`select id, org_role from "user" order by id`
    );
    const got = rows.map((r) => `${r.id}=${r.org_role}`).join(", ");
    if (got !== "a1=owner, a2=admin, u1=member") {
      throw new Error(got);
    }
    return got;
  }
);

// Rolling: after expand + backfill the previous release keeps writing in its own shape; contract catches it up.
await check(
  "previous release writes between backfill and contract",
  async () => {
    await fresh(0);
    await one(
      (
        sql
      ) => sql`insert into "user" (id, name, email, role, created_at, updated_at)
      values ('su', 'Su', 'su@example.test', 'superuser', now(), now())`
    );
    await runMigrations(URL, await buildFolder(2));
    // What the old code writes: no organization_id, no org_role (columns it does not know).
    const [defaulted] = await one(async (sql) => {
      await sql`insert into "user" (id, name, email, role, created_at, updated_at)
      values ('late', 'Late', 'late@example.test', 'admin', now(), now())`;
      await sql`insert into invitations (role, token_hash, expires_at) values ('admin', 'late', now() + interval '1 day')`;
      await sql`insert into catalog_items (key, title, config) values ('late', 'Late', '{}')`;
      await sql`insert into skills (name, description, instructions) values ('late', 'd', 'i')`;
      return sql`insert into model_runs (user_id, status) values ('late', 'ok') returning organization_id`;
    });
    if (!defaulted?.organization_id) {
      throw new Error(
        "an old-shape insert got no organization from the default"
      );
    }
    await runMigrations(URL, await buildFolder(3));
    const [r] = await one(
      (sql) => sql`select
      (select org_role from "user" where id = 'late') as late_role,
      (select org_role from invitations where token_hash = 'late') as inv_role,
      (select count(*)::int from "user" where organization_id is null) as unset`
    );
    if (r?.late_role !== "admin" || r.inv_role !== "admin" || r.unset !== 0) {
      throw new Error(JSON.stringify(r));
    }
    return "old-shape rows got the organization from the default; contract filled org_role (admin→admin)";
  }
);

// An installation that had nothing at expand and got its first rows from the old code: contract makes the org.
await check(
  "empty at expand, rows from the old code before contract",
  async () => {
    await fresh(2);
    await one(
      (
        sql
      ) => sql`insert into "user" (id, name, email, role, created_at, updated_at)
      values ('su', 'Su', 'su@example.test', 'superuser', now(), now())`
    );
    await runMigrations(URL, await buildFolder(3));
    const [r] = await one(
      (sql) =>
        sql`select count(*)::int as orgs, (select org_role from "user") as role from organizations`
    );
    if (r?.orgs !== 1 || r.role !== "owner") {
      throw new Error(JSON.stringify(r));
    }
    return "contract made the organization, superuser→owner";
  }
);

// After contract: one owner per organization, catalog keys unique within an organization.
await check(
  "after contract: second owner and duplicate key refused",
  async () => {
    await fresh(0);
    await one(
      (
        sql
      ) => sql`insert into "user" (id, name, email, role, created_at, updated_at)
      values ('su', 'Su', 'su@example.test', 'superuser', now(), now())`
    );
    await runMigrations(URL, await buildFolder(3));
    const refused: string[] = [];
    await one(async (sql) => {
      const [org] = await sql`select id from organizations`;
      await sql`insert into "user" (id, name, email, organization_id, org_role, created_at, updated_at)
      values ('o2', 'O2', 'o2@example.test', ${org?.id}, 'owner', now(), now())`.catch(
        (e: Error) => refused.push(e.message.slice(0, 60))
      );
      await sql`insert into catalog_items (key, title, config, organization_id) values ('k', 'K', '{}', ${org?.id})`;
      await sql`insert into catalog_items (key, title, config, organization_id) values ('k', 'K', '{}', ${org?.id})`.catch(
        (e: Error) => refused.push(e.message.slice(0, 60))
      );
      // Same key in another organization: allowed.
      const [b] =
        await sql`insert into organizations (name) values ('B') returning id`;
      await sql`insert into catalog_items (key, title, config, organization_id) values ('k', 'K', '{}', ${b?.id})`;
    });
    if (refused.length !== 2) {
      throw new Error(refused.join(" | "));
    }
    return refused.join(" | ");
  }
);

for (const r of results) {
  console.log(`${r.ok ? "ok  " : "FAIL"} ${r.case}: ${r.detail}`);
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
