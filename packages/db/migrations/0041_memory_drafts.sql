CREATE TABLE "memory_drafts" (
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"sealed" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"write_id" uuid NOT NULL,
	CONSTRAINT "memory_drafts_status" CHECK ("memory_drafts"."status" in ('open', 'answered', 'dismissed'))
);
--> statement-breakpoint
ALTER TABLE "memory_drafts" ADD CONSTRAINT "memory_drafts_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_drafts" ADD CONSTRAINT "memory_drafts_write_id_memory_writes_id_fk" FOREIGN KEY ("write_id") REFERENCES "public"."memory_writes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_drafts_open" ON "memory_drafts" USING btree ("owner_id","created_at") WHERE "memory_drafts"."status" = 'open';--> statement-breakpoint
CREATE INDEX "memory_drafts_write" ON "memory_drafts" USING btree ("write_id");