-- S28 step 1 of 3 — expand. New table and nullable columns only: the code of the previous release keeps working.
-- Every statement here is metadata-only or touches empty data; FKs are NOT VALID (no scan), VALIDATE is in contract.
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
ALTER TABLE "user" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "org_role" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "blocked_at" timestamp;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "org_role" text;--> statement-breakpoint
ALTER TABLE "model_runs" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_org_role" CHECK ("user"."org_role" in ('owner', 'admin', 'member')) NOT VALID;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_role" CHECK ("invitations"."org_role" in ('admin', 'member')) NOT VALID;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "model_runs" ADD CONSTRAINT "model_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action NOT VALID;
