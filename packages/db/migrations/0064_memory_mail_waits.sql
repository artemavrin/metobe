CREATE TABLE "memory_mail_waits" (
	"answered_at" timestamp with time zone,
	"entity_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"mailbox_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"sealed" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "memory_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD COLUMN "memory_reads" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_mail_waits" ADD CONSTRAINT "memory_mail_waits_entity_id_memory_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."memory_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_mail_waits" ADD CONSTRAINT "memory_mail_waits_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_mail_waits" ADD CONSTRAINT "memory_mail_waits_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_mail_waits_owner" ON "memory_mail_waits" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memory_mail_waits_letter" ON "memory_mail_waits" USING btree ("mailbox_id","key");