-- Organizations, step 1 of 3 — expand (D48, ARCH §20.4, spike S28). The previous release keeps working on it: every
-- new column is nullable or has a default. The installation's one organization is made here, and `organization_id`
-- gets its id as the DEFAULT: rows that exist read it without being rewritten (PG 11+ keeps it once, in the catalog),
-- and rows the previous release writes after the update get it too. Contract drops the defaults — a release later, and
-- before anything can make a second organization.
-- Locks first, children before "user": a write to model_runs/invitations/skills holds its table and then checks its FK
-- on "user"; taking "user" first deadlocked against such a write (S28, 4 runs of 10). Order = the order writers take.
LOCK TABLE "model_runs", "invitations", "catalog_items", "skills", "user" IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
CREATE TABLE "organizations" (
	"billing" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_reason" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"time_zone" text DEFAULT 'Europe/Moscow' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	CONSTRAINT "organizations_status" CHECK ("organizations"."status" in ('trial', 'active', 'disabled')),
	CONSTRAINT "organizations_disabled_reason" CHECK ("organizations"."disabled_reason" in ('unpaid', 'manual'))
);
--> statement-breakpoint
-- The organization, only when the installation has anything to put in it: an unclaimed one gets it from the claim.
-- Name: the superuser's mail domain (ORGS-PLAN §13; the owner renames it). The organization's parts of `policies` are
-- copied, not moved: this release and the previous one still read them there (O3 moves them).
INSERT INTO "organizations" ("name", "settings")
SELECT
	coalesce(
		(SELECT split_part("email", '@', 2) FROM "user" ORDER BY ("role" = 'superuser') DESC, ("role" = 'admin') DESC, "created_at", "id" LIMIT 1),
		'Organization'
	),
	coalesce(jsonb_strip_nulls(jsonb_build_object(
		'access', s."policies" -> 'access',
		'personalConnections', s."policies" -> 'personalConnections',
		'personalApprovalDefaults', s."policies" -> 'personalApprovalDefaults',
		'privacy', s."policies" -> 'privacy'
	)), '{}'::jsonb)
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
ALTER TABLE "invitations" ADD COLUMN "org_role" text;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_org_role" CHECK ("user"."org_role" in ('owner', 'admin', 'member')) NOT VALID;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_role" CHECK ("invitations"."org_role" in ('admin', 'member')) NOT VALID;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "model_runs" ADD CONSTRAINT "model_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
