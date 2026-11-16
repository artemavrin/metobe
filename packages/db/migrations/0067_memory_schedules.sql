ALTER TABLE "memory_records" DROP CONSTRAINT "memory_records_remind";--> statement-breakpoint
ALTER TABLE "memory_records" DROP CONSTRAINT "memory_records_kind";--> statement-breakpoint
ALTER TABLE "memory_records" DROP CONSTRAINT "memory_records_rule";--> statement-breakpoint
DROP INDEX "memory_records_remind";--> statement-breakpoint
ALTER TABLE "memory_records" ADD COLUMN "next_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memory_records" ADD COLUMN "fired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memory_records" ADD COLUMN "for_record_id" uuid;--> statement-breakpoint
ALTER TABLE "memory_records" ADD COLUMN "schedule_kind" text;--> statement-breakpoint
ALTER TABLE "memory_records" ADD CONSTRAINT "memory_records_for_record_id_memory_records_id_fk" FOREIGN KEY ("for_record_id") REFERENCES "public"."memory_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_records_next" ON "memory_records" USING btree ("next_at") WHERE "memory_records"."next_at" is not null and "memory_records"."done_at" is null and "memory_records"."superseded_at" is null and "memory_records"."deleted_at" is null;--> statement-breakpoint
-- D45: rhythms and dates are schedules, not rules — in place, so ids, the sealed texts and «Убрать» rows stay.
UPDATE "memory_records" SET "kind" = 'schedule', "schedule_kind" = "rule_kind", "rule_kind" = NULL
  WHERE "kind" = 'rule' AND "rule_kind" IN ('rhythm', 'date');--> statement-breakpoint
-- The person's own reminders, owed to nobody («напомни позвонить Ольге»): schedules, in place.
UPDATE "memory_records" r SET "kind" = 'schedule', "schedule_kind" = 'reminder', "status" = NULL, "important" = false,
    "next_at" = r."remind_at", "fired_at" = CASE WHEN r."status" = 'open' THEN r."reminded_at" END,
    "due_at" = NULL, "given_at" = NULL, "closed_by_write" = NULL
  WHERE r."kind" = 'commitment' AND r."remind_at" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "memory_record_entities" e JOIN "memory_entities" m ON m."id" = e."entity_id"
      WHERE e."record_id" = r."id" AND e."role" IN ('creditor', 'debtor') AND m."kind" <> 'self'
    );--> statement-breakpoint
DELETE FROM "memory_changes" c USING "memory_records" r
  WHERE c."record_id" = r."id" AND r."schedule_kind" = 'reminder';--> statement-breakpoint
-- A reminder about a promise to someone: a schedule of its own that points at it (no text of its own).
INSERT INTO "memory_records" ("id", "owner_id", "kind", "schedule_kind", "sealed", "for_record_id", "next_at",
    "fired_at", "repeat", "recorded_at", "write_id")
  SELECT gen_random_uuid(), r."owner_id", 'schedule', 'reminder', '', r."id", r."remind_at", r."reminded_at",
    r."repeat", r."recorded_at", r."write_id"
  FROM "memory_records" r
  WHERE r."kind" = 'commitment' AND r."remind_at" IS NOT NULL
    AND r."superseded_at" IS NULL AND r."deleted_at" IS NULL;--> statement-breakpoint
UPDATE "memory_records" SET "repeat" = NULL WHERE "kind" = 'commitment';--> statement-breakpoint
ALTER TABLE "memory_records" DROP COLUMN "remind_at";--> statement-breakpoint
ALTER TABLE "memory_records" DROP COLUMN "reminded_at";--> statement-breakpoint
ALTER TABLE "memory_records" ADD CONSTRAINT "memory_records_schedule" CHECK (("memory_records"."kind" = 'schedule') = ("memory_records"."schedule_kind" is not null)
          and ("memory_records"."schedule_kind" is null
            or ("memory_records"."schedule_kind" = 'reminder' and "memory_records"."next_at" is not null
              and ("memory_records"."repeat" is null or "memory_records"."repeat" in ('day', 'weekdays', 'week', 'month', 'year')))
            or ("memory_records"."schedule_kind" = 'date' and "memory_records"."occurred_at" is not null and "memory_records"."repeat" in ('year', 'month', 'week'))
            or ("memory_records"."schedule_kind" = 'rhythm' and "memory_records"."interval_days" > 0 and "memory_records"."repeat" is null))
          and ("memory_records"."repeat" is null or "memory_records"."kind" = 'schedule')
          and (("memory_records"."next_at" is null and "memory_records"."fired_at" is null and "memory_records"."for_record_id" is null)
            or "memory_records"."schedule_kind" = 'reminder'));--> statement-breakpoint
ALTER TABLE "memory_records" ADD CONSTRAINT "memory_records_kind" CHECK ("memory_records"."kind" in ('fact', 'assessment', 'event', 'commitment', 'rule', 'schedule'));--> statement-breakpoint
ALTER TABLE "memory_records" ADD CONSTRAINT "memory_records_rule" CHECK (("memory_records"."rule_kind" is null or ("memory_records"."kind" = 'rule' and "memory_records"."rule_kind" = 'wait' and "memory_records"."interval_days" > 0))
          and ("memory_records"."interval_days" is null or "memory_records"."rule_kind" = 'wait' or "memory_records"."schedule_kind" = 'rhythm'));