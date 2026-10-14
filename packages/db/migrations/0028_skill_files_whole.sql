ALTER TABLE "skill_files" ALTER COLUMN "content" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "skill_files" ADD COLUMN "data" "bytea";--> statement-breakpoint
ALTER TABLE "skill_files" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "skill_files" ADD COLUMN "media_type" text;--> statement-breakpoint
ALTER TABLE "skill_files" ADD COLUMN "storage_key" text;