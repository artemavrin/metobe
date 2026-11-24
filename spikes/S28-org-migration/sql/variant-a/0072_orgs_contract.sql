-- S28 step 3 of 3 — contract. Breaks the code of the releases before expand (they insert without organization_id), so
-- it ships one release after expand + backfill: an update over both runs all three in one transaction anyway.
-- drizzle runs every pending migration in one transaction, so the ACCESS EXCLUSIVE locks below are held to its end.
-- Locks first, children before "user": a write to model_runs/invitations/skills holds its table and then checks its FK
-- on "user"; taking "user" first deadlocked against such a write (S28, reproduced). Order = the order writers take them.
LOCK TABLE "model_runs", "invitations", "catalog_items", "skills", "user" IN ACCESS EXCLUSIVE MODE;
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
