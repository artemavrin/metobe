-- Rollback of contract (by hand or a future «down» step): back to the expanded schema, data kept — with the defaults,
-- so that the release before expand can run on it again. Only while there is one organization.
-- catalog_items_key_unique comes back only while every key is unique across the installation (one organization: yes).
LOCK TABLE "model_runs", "invitations", "catalog_items", "skills", "user" IN ACCESS EXCLUSIVE MODE;
DROP INDEX IF EXISTS "model_runs_org_time";
DROP INDEX IF EXISTS "invitations_org_open";
DROP INDEX IF EXISTS "user_org";
DROP INDEX IF EXISTS "user_org_owner";
DROP INDEX IF EXISTS "skills_shared_name";
CREATE UNIQUE INDEX "skills_shared_name" ON "skills" USING btree ("name") WHERE "skills"."owner_id" is null;
ALTER TABLE "catalog_items" DROP CONSTRAINT IF EXISTS "catalog_items_org_key";
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_key_unique" UNIQUE("key");
ALTER TABLE "skills" ALTER COLUMN "organization_id" DROP NOT NULL;
ALTER TABLE "catalog_items" ALTER COLUMN "organization_id" DROP NOT NULL;
ALTER TABLE "model_runs" ALTER COLUMN "organization_id" DROP NOT NULL;
ALTER TABLE "invitations" ALTER COLUMN "org_role" DROP NOT NULL;
ALTER TABLE "invitations" ALTER COLUMN "organization_id" DROP NOT NULL;
ALTER TABLE "user" ALTER COLUMN "org_role" DROP NOT NULL;
ALTER TABLE "user" ALTER COLUMN "organization_id" DROP NOT NULL;
DO $$
DECLARE
	org uuid := (SELECT "id" FROM "organizations" ORDER BY "created_at", "id" LIMIT 1);
	t text;
BEGIN
	IF org IS NOT NULL THEN
		FOREACH t IN ARRAY ARRAY['user', 'invitations', 'model_runs', 'catalog_items', 'skills'] LOOP
			EXECUTE format('ALTER TABLE %I ALTER COLUMN "organization_id" SET DEFAULT %L', t, org);
		END LOOP;
	END IF;
END $$;
