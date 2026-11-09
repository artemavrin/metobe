CREATE TABLE "memory_changes" (
	"after" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"before" text,
	"field" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"record_id" uuid NOT NULL,
	"write_id" uuid,
	CONSTRAINT "memory_changes_field" CHECK ("memory_changes"."field" in ('status', 'due', 'important'))
);
--> statement-breakpoint
ALTER TABLE "memory_changes" ADD CONSTRAINT "memory_changes_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_changes" ADD CONSTRAINT "memory_changes_record_id_memory_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."memory_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_changes" ADD CONSTRAINT "memory_changes_write_id_memory_writes_id_fk" FOREIGN KEY ("write_id") REFERENCES "public"."memory_writes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_changes_record" ON "memory_changes" USING btree ("record_id","at");--> statement-breakpoint
CREATE INDEX "memory_changes_write" ON "memory_changes" USING btree ("write_id");