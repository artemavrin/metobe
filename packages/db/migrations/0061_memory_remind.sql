ALTER TABLE "memory_records" ADD COLUMN "remind_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memory_records" ADD COLUMN "reminded_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "memory_records_remind" ON "memory_records" USING btree ("remind_at") WHERE "memory_records"."remind_at" is not null and "memory_records"."reminded_at" is null;--> statement-breakpoint
ALTER TABLE "memory_records" ADD CONSTRAINT "memory_records_remind" CHECK ("memory_records"."remind_at" is null or "memory_records"."kind" = 'commitment');