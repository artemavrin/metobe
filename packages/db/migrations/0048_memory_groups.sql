ALTER TABLE "memory_entities" DROP CONSTRAINT "memory_entities_kind";--> statement-breakpoint
ALTER TABLE "memory_record_entities" DROP CONSTRAINT "memory_record_entities_role";--> statement-breakpoint
ALTER TABLE "memory_entities" ADD CONSTRAINT "memory_entities_kind" CHECK ("memory_entities"."kind" in ('self', 'person', 'org', 'project', 'group'));--> statement-breakpoint
ALTER TABLE "memory_record_entities" ADD CONSTRAINT "memory_record_entities_role" CHECK ("memory_record_entities"."role" in ('about', 'participant', 'debtor', 'creditor', 'subject', 'group'));