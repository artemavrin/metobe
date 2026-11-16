ALTER TABLE "memory_records" DROP CONSTRAINT "memory_records_schedule";--> statement-breakpoint
ALTER TABLE "memory_records" ADD COLUMN "repeat_days" smallint[];--> statement-breakpoint
ALTER TABLE "memory_records" ADD CONSTRAINT "memory_records_schedule" CHECK (("memory_records"."kind" = 'schedule') = ("memory_records"."schedule_kind" is not null)
          and ("memory_records"."schedule_kind" is null
            or ("memory_records"."schedule_kind" = 'reminder' and "memory_records"."next_at" is not null
              and ("memory_records"."repeat" is null or "memory_records"."repeat" in ('day', 'weekdays', 'week', 'month', 'year')))
            or ("memory_records"."schedule_kind" = 'date' and "memory_records"."occurred_at" is not null and "memory_records"."repeat" in ('year', 'month', 'week'))
            or ("memory_records"."schedule_kind" = 'rhythm' and "memory_records"."interval_days" > 0 and "memory_records"."repeat" is null))
          and ("memory_records"."repeat" is null or "memory_records"."kind" = 'schedule')
          and ("memory_records"."repeat_days" is null or ("memory_records"."schedule_kind" = 'reminder' and "memory_records"."repeat" = 'week'))
          and (("memory_records"."next_at" is null and "memory_records"."fired_at" is null and "memory_records"."for_record_id" is null)
            or "memory_records"."schedule_kind" = 'reminder'));