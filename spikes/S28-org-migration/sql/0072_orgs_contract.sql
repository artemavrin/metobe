-- S28 step 3 of 3 — contract. Breaks the releases before expand (they write no org_role), so it ships one release after
-- expand + backfill, and before anything can make a second organization. An update over both runs all three in one
-- transaction (drizzle), so its ACCESS EXCLUSIVE locks are held to the end of all of them.
LOCK TABLE "model_runs", "invitations", "catalog_items", "skills", "user" IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
-- Catch-up: what the previous release wrote after backfill (and an installation that got its first rows only then).
INSERT INTO "organizations" ("name")
SELECT coalesce((SELECT split_part("email", '@', 2) FROM "user" ORDER BY ("role" = 'superuser') DESC, "created_at", "id" LIMIT 1), 'Organization')
WHERE NOT EXISTS (SELECT 1 FROM "organizations")
	AND (
		EXISTS (SELECT 1 FROM "user") OR EXISTS (SELECT 1 FROM "invitations") OR EXISTS (SELECT 1 FROM "catalog_items")
		OR EXISTS (SELECT 1 FROM "skills") OR EXISTS (SELECT 1 FROM "model_runs")
	);
--> statement-breakpoint
DO $$
DECLARE
	org uuid := (SELECT "id" FROM "organizations" ORDER BY "created_at", "id" LIMIT 1);
	t text;
BEGIN
	FOREACH t IN ARRAY ARRAY['user', 'invitations', 'model_runs', 'catalog_items', 'skills'] LOOP
		EXECUTE format('UPDATE %I SET "organization_id" = %L WHERE "organization_id" IS NULL', t, org);
		EXECUTE format('ALTER TABLE %I ALTER COLUMN "organization_id" DROP DEFAULT', t);
	END LOOP;
END $$;
--> statement-breakpoint
UPDATE "user" SET "org_role" = CASE "role" WHEN 'superuser' THEN 'owner' WHEN 'admin' THEN 'admin' ELSE 'member' END
WHERE "org_role" IS NULL;
--> statement-breakpoint
UPDATE "user" SET "org_role" = 'owner'
WHERE "id" = (SELECT "id" FROM "user" ORDER BY ("role" = 'admin') DESC, "created_at", "id" LIMIT 1)
	AND NOT EXISTS (SELECT 1 FROM "user" WHERE "org_role" = 'owner');
--> statement-breakpoint
UPDATE "invitations" SET "org_role" = CASE "role" WHEN 'admin' THEN 'admin' ELSE 'member' END
WHERE "org_role" IS NULL;
--> statement-breakpoint
ALTER TABLE "user" VALIDATE CONSTRAINT "user_org_role";--> statement-breakpoint
ALTER TABLE "invitations" VALIDATE CONSTRAINT "invitations_org_role";--> statement-breakpoint
ALTER TABLE "user" VALIDATE CONSTRAINT "user_organization_id_organizations_id_fk";--> statement-breakpoint
ALTER TABLE "invitations" VALIDATE CONSTRAINT "invitations_organization_id_organizations_id_fk";--> statement-breakpoint
ALTER TABLE "model_runs" VALIDATE CONSTRAINT "model_runs_organization_id_organizations_id_fk";--> statement-breakpoint
ALTER TABLE "catalog_items" VALIDATE CONSTRAINT "catalog_items_organization_id_organizations_id_fk";--> statement-breakpoint
ALTER TABLE "skills" VALIDATE CONSTRAINT "skills_organization_id_organizations_id_fk";--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "org_role" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ALTER COLUMN "org_role" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "model_runs" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_items" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "skills" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_items" DROP CONSTRAINT "catalog_items_key_unique";--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_org_key" UNIQUE("organization_id","key");--> statement-breakpoint
DROP INDEX "skills_shared_name";--> statement-breakpoint
CREATE UNIQUE INDEX "skills_shared_name" ON "skills" USING btree ("organization_id","name") WHERE "skills"."owner_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "user_org_owner" ON "user" USING btree ("organization_id") WHERE "user"."org_role" = 'owner';--> statement-breakpoint
CREATE INDEX "user_org" ON "user" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitations_org_open" ON "invitations" USING btree ("organization_id","expires_at");--> statement-breakpoint
CREATE INDEX "model_runs_org_time" ON "model_runs" USING btree ("organization_id","created_at");
