ALTER TABLE "memory_records" DROP CONSTRAINT "memory_records_rule";--> statement-breakpoint
ALTER TABLE "memory_records" ADD COLUMN "repeat" text;--> statement-breakpoint
ALTER TABLE "memory_records" ADD CONSTRAINT "memory_records_rule" CHECK (("memory_records"."rule_kind" is null or ("memory_records"."kind" = 'rule' and (
            ("memory_records"."rule_kind" in ('rhythm', 'wait') and "memory_records"."interval_days" > 0)
            or ("memory_records"."rule_kind" = 'date' and "memory_records"."interval_days" is null and "memory_records"."repeat" in ('year', 'month', 'week') and "memory_records"."occurred_at" is not null))))
          and ("memory_records"."interval_days" is null or "memory_records"."kind" = 'rule')
          and ("memory_records"."repeat" is null or "memory_records"."rule_kind" = 'date'));