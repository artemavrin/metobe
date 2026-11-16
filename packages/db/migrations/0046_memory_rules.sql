-- «Убрано» gets its own key: a commitment's id as before, or a rule's id and a card's for a rhythm row (ARCH §19.6).
-- Filled from record_id before the key moves, so rows taken away earlier stay taken away.
ALTER TABLE "memory_dismissals" ADD COLUMN "entity_id" uuid;--> statement-breakpoint
ALTER TABLE "memory_dismissals" ADD COLUMN "key" text;--> statement-breakpoint
UPDATE "memory_dismissals" SET "key" = "record_id"::text;--> statement-breakpoint
ALTER TABLE "memory_dismissals" ALTER COLUMN "key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_dismissals" DROP CONSTRAINT "memory_dismissals_pkey";--> statement-breakpoint
ALTER TABLE "memory_dismissals" ADD PRIMARY KEY ("key");--> statement-breakpoint
ALTER TABLE "memory_records" ADD COLUMN "interval_days" integer;--> statement-breakpoint
ALTER TABLE "memory_records" ADD COLUMN "rule_kind" text;--> statement-breakpoint
ALTER TABLE "memory_records" ADD COLUMN "working_days" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_dismissals" ADD CONSTRAINT "memory_dismissals_entity_id_memory_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."memory_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_records" ADD CONSTRAINT "memory_records_rule" CHECK (("memory_records"."rule_kind" is null or ("memory_records"."kind" = 'rule' and "memory_records"."rule_kind" in ('rhythm', 'wait') and "memory_records"."interval_days" > 0))
          and ("memory_records"."interval_days" is null or "memory_records"."kind" = 'rule'));