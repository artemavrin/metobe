CREATE TABLE "updates" (
	"backup" jsonb,
	"by_user_id" text,
	"error" text,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL,
	"from_version" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restored" text,
	"started_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"to_version" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "updates" ADD CONSTRAINT "updates_by_user_id_user_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;