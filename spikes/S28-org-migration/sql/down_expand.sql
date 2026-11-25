-- Rollback of expand + backfill: the schema of the release before; nothing of the old data is lost
-- (the backfill only copied policies). DROP COLUMN is metadata-only; the dropped space is reclaimed by later writes.
LOCK TABLE "model_runs", "invitations", "catalog_items", "skills", "user" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "skills" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "catalog_items" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "model_runs" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "invitations" DROP CONSTRAINT IF EXISTS "invitations_org_role";
ALTER TABLE "invitations" DROP COLUMN IF EXISTS "org_role";
ALTER TABLE "invitations" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_org_role";
ALTER TABLE "user" DROP COLUMN IF EXISTS "blocked_at";
ALTER TABLE "user" DROP COLUMN IF EXISTS "org_role";
ALTER TABLE "user" DROP COLUMN IF EXISTS "organization_id";
DROP TABLE IF EXISTS "organizations";
