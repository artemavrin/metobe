-- S28 step 2 of 3 — backfill (drizzle-kit generate --custom). Idempotent: every statement fills only what is still null.
-- One organization for the whole installation, made only when the installation has anything to put in it: an unclaimed
-- installation gets its organization from the claim. Its name: the superuser's mail domain (the owner renames it).
-- The organization's parts of `policies` are copied, not moved: the previous release still reads them (O3 removes them).
INSERT INTO "organizations" ("name", "settings")
SELECT
	coalesce(
		(SELECT split_part("email", '@', 2) FROM "user" ORDER BY ("role" = 'superuser') DESC, ("role" = 'admin') DESC, "created_at", "id" LIMIT 1),
		'Organization'
	),
	jsonb_strip_nulls(jsonb_build_object(
		'access', s."policies" -> 'access',
		'personalConnections', s."policies" -> 'personalConnections',
		'personalApprovalDefaults', s."policies" -> 'personalApprovalDefaults',
		'privacy', s."policies" -> 'privacy'
	))
FROM (SELECT 1) AS one
LEFT JOIN "system_settings" AS s ON s."id" = 1
WHERE NOT EXISTS (SELECT 1 FROM "organizations")
	AND (
		EXISTS (SELECT 1 FROM "user") OR EXISTS (SELECT 1 FROM "invitations") OR EXISTS (SELECT 1 FROM "catalog_items")
		OR EXISTS (SELECT 1 FROM "skills") OR EXISTS (SELECT 1 FROM "model_runs")
	);
--> statement-breakpoint
UPDATE "user" SET "organization_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at", "id" LIMIT 1)
WHERE "organization_id" IS NULL;
--> statement-breakpoint
UPDATE "user" SET "org_role" = CASE "role" WHEN 'superuser' THEN 'owner' WHEN 'admin' THEN 'admin' ELSE 'member' END
WHERE "org_role" IS NULL;
--> statement-breakpoint
-- Exactly one owner: no superuser (an installation that lost it) — the oldest admin, else the oldest person.
UPDATE "user" SET "org_role" = 'owner'
WHERE "id" = (SELECT "id" FROM "user" ORDER BY ("role" = 'admin') DESC, "created_at", "id" LIMIT 1)
	AND NOT EXISTS (SELECT 1 FROM "user" WHERE "org_role" = 'owner');
--> statement-breakpoint
UPDATE "invitations" SET
	"organization_id" = coalesce("organization_id", (SELECT "id" FROM "organizations" ORDER BY "created_at", "id" LIMIT 1)),
	"org_role" = coalesce("org_role", CASE "role" WHEN 'admin' THEN 'admin' ELSE 'member' END)
WHERE "organization_id" IS NULL OR "org_role" IS NULL;
--> statement-breakpoint
UPDATE "catalog_items" SET "organization_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at", "id" LIMIT 1)
WHERE "organization_id" IS NULL;
--> statement-breakpoint
UPDATE "skills" SET "organization_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at", "id" LIMIT 1)
WHERE "organization_id" IS NULL;
--> statement-breakpoint
UPDATE "model_runs" SET "organization_id" = (SELECT "id" FROM "organizations" ORDER BY "created_at", "id" LIMIT 1)
WHERE "organization_id" IS NULL;
