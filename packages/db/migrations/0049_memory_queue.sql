ALTER TABLE "memory_writes" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_writes" ADD COLUMN "sent_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Writes made before the queue: their message time is as good as when they were made.
UPDATE "memory_writes" SET "sent_at" = "created_at";--> statement-breakpoint
ALTER TABLE "memory_writes" ADD COLUMN "time_zone" text;--> statement-breakpoint
CREATE INDEX "memory_writes_queue" ON "memory_writes" USING btree ("owner_id","status","sent_at");