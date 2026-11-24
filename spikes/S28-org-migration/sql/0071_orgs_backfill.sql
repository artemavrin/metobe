-- S28 step 2 of 3 — backfill (drizzle-kit generate --custom): the roles in the organization. The organization's id
-- needs no backfill — existing rows read it from the column's default (expand). Idempotent: fills only what is null;
-- contract runs the same statements again for rows the previous release wrote in between.
UPDATE "user" SET "org_role" = CASE "role" WHEN 'superuser' THEN 'owner' WHEN 'admin' THEN 'admin' ELSE 'member' END
WHERE "org_role" IS NULL;
--> statement-breakpoint
-- Exactly one owner: no superuser (an installation that lost it, or the upgrade check's) — the oldest admin, else the
-- oldest person.
UPDATE "user" SET "org_role" = 'owner'
WHERE "id" = (SELECT "id" FROM "user" ORDER BY ("role" = 'admin') DESC, "created_at", "id" LIMIT 1)
	AND NOT EXISTS (SELECT 1 FROM "user" WHERE "org_role" = 'owner');
--> statement-breakpoint
UPDATE "invitations" SET "org_role" = CASE "role" WHEN 'admin' THEN 'admin' ELSE 'member' END
WHERE "org_role" IS NULL;
