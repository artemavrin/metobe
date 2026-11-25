-- S28 step 1 of 3 — expand. The previous release's code keeps working on it: every new column is nullable or has a
-- default. The installation's one organization is made here, and `organization_id` gets its id as the DEFAULT: rows
-- that exist read it without being rewritten (PG 11+ stores it once, in the catalog), and rows the previous release
-- writes during the update get it too. Contract drops the defaults — before a second organization can appear.
-- Locks first, children before "user": a write to model_runs/invitations/skills holds its table and then checks its FK
-- on "user"; taking "user" first deadlocked against such a write (S28, reproduced). Order = the order writers take them.
LOCK TABLE "model_runs", "invitations", "catalog_items", "skills", "user" IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"disabled_reason" text,
	"trial_ends_at" timestamp with time zone,
	"time_zone" text DEFAULT 'Europe/Moscow' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"billing" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_status" CHECK ("organizations"."status" in ('trial', 'active', 'disabled')),
	CONSTRAINT "organizations_disabled_reason" CHECK ("organizations"."disabled_reason" in ('unpaid', 'manual'))
);
--> statement-breakpoint
-- The organization, only when the installation has anything to put in it: an unclaimed one gets it from the claim.
-- Name: the superuser's mail domain (the owner renames it). The organization's parts of `policies` are copied, not
-- moved: the previous release still reads them there (O3 removes them).
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
DO $$
DECLARE
	org uuid := (SELECT "id" FROM "organizations" ORDER BY "created_at", "id" LIMIT 1);
	t text;
BEGIN
	FOREACH t IN ARRAY ARRAY['user', 'invitations', 'model_runs', 'catalog_items', 'skills'] LOOP
		IF org IS NULL THEN
			EXECUTE format('ALTER TABLE %I ADD COLUMN "organization_id" uuid', t);
		ELSE
			EXECUTE format('ALTER TABLE %I ADD COLUMN "organization_id" uuid DEFAULT %L', t, org);
		END IF;
	END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "org_role" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "blocked_at" timestamp;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "org_role" text;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_org_role" CHECK ("user"."org_role" in ('owner', 'admin', 'member')) NOT VALID;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_role" CHECK ("invitations"."org_role" in ('admin', 'member')) NOT VALID;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "model_runs" ADD CONSTRAINT "model_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
