DROP INDEX "memory_writes_message";--> statement-breakpoint
ALTER TABLE "memory_writes" ADD COLUMN "source" text DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_writes" ADD COLUMN "source_key" text;--> statement-breakpoint
UPDATE "memory_writes" SET "source_key" = "message_id"::text;--> statement-breakpoint
ALTER TABLE "memory_writes" ALTER COLUMN "source_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_writes" DROP COLUMN "message_id";--> statement-breakpoint
CREATE UNIQUE INDEX "memory_writes_source" ON "memory_writes" USING btree ("owner_id","source","source_key");
