-- The text key (`stale:<id>`, `review:<owner>:<week>`, `merge:<a>:<b>`, `<rule>:<card>`…) becomes a kind and typed columns.
DROP INDEX "memory_dismissals_owner";--> statement-breakpoint
ALTER TABLE "memory_dismissals" RENAME COLUMN "due_at" TO "as_of";--> statement-breakpoint
ALTER TABLE "memory_dismissals" ADD COLUMN "day" date;--> statement-breakpoint
ALTER TABLE "memory_dismissals" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "memory_dismissals" ADD COLUMN "letter" text;--> statement-breakpoint
ALTER TABLE "memory_dismissals" ADD COLUMN "mailbox_id" uuid;--> statement-breakpoint
ALTER TABLE "memory_dismissals" ADD COLUMN "other_entity_id" uuid;--> statement-breakpoint
UPDATE "memory_dismissals" SET "kind" = 'commitment'
  WHERE "key" ~ '^[0-9a-f-]{36}$';--> statement-breakpoint
UPDATE "memory_dismissals" SET "kind" = 'rhythm'
  WHERE "key" ~ '^[0-9a-f-]{36}:[0-9a-f-]{36}$';--> statement-breakpoint
UPDATE "memory_dismissals" SET "kind" = 'date', "day" = right("key", 10)::date
  WHERE "key" ~ '^date:[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}$';--> statement-breakpoint
UPDATE "memory_dismissals" SET "kind" = 'keep' WHERE "key" ~ '^stale:[0-9a-f-]{36}$';--> statement-breakpoint
UPDATE "memory_dismissals" SET "kind" = 'reminded' WHERE "key" ~ '^reminded:[0-9a-f-]{36}$';--> statement-breakpoint
UPDATE "memory_dismissals" SET "kind" = 'review', "day" = right("key", 10)::date
  WHERE "key" = 'review:' || "owner_id" || ':' || right("key", 10) AND right("key", 10) ~ '^\d{4}-\d{2}-\d{2}$';--> statement-breakpoint
UPDATE "memory_dismissals" d SET "kind" = 'mail', "mailbox_id" = substr(d."key", 6, 36)::uuid, "letter" = substr(d."key", 43)
  WHERE d."key" ~ '^mail:[0-9a-f-]{36}:.+'
    AND EXISTS (SELECT 1 FROM "mailboxes" m WHERE m."id"::text = substr(d."key", 6, 36));--> statement-breakpoint
UPDATE "memory_dismissals" SET "kind" = 'mail_offer' WHERE "key" = 'offer:mail:' || "owner_id";--> statement-breakpoint
UPDATE "memory_dismissals" d SET "kind" = 'merge_pair', "entity_id" = substr(d."key", 7, 36)::uuid, "other_entity_id" = substr(d."key", 44, 36)::uuid
  WHERE d."key" ~ '^merge:[0-9a-f-]{36}:[0-9a-f-]{36}$'
    AND EXISTS (SELECT 1 FROM "memory_entities" e WHERE e."id"::text = substr(d."key", 7, 36))
    AND EXISTS (SELECT 1 FROM "memory_entities" e WHERE e."id"::text = substr(d."key", 44, 36));--> statement-breakpoint
-- A row whose key is none of these (or whose box or card is gone) took nothing away any more.
DELETE FROM "memory_dismissals" WHERE "kind" IS NULL;--> statement-breakpoint
ALTER TABLE "memory_dismissals" ALTER COLUMN "kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_dismissals" DROP CONSTRAINT "memory_dismissals_pkey";--> statement-breakpoint
ALTER TABLE "memory_dismissals" DROP COLUMN "key";--> statement-breakpoint
ALTER TABLE "memory_dismissals" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_dismissals" ADD CONSTRAINT "memory_dismissals_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_dismissals" ADD CONSTRAINT "memory_dismissals_other_entity_id_memory_entities_id_fk" FOREIGN KEY ("other_entity_id") REFERENCES "public"."memory_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_dismissals" ADD CONSTRAINT "memory_dismissals_target" UNIQUE NULLS NOT DISTINCT("owner_id","kind","record_id","entity_id","other_entity_id","mailbox_id","letter","day");--> statement-breakpoint
ALTER TABLE "memory_dismissals" ADD CONSTRAINT "memory_dismissals_kind" CHECK ("memory_dismissals"."kind" in ('commitment', 'rhythm', 'date', 'keep', 'reminded', 'review', 'mail', 'mail_offer', 'merge_pair'));
