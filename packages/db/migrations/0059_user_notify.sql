ALTER TABLE "user" ADD COLUMN "notify_email" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "notify_telegram" boolean DEFAULT true NOT NULL;