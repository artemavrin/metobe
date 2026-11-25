-- Organizations, step 2 of 3 — backfill (D48, ARCH §20.4): the roles in the organization. Its id needs no backfill —
-- existing rows read it from the column's default (expand). Fills only what is null, so running it again changes
-- nothing; contract runs the same statements again for rows the previous release wrote in between.
-- In self-hosted the install's admin stays the organization's admin, and the superuser becomes its owner (ORGS-PLAN §4).
UPDATE "user" SET "org_role" = CASE "role" WHEN 'superuser' THEN 'owner' WHEN 'admin' THEN 'admin' ELSE 'member' END
WHERE "org_role" IS NULL;
--> statement-breakpoint
-- Exactly one owner. No superuser (an installation that lost it, or the upgrade check's base) — the oldest admin, else
-- the oldest person.
UPDATE "user" SET "org_role" = 'owner'
WHERE "id" = (SELECT "id" FROM "user" ORDER BY ("role" = 'admin') DESC, "created_at", "id" LIMIT 1)
	AND NOT EXISTS (SELECT 1 FROM "user" WHERE "org_role" = 'owner');
--> statement-breakpoint
UPDATE "invitations" SET "org_role" = CASE "role" WHEN 'admin' THEN 'admin' ELSE 'member' END
WHERE "org_role" IS NULL;
