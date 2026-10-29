ALTER TABLE "updates" ADD COLUMN "operation" text DEFAULT 'install' NOT NULL;--> statement-breakpoint
ALTER TABLE "updates" ADD COLUMN "rollback_backup" jsonb;--> statement-breakpoint
ALTER TABLE "updates" ADD COLUMN "trigger" text DEFAULT 'manual' NOT NULL;