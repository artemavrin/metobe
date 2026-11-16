ALTER TABLE "memory_records" DROP CONSTRAINT "memory_records_status";--> statement-breakpoint
DROP INDEX "memory_records_due";--> statement-breakpoint
ALTER TABLE "memory_records" ADD COLUMN "important" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "memory_records_due" ON "memory_records" USING btree ("owner_id","due_at") WHERE "memory_records"."status" in ('open', 'unconfirmed') and "memory_records"."superseded_at" is null and "memory_records"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "memory_records" ADD CONSTRAINT "memory_records_important" CHECK (not "memory_records"."important" or "memory_records"."kind" = 'commitment');--> statement-breakpoint
ALTER TABLE "memory_records" ADD CONSTRAINT "memory_records_status" CHECK (("memory_records"."kind" = 'commitment') = ("memory_records"."status" is not null)
          and ("memory_records"."status" is null or "memory_records"."status" in ('open', 'unconfirmed', 'done', 'cancelled')));