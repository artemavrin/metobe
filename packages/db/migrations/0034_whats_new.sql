ALTER TABLE "user" ADD COLUMN "whats_new_seen" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "whats_new_off" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Everyone already here was on 0.5.1 or earlier: the first window they see is the next release's. A new account
-- starts with null, and its first visit marks the version it came in on as seen.
UPDATE "user" SET "whats_new_seen" = '0.5.1';
