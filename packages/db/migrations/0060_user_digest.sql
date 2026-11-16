ALTER TABLE "user" ADD COLUMN "digest_time" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "digest_sent_on" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "digest_keys" jsonb;